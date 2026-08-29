#!/usr/bin/env node
/**
 * Orquestador del scraper de SuperPrecios QRO.
 *
 *   node scraper/run.mjs                      # corre todos los adaptadores
 *   node scraper/run.mjs --only profeco       # sólo uno
 *   node scraper/run.mjs --dry-run            # no escribe nada, sólo reporta
 *   node scraper/run.mjs --sugerencias        # lista lo que no empató, para mapear
 *
 * Flujo: adaptadores -> validación -> consolidación -> Supabase + data/prices.json
 *
 * Nada llega a la app sin pasar por validación: un precio mal empatado es peor
 * que un precio ausente, porque el ausente se avisa y el equivocado no.
 */

import { PRODUCTS_CATALOG, SUPERMARKETS } from '../js/data.js';
import { validarObservacion, consolidar } from './lib/normalize.mjs';
import {
  escribirPricesJson,
  escribirSupabase,
  registrarCorrida,
  supabaseConfigurado
} from './lib/sinks.mjs';

import { adaptador as profeco } from './adapters/profeco.mjs';
import { adaptador as chedraui } from './adapters/chedraui.mjs';
import { adaptador as manual } from './adapters/csv-manual.mjs';

const ADAPTADORES = [chedraui, profeco, manual];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const soloUno = valor('--only');
const dryRun = flag('--dry-run');
const verSugerencias = flag('--sugerencias');

const log = (...a) => console.log(...a);

const eansValidos = new Set(PRODUCTS_CATALOG.map(p => p.ean));
const tiendasValidas = new Set(Object.keys(SUPERMARKETS));

log('\n═══ SuperPrecios QRO — scraper ═══\n');
if (dryRun) log('MODO SIMULACIÓN: no se escribe nada.\n');

const seleccionados = soloUno
  ? ADAPTADORES.filter(a => a.id === soloUno)
  : ADAPTADORES;

if (seleccionados.length === 0) {
  console.error(`No existe el adaptador "${soloUno}". Disponibles: ${ADAPTADORES.map(a => a.id).join(', ')}`);
  process.exit(1);
}

const todasObservaciones = [];
const todasSugerencias = [];
const errores = [];

for (const adaptador of seleccionados) {
  log(`▶ ${adaptador.nombre}`);
  try {
    const { observaciones, sugerencias } = await adaptador.obtenerPrecios({ log });

    // Validación: lo que no cumpla se descarta con motivo, no se cuela.
    const validas = [];
    const rechazos = [];
    for (const obs of observaciones) {
      const problemas = validarObservacion(obs, { eansValidos, tiendasValidas });
      if (problemas.length === 0) validas.push(obs);
      else rechazos.push({ obs, problemas });
    }

    if (rechazos.length) {
      log(`  ⚠️  ${rechazos.length} observaciones descartadas por validación:`);
      for (const r of rechazos.slice(0, 5)) {
        log(`     ${r.obs.ean}/${r.obs.storeId}: ${r.problemas.join('; ')}`);
      }
    }

    log(`  ✔ ${validas.length} observaciones válidas\n`);
    todasObservaciones.push(...validas);
    todasSugerencias.push(...(sugerencias || []).map(s => ({ ...s, adaptador: adaptador.id })));
  } catch (err) {
    log(`  ✖ Falló: ${err.message}\n`);
    errores.push({ adaptador: adaptador.id, error: err.message });
  }
}

// --- Sugerencias de mapeo -----------------------------------------------------
if (verSugerencias && todasSugerencias.length) {
  log('─── Productos sin empatar (candidatos para el mapeo) ───');
  for (const s of todasSugerencias.slice(0, 50)) {
    log(`  ${String(s.veces).padStart(4)}×  ${s.clave}`);
  }
  log('');
  log('Para incorporar alguno, agrega una entrada en');
  log('scraper/mappings/profeco-queretaro.json con su EAN y los términos que lo identifican.\n');
}

if (todasObservaciones.length === 0) {
  log('No se obtuvo ningún precio. No se escribe nada.\n');
  await registrarCorrida({
    source: soloUno || 'todos',
    status: 'failed',
    errors: errores
  });
  process.exit(errores.length ? 1 : 0);
}

// --- Consolidación ------------------------------------------------------------
const consolidadas = consolidar(todasObservaciones);
log(`─── Consolidación ───`);
log(`  ${todasObservaciones.length} observaciones → ${consolidadas.length} precios vigentes`);

const conVariacion = consolidadas.filter(o => o.precioMax > o.precioMin);
if (conVariacion.length) {
  log(`  ${conVariacion.length} con diferencia entre sucursales (se usa la mediana):`);
  for (const o of conVariacion.slice(0, 5)) {
    const prod = PRODUCTS_CATALOG.find(p => p.ean === o.ean);
    log(`     ${prod ? prod.name.slice(0, 40) : o.ean} @ ${o.storeId}: $${o.precioMin}–$${o.precioMax} → $${o.price}`);
  }
}

const porTienda = {};
for (const o of consolidadas) porTienda[o.storeId] = (porTienda[o.storeId] || 0) + 1;
log('  Cobertura por tienda:');
for (const id of Object.keys(SUPERMARKETS)) {
  const n = porTienda[id] || 0;
  log(`     ${SUPERMARKETS[id].shortName.padEnd(10)} ${n}/${PRODUCTS_CATALOG.length}${n === 0 ? '  ← sin datos' : ''}`);
}
log('');

// --- Escritura ----------------------------------------------------------------
if (dryRun) {
  log('Simulación: no se escribió nada.\n');
  process.exit(0);
}

log('─── Escritura ───');

let escritasDb = 0;
try {
  const r = await escribirSupabase(todasObservaciones, { log });
  escritasDb = r.escritas;
} catch (err) {
  log(`  ⚠️  Supabase falló: ${err.message}`);
  errores.push({ adaptador: 'supabase', error: err.message });
}

const archivo = await escribirPricesJson(consolidadas, {
  source: seleccionados.map(a => a.id).join('+'),
  sourceLabel: seleccionados.map(a => a.nombre).join(' + ')
});
log(`  ✔ ${archivo.ruta} (${archivo.productos} productos)`);

await registrarCorrida({
  source: seleccionados.map(a => a.id).join('+'),
  status: errores.length ? 'partial' : 'ok',
  productsSeen: consolidadas.length,
  pricesWritten: escritasDb,
  errors: errores
});

log('');
log(supabaseConfigurado()
  ? '✔ Listo. Histórico en Supabase y estado vigente en data/prices.json.'
  : '✔ Listo. data/prices.json actualizado (Supabase no configurado).');
log('  Verifica con: npm run validate:prices\n');

process.exit(errores.length ? 1 : 0);
