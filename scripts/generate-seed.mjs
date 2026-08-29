#!/usr/bin/env node
/**
 * Genera supabase/seed.sql a partir del catálogo de la app y de data/prices.json.
 *
 * El seed NO se escribe a mano: se deriva de js/data.js para que la base y el
 * cliente no puedan desincronizarse. Si agregas un producto al catálogo, corre
 * esto otra vez y aplica el seed.
 *
 *   node scripts/generate-seed.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { SUPERMARKETS, CATEGORIES, PRODUCTS_CATALOG } from '../js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'supabase', 'seed.sql');

const prices = JSON.parse(await readFile(path.join(ROOT, 'data', 'prices.json'), 'utf8'));

/** Escapa un valor para SQL. */
function q(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Arreglo de texto de Postgres. */
function qArray(values) {
  if (!values || values.length === 0) return `'{}'`;
  const inner = values.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  return `'{${inner.replace(/'/g, "''")}}'`;
}

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const lines = [];
const w = (s = '') => lines.push(s);

w('-- SuperPrecios QRO — datos semilla');
w('-- GENERADO POR scripts/generate-seed.mjs — no editar a mano.');
w(`-- Fuente: js/data.js + data/prices.json (${prices.generatedAt})`);
w('');
w('begin;');
w('');

// --- Tiendas ---
w('-- Cadenas');
w('insert into public.stores (id, name, short_name, color, accent_color, logo_text, search_url_template) values');
w(Object.values(SUPERMARKETS).map(s => {
  // searchUrl es una función; se guarda la plantilla con {query} como marcador.
  let template = null;
  try {
    template = s.searchUrl('{query}').replace(encodeURIComponent('{query}'), '{query}');
  } catch (e) {
    template = null;
  }
  return `  (${q(s.id)}, ${q(s.name)}, ${q(s.shortName)}, ${q(s.color)}, ${q(s.accentColor)}, ${q(s.logoText)}, ${q(template)})`;
}).join(',\n'));
w('on conflict (id) do update set');
w('  name = excluded.name, short_name = excluded.short_name, color = excluded.color,');
w('  accent_color = excluded.accent_color, logo_text = excluded.logo_text,');
w('  search_url_template = excluded.search_url_template;');
w('');

// --- Sucursales ---
const branchRows = [];
for (const store of Object.values(SUPERMARKETS)) {
  for (const b of store.branchesQro) {
    branchRows.push(
      `  (${q(`${store.id}-${slugify(b.name)}`)}, ${q(store.id)}, ${q(b.name)}, ${q(b.zone)}, ${q('76000')})`
    );
  }
}
w('-- Sucursales de Querétaro');
w('insert into public.branches (id, store_id, name, zone, postal_code) values');
w(branchRows.join(',\n'));
w('on conflict (id) do update set');
w('  name = excluded.name, zone = excluded.zone, postal_code = excluded.postal_code;');
w('');

// --- Categorías ---
w('-- Categorías');
w('insert into public.categories (id, name, icon) values');
w(CATEGORIES.map(c => `  (${q(c.id)}, ${q(c.name)}, ${q(c.icon)})`).join(',\n'));
w('on conflict (id) do update set name = excluded.name, icon = excluded.icon;');
w('');

// --- Productos ---
w('-- Productos del catálogo');
w('insert into public.products (ean, slug, name, category_id, unit, pack_amount, pack_unit, aliases, official_registry_url) values');
w(PRODUCTS_CATALOG.map(p =>
  `  (${q(p.ean)}, ${q(p.id)}, ${q(p.name)}, ${q(p.category)}, ${q(p.unit)}, ` +
  `${q(p.pack.amount)}, ${q(p.pack.unit)}, ${qArray(p.aliases)}, ${q(p.officialRegistryUrl)})`
).join(',\n'));
w('on conflict (ean) do update set');
w('  slug = excluded.slug, name = excluded.name, category_id = excluded.category_id,');
w('  unit = excluded.unit, pack_amount = excluded.pack_amount, pack_unit = excluded.pack_unit,');
w('  aliases = excluded.aliases, official_registry_url = excluded.official_registry_url;');
w('');

// --- Precios iniciales ---
const priceRows = [];
for (const [ean, byStore] of Object.entries(prices.products || {})) {
  for (const [storeId, price] of Object.entries(byStore)) {
    priceRows.push(
      `  (${q(ean)}, ${q(storeId)}, ${q(price)}, ${q(prices.currency || 'MXN')}, ` +
      `${q(prices.generatedAt)}::timestamptz, ${q(prices.source || 'captura-manual')})`
    );
  }
}

w('-- Precios iniciales (la captura manual con la que arrancó el proyecto).');
w('-- Se insertan como observaciones históricas, igual que lo hará el scraper.');
w('insert into public.price_observations (ean, store_id, price, currency, captured_at, source) values');
w(priceRows.join(',\n'));
w('on conflict do nothing;');
w('');
w('commit;');
w('');

await writeFile(OUT, lines.join('\n'), 'utf8');

console.log(`✔ ${path.relative(ROOT, OUT)}`);
console.log(`  ${Object.keys(SUPERMARKETS).length} cadenas`);
console.log(`  ${branchRows.length} sucursales`);
console.log(`  ${CATEGORIES.length} categorías`);
console.log(`  ${PRODUCTS_CATALOG.length} productos`);
console.log(`  ${priceRows.length} observaciones de precio`);
