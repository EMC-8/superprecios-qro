import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS_CATALOG, SUPERMARKETS } from '../js/data.js';
import { validarObservacion } from '../scraper/lib/normalize.mjs';
import {
  adaptador,
  esResultadoPlausible,
  construirQueryNombre
} from '../scraper/adapters/walmart.mjs';

const eansValidos = new Set(PRODUCTS_CATALOG.map(p => p.ean));
const tiendasValidas = new Set(Object.keys(SUPERMARKETS));

// ---------------------------------------------------------------------------
// 1. Contrato del adaptador
// ---------------------------------------------------------------------------

test('adaptador de Walmart expone el contrato esperado', () => {
  assert.equal(adaptador.id, 'walmart');
  assert.equal(adaptador.nombre, 'Walmart México (SerpApi)');
  assert.equal(adaptador.automatizable, true);
  assert.deepEqual(adaptador.cadenas, ['walmart']);
  assert.equal(typeof adaptador.obtenerPrecios, 'function');
});

// ---------------------------------------------------------------------------
// 2. esResultadoPlausible — detección de IDs inválidos/rotados
// ---------------------------------------------------------------------------

test('esResultadoPlausible acepta nombre que contiene palabras clave del producto', () => {
  const producto = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478'); // Leche Lala
  assert.ok(esResultadoPlausible('Leche Lala Entera Pasteurizada 1 L', producto));
});

test('esResultadoPlausible acepta nombre aunque no coincidan todas las palabras', () => {
  const producto = PRODUCTS_CATALOG.find(p => p.ean === '7501045401340'); // Atún Dolores
  // Al menos la mitad de palabras clave deben aparecer
  assert.ok(esResultadoPlausible('Atún Dolores 140 g en Agua', producto));
});

test('esResultadoPlausible rechaza un nombre completamente diferente (ID rotado)', () => {
  const producto = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478'); // Leche Lala
  assert.equal(esResultadoPlausible('Cerveza Corona Extra 6-Pack 355ml', producto), false);
});

test('esResultadoPlausible devuelve false con nombre vacío', () => {
  const producto = PRODUCTS_CATALOG[0];
  assert.equal(esResultadoPlausible('', producto), false);
  assert.equal(esResultadoPlausible(null, producto), false);
});

test('esResultadoPlausible devuelve false con producto nulo', () => {
  assert.equal(esResultadoPlausible('Leche Lala 1L', null), false);
});

// ---------------------------------------------------------------------------
// 3. construirQueryNombre — formación del término de búsqueda
// ---------------------------------------------------------------------------

test('construirQueryNombre devuelve el nombre exacto del catálogo', () => {
  for (const prod of PRODUCTS_CATALOG) {
    const query = construirQueryNombre(prod);
    assert.equal(query, prod.name, `Query incorrecta para ${prod.ean}`);
    assert.ok(query.length > 5, `Query demasiado corta para ${prod.ean}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Contrato de observación producida
// ---------------------------------------------------------------------------

test('una observación bien formada pasa validarObservacion sin problemas', () => {
  const prod = PRODUCTS_CATALOG[0];
  const observacion = {
    ean: prod.ean,
    storeId: 'walmart',
    price: 29.50,
    capturedAt: new Date().toISOString(),
    source: 'serpapi-walmart',
    sourceUrl: 'https://www.walmart.com.mx/ip/leche-lala-entera/00750102056593',
    raw: {
      us_item_id: '00750102056593',
      nombre_walmart: 'Leche Lala Entera 1 L',
      matched_by: 'direct_id',
      serpapi_query: '00750102056593'
    }
  };
  const problemas = validarObservacion(observacion, { eansValidos, tiendasValidas });
  assert.equal(problemas.length, 0, `Problemas inesperados: ${problemas.join(', ')}`);
});

test('una observación con precio 0 es rechazada por validarObservacion', () => {
  const prod = PRODUCTS_CATALOG[0];
  const observacion = {
    ean: prod.ean,
    storeId: 'walmart',
    price: 0,
    capturedAt: new Date().toISOString(),
    source: 'serpapi-walmart'
  };
  const problemas = validarObservacion(observacion, { eansValidos, tiendasValidas });
  assert.ok(problemas.length > 0, 'Precio 0 debe ser rechazado');
  assert.ok(problemas.some(p => p.includes('precio')), `Motivo esperado "precio inválido" no encontrado: ${problemas}`);
});

test('una observación con EAN desconocido es rechazada por validarObservacion', () => {
  const observacion = {
    ean: '0000000000000',
    storeId: 'walmart',
    price: 29.50,
    capturedAt: new Date().toISOString(),
    source: 'serpapi-walmart'
  };
  const problemas = validarObservacion(observacion, { eansValidos, tiendasValidas });
  assert.ok(problemas.some(p => p.includes('EAN')), 'EAN desconocido debe ser rechazado');
});

// ---------------------------------------------------------------------------
// 5. Invariantes del catálogo
// ---------------------------------------------------------------------------

test('el catálogo objetivo contiene exactamente 19 productos', () => {
  assert.equal(PRODUCTS_CATALOG.length, 19);
});

test('todos los productos del catálogo tienen EAN de 13 dígitos', () => {
  for (const prod of PRODUCTS_CATALOG) {
    assert.match(prod.ean, /^\d{13}$/, `EAN inválido en ${prod.id}: "${prod.ean}"`);
  }
});
