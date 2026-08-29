import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PRODUCTS_CATALOG } from '../js/data.js';
import { adaptador } from '../scraper/adapters/chedraui.mjs';

const validEans = new Set(PRODUCTS_CATALOG.map(p => p.ean));

test('adaptador de Chedraui expone el contrato esperado', () => {
  assert.equal(adaptador.id, 'chedraui');
  assert.equal(adaptador.automatizable, true);
  assert.deepEqual(adaptador.cadenas, ['chedraui']);
  assert.equal(typeof adaptador.obtenerPrecios, 'function');
});

test('el archivo de mapeo de Chedraui cubre productos válidos del catálogo', async () => {
  const raw = await readFile(new URL('../scraper/mappings/chedraui.json', import.meta.url), 'utf8');
  const mapping = JSON.parse(raw);

  assert.ok(Array.isArray(mapping.entradas));
  assert.ok(mapping.entradas.length > 0);

  for (const entrada of mapping.entradas) {
    assert.ok(validEans.has(entrada.ean), `EAN ${entrada.ean} no existe en PRODUCTS_CATALOG`);
    assert.match(entrada.url, /^https:\/\/www\.chedraui\.com\.mx\/[a-z0-9\-]+\/p$/i);
    assert.ok(entrada.producto && entrada.producto.length > 0);
  }
});
