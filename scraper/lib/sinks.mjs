/**
 * Destinos de escritura del scraper.
 *
 * Son dos y sirven para cosas distintas:
 *   - Supabase guarda el HISTÓRICO (una fila por observación, nada se pisa).
 *   - data/prices.json guarda el ESTADO VIGENTE, que es lo que la PWA precachea
 *     y lo que hace que la app funcione sin señal dentro del súper.
 *
 * Si Supabase no está configurado, el archivo por sí solo ya deja la app
 * funcionando: la base es una mejora, no un requisito.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRICES_JSON = path.join(ROOT, 'data', 'prices.json');

// ---------------------------------------------------------------------------
// data/prices.json
// ---------------------------------------------------------------------------

/**
 * Reescribe data/prices.json con las observaciones consolidadas.
 * Conserva los precios previos de las tiendas que esta corrida no tocó, para
 * que un adaptador que sólo cubre 5 cadenas no borre la sexta.
 */
export async function escribirPricesJson(observaciones, meta = {}) {
  const products = {};
  for (const obs of observaciones) {
    if (!products[obs.ean]) products[obs.ean] = {};
    products[obs.ean][obs.storeId] = obs.price;
  }

  const documento = {
    generatedAt: new Date().toISOString(),
    source: meta.source || 'scraper',
    sourceLabel: meta.sourceLabel || 'Scraper automatizado',
    currency: 'MXN',
    region: 'Queretaro, Qro., MX',
    postalCode: '76000',
    products: Object.fromEntries(
      Object.entries(products)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ean, byStore]) => [ean, Object.fromEntries(Object.entries(byStore).sort())])
    )
  };

  await writeFile(PRICES_JSON, JSON.stringify(documento, null, 2) + '\n', 'utf8');
  return { ruta: path.relative(ROOT, PRICES_JSON), productos: Object.keys(documento.products).length };
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export function supabaseConfigurado() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function cabecerasSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  };
}

/**
 * Inserta las observaciones en price_observations, por lotes.
 * Requiere la service_role key: es la única que salta RLS. Esa llave vive en
 * variables de entorno o en el secreto de CI, nunca en el repo ni en el cliente.
 */
export async function escribirSupabase(observaciones, { log = console.log } = {}) {
  if (!supabaseConfigurado()) {
    log('  Supabase no configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY); se omite.');
    return { escritas: 0, omitido: true };
  }

  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/price_observations`;
  const LOTE = 500;
  let escritas = 0;

  for (let i = 0; i < observaciones.length; i += LOTE) {
    const lote = observaciones.slice(i, i + LOTE).map(o => ({
      ean: o.ean,
      store_id: o.storeId,
      price: o.price,
      currency: 'MXN',
      captured_at: o.capturedAt || new Date().toISOString(),
      source: o.source,
      source_url: o.sourceUrl || null,
      raw: o.raw || null
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: cabecerasSupabase(),
      body: JSON.stringify(lote)
    });

    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 400);
      throw new Error(`Supabase rechazó el lote ${i / LOTE + 1}: HTTP ${res.status} ${detalle}`);
    }
    escritas += lote.length;
    log(`  Supabase: ${escritas}/${observaciones.length} observaciones`);
  }

  return { escritas, omitido: false };
}

/** Registra la corrida en scrape_runs para poder auditar el pipeline. */
export async function registrarCorrida(datos) {
  if (!supabaseConfigurado()) return null;

  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/scrape_runs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...cabecerasSupabase(), Prefer: 'return=representation' },
    body: JSON.stringify([{
      source: datos.source,
      status: datos.status,
      finished_at: new Date().toISOString(),
      products_seen: datos.productsSeen || 0,
      prices_written: datos.pricesWritten || 0,
      errors: datos.errors && datos.errors.length ? datos.errors : null
    }])
  });

  if (!res.ok) {
    console.warn('  No se pudo registrar la corrida:', res.status);
    return null;
  }
  return res.json();
}
