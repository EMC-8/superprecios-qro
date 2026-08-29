/**
 * Adaptador de captura manual.
 *
 * Existe porque hoy es la única forma de obtener precios de HEB y de cualquier
 * SKU que PROFECO no muestree. Alguien va al súper (o mira el sitio), anota
 * precios en un CSV, y el resto del pipeline los trata igual que a los
 * automáticos: se validan, se consolidan, se guardan con fecha y con fuente.
 *
 * Formato de scraper/data-manual/*.csv:
 *
 *   ean,store_id,price,captured_at,branch,note
 *   7501020513478,heb,29.90,2026-08-29,HEB Juriquilla,precio de anaquel
 *
 *   - ean         : EAN-13 del catálogo (obligatorio)
 *   - store_id    : id de tienda del catálogo (obligatorio)
 *   - price       : número, punto decimal (obligatorio)
 *   - captured_at : YYYY-MM-DD; si se omite se usa la fecha de la corrida
 *   - branch      : texto libre, sólo informativo
 *   - note        : texto libre
 *
 * Las líneas que empiezan con # se ignoran.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseCsvLine } from '../lib/http.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(AQUI, '..', 'data-manual');

export async function obtenerPrecios({ log = console.log } = {}) {
  let archivos = [];
  try {
    archivos = (await readdir(DIR)).filter(f => f.toLowerCase().endsWith('.csv'));
  } catch (e) {
    log('  No existe scraper/data-manual/; nada que leer.');
    return { observaciones: [], sugerencias: [], meta: { source: 'captura-manual' } };
  }

  if (archivos.length === 0) {
    log('  scraper/data-manual/ está vacío.');
    return { observaciones: [], sugerencias: [], meta: { source: 'captura-manual' } };
  }

  const observaciones = [];
  const problemas = [];

  for (const archivo of archivos) {
    const texto = await readFile(path.join(DIR, archivo), 'utf8');
    const lineas = texto.split(/\r?\n/);
    let encabezado = null;

    lineas.forEach((linea, i) => {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith('#')) return;

      const cols = parseCsvLine(linea);
      if (!encabezado) {
        encabezado = cols.map(c => c.trim().toLowerCase());
        return;
      }

      const fila = {};
      encabezado.forEach((h, idx) => { fila[h] = (cols[idx] || '').trim(); });

      if (!fila.ean || !fila.store_id || !fila.price) {
        problemas.push(`${archivo}:${i + 1} fila incompleta`);
        return;
      }

      const precio = Number(fila.price);
      if (!Number.isFinite(precio) || precio <= 0) {
        problemas.push(`${archivo}:${i + 1} precio inválido "${fila.price}"`);
        return;
      }

      observaciones.push({
        ean: fila.ean,
        storeId: fila.store_id,
        price: Math.round(precio * 100) / 100,
        capturedAt: fila.captured_at
          ? new Date(`${fila.captured_at}T12:00:00Z`).toISOString()
          : new Date().toISOString(),
        source: 'captura-manual',
        sourceUrl: null,
        raw: { archivo, branch: fila.branch || null, note: fila.note || null }
      });
    });

    log(`  ${archivo}: ${observaciones.length} acumuladas`);
  }

  if (problemas.length) {
    log(`  ⚠️  ${problemas.length} filas descartadas:`);
    for (const p of problemas.slice(0, 10)) log(`     ${p}`);
  }

  return {
    observaciones,
    sugerencias: [],
    meta: { source: 'captura-manual', archivos: archivos.length }
  };
}

export const adaptador = {
  id: 'manual',
  nombre: 'Captura manual (CSV)',
  automatizable: false,
  cadenas: ['aurrera', 'chedraui', 'walmart', 'soriana', 'lacomer', 'heb'],
  obtenerPrecios
};
