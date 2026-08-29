#!/usr/bin/env node
/**
 * Valida data/prices.json contra el contrato que consume la app.
 *
 * Está pensado para correrse al final de un scraper y en CI: si este script
 * sale con código 0, la app va a poder usar el archivo sin sorpresas.
 *
 *   node scripts/validate-prices.mjs [ruta/al/prices.json]
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { sanitizePriceTable } from '../js/prices.js';
import { PRODUCTS_CATALOG, SUPERMARKETS } from '../js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || path.join(ROOT, 'data', 'prices.json');

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

let raw;
try {
  raw = JSON.parse(await readFile(target, 'utf8'));
} catch (err) {
  console.error(`${RED}✖ No se pudo leer ${target}${OFF}\n  ${err.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// --- Metadatos obligatorios ---
if (!raw.generatedAt) {
  errors.push('Falta "generatedAt" (ISO-8601). La app lo usa para decir qué tan viejos son los precios.');
} else if (Number.isNaN(new Date(raw.generatedAt).getTime())) {
  errors.push(`"generatedAt" no es una fecha válida: ${raw.generatedAt}`);
} else {
  const days = (Date.now() - new Date(raw.generatedAt).getTime()) / 86400000;
  if (days > 14) warnings.push(`Los precios tienen ${Math.floor(days)} días; la app los marcará como viejos.`);
  if (days < -1) errors.push('"generatedAt" está en el futuro.');
}
if (!raw.currency) warnings.push('Falta "currency"; se asumirá MXN.');
if (!raw.sourceLabel) warnings.push('Falta "sourceLabel"; el usuario no sabrá de dónde salen los precios.');

// --- Contenido ---
const { products, issues } = sanitizePriceTable(raw);
for (const i of issues) errors.push(i);

const catalogEans = PRODUCTS_CATALOG.map(p => p.ean);
const storeIds = Object.keys(SUPERMARKETS);

const sinPrecio = catalogEans.filter(ean => !products[ean]);
const porTienda = Object.fromEntries(storeIds.map(id => [id, 0]));
let totalPrecios = 0;

for (const byStore of Object.values(products)) {
  for (const storeId of Object.keys(byStore)) {
    porTienda[storeId]++;
    totalPrecios++;
  }
}

if (Object.keys(products).length === 0) {
  errors.push('El archivo no dejó ni un solo precio utilizable tras validar.');
}

// --- Reporte ---
const cobertura = catalogEans.length > 0
  ? Math.round((Object.keys(products).length / catalogEans.length) * 100)
  : 0;

console.log(`\n${DIM}Validando${OFF} ${path.relative(ROOT, target)}\n`);
console.log(`  Productos del catálogo : ${catalogEans.length}`);
console.log(`  Con al menos un precio : ${Object.keys(products).length} (${cobertura}%)`);
console.log(`  Precios totales        : ${totalPrecios}`);
console.log(`  Generado               : ${raw.generatedAt || '—'}\n`);

console.log('  Precios por tienda:');
for (const id of storeIds) {
  const n = porTienda[id];
  const marca = n === 0 ? `${RED}sin datos${OFF}` : `${n}/${catalogEans.length}`;
  console.log(`    ${SUPERMARKETS[id].shortName.padEnd(10)} ${marca}`);
  if (n === 0) warnings.push(`${SUPERMARKETS[id].name} no tiene ningún precio; quedará fuera de toda comparación.`);
}

if (sinPrecio.length > 0) {
  console.log(`\n  ${YELLOW}Productos sin ningún precio (${sinPrecio.length}):${OFF}`);
  for (const ean of sinPrecio) {
    const prod = PRODUCTS_CATALOG.find(p => p.ean === ean);
    console.log(`    ${ean}  ${prod ? prod.name : ''}`);
  }
  warnings.push(`${sinPrecio.length} productos del catálogo no tienen precio en ninguna tienda.`);
}

if (warnings.length > 0) {
  console.log(`\n${YELLOW}Avisos:${OFF}`);
  for (const w of warnings) console.log(`  ⚠️  ${w}`);
}

if (errors.length > 0) {
  console.log(`\n${RED}Errores:${OFF}`);
  for (const e of errors) console.log(`  ✖  ${e}`);
  console.log(`\n${RED}✖ El archivo NO cumple el contrato.${OFF}\n`);
  process.exit(1);
}

console.log(`\n${GREEN}✔ data/prices.json cumple el contrato: la app puede consumirlo.${OFF}\n`);
