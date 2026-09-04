import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS_CATALOG, SUPERMARKETS } from '../js/data.js';
import { validarObservacion } from '../scraper/lib/normalize.mjs';
import {
  adaptador,
  cargarMapping,
  indexarMapping,
  normalizarResultado,
  extraerPrimerResultado,
  esResultadoPlausible,
  construirQueryNombre,
  consultarSerpApi
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
// 2. Carga e indexación del mapping estático
// ---------------------------------------------------------------------------

test('cargarMapping carga el archivo de mapeo walmart-items.json', async () => {
  const mapping = await cargarMapping();
  assert.ok(Array.isArray(mapping.items), 'mapping.items debe ser un array');
  assert.ok(Array.isArray(mapping._sin_mapear), 'mapping._sin_mapear debe ser un array');
  assert.ok(mapping.items.length >= 10, 'Debe contener al menos los 10 items mapeados iniciales');

  for (const item of mapping.items) {
    assert.match(item.ean, /^\d{13}$/, `EAN inválido en mapping: ${item.ean}`);
    assert.ok(item.us_item_id && item.us_item_id.length > 5, `us_item_id inválido en mapping: ${item.us_item_id}`);
  }
});

test('indexarMapping indexa por EAN los productos con us_item_id', () => {
  const mockMapping = {
    items: [
      { ean: '7501020513478', us_item_id: '00750102056593', nombre: 'Leche Lala' },
      { ean: '7501040001019', us_item_id: '00750104008370', nombre: 'Queso FUD' },
      { ean: '7501166300405', us_item_id: null, nombre: 'Sin ID' }
    ]
  };
  const idx = indexarMapping(mockMapping);
  assert.equal(idx.size, 2);
  assert.equal(idx.get('7501020513478').us_item_id, '00750102056593');
  assert.equal(idx.get('7501040001019').us_item_id, '00750104008370');
  assert.equal(idx.has('7501166300405'), false);
});

// ---------------------------------------------------------------------------
// 3. Normalización y extracción de resultados SerpApi
// ---------------------------------------------------------------------------

test('normalizarResultado extrae todos los campos requeridos de un item de SerpApi', () => {
  const fixture = {
    title: 'Leche Lala UHT entera 1 l',
    primary_price: 30.5,
    us_item_id: '00750102056593',
    product_id: '3JFLM2Y98T1G',
    offer_id: '77CFAEB4001',
    seller_name: 'Walmart',
    product_page_url: 'https://www.walmart.com.mx/ip/00750102056593'
  };

  const res = normalizarResultado(fixture);
  assert.ok(res);
  assert.equal(res.precio, 30.5);
  assert.equal(res.nombre, 'Leche Lala UHT entera 1 l');
  assert.equal(res.us_item_id, '00750102056593');
  assert.equal(res.product_id, '3JFLM2Y98T1G');
  assert.equal(res.offer_id, '77CFAEB4001');
  assert.equal(res.seller, 'Walmart');
  assert.equal(res.url, 'https://www.walmart.com.mx/ip/00750102056593');
});

test('normalizarResultado maneja campos alternativos (price, extracted_price, link)', () => {
  const fixture = {
    title: 'Pan Bimbo Blanco',
    price: 49.90,
    us_item_id: '00750081002918',
    seller: 'Marketplace',
    link: 'https://www.walmart.com.mx/ip/pan-bimbo'
  };

  const res = normalizarResultado(fixture);
  assert.ok(res);
  assert.equal(res.precio, 49.9);
  assert.equal(res.product_id, '00750081002918'); // fallback a us_item_id
  assert.equal(res.offer_id, null);
  assert.equal(res.seller, 'Marketplace');
  assert.equal(res.url, 'https://www.walmart.com.mx/ip/pan-bimbo');
});

test('normalizarResultado rechaza precios inválidos (0, negativos, nulos)', () => {
  assert.equal(normalizarResultado(null), null);
  assert.equal(normalizarResultado({ title: 'X', price: 0 }), null);
  assert.equal(normalizarResultado({ title: 'X', price: -10 }), null);
  assert.equal(normalizarResultado({ title: 'X', price: 'no_precio' }), null);
  assert.equal(normalizarResultado({ title: 'X' }), null);
});

test('extraerPrimerResultado devuelve el primer resultado con precio válido', () => {
  const response = {
    organic_results: [
      { title: 'Sin precio', price: 0 },
      { title: 'Producto Válido', primary_price: 25.0, us_item_id: '123' },
      { title: 'Otro Producto', primary_price: 50.0, us_item_id: '456' }
    ]
  };

  const primero = extraerPrimerResultado(response);
  assert.ok(primero);
  assert.equal(primero.nombre, 'Producto Válido');
  assert.equal(primero.precio, 25.0);
  assert.equal(primero.us_item_id, '123');
});

test('extraerPrimerResultado devuelve null si organic_results está vacío o ausente', () => {
  assert.equal(extraerPrimerResultado({}), null);
  assert.equal(extraerPrimerResultado({ organic_results: [] }), null);
  assert.equal(extraerPrimerResultado({ organic_results: [{ price: 0 }] }), null);
  assert.equal(extraerPrimerResultado(null), null);
});

// ---------------------------------------------------------------------------
// 4. esResultadoPlausible — matching estricto y detección de IDs rotados
// ---------------------------------------------------------------------------

test('esResultadoPlausible acepta coincidencia exacta y plausible', () => {
  const pLala = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478');
  assert.ok(esResultadoPlausible('Leche Lala UHT entera 1 l', pLala));
  assert.ok(esResultadoPlausible('Leche Lala Entera Pasteurizada 1 L', pLala));

  const pFUD = PRODUCTS_CATALOG.find(p => p.ean === '7501040001019');
  assert.ok(esResultadoPlausible('Queso panela FUD 23 en bloque 400 g', pFUD));
});

test('esResultadoPlausible rechaza variantes no solicitadas (deslactosada, light, descafeinado)', () => {
  const pLala = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478');
  assert.equal(esResultadoPlausible('Leche Lala UHT entera deslactosada 1 l', pLala), false);
  assert.equal(esResultadoPlausible('Leche Lala UHT semidescremada 1 l', pLala), false);

  const pNescafe = PRODUCTS_CATALOG.find(p => p.ean === '7501058617873');
  assert.equal(esResultadoPlausible('Café Descafeinado Soluble Nescafé Decaf Frasco 120g', pNescafe), false);

  const pMayonesa = PRODUCTS_CATALOG.find(p => p.ean === '7501005101019');
  assert.equal(esResultadoPlausible('Mayonesa McCormick Light con Limón 390g', pMayonesa), false);
});

test('esResultadoPlausible rechaza multipacks cuando el catálogo pide pieza individual', () => {
  const pLala = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478');
  assert.equal(esResultadoPlausible('Leche Lala UHT entera 3 pzas 1 l c/u', pLala), false);
  assert.equal(esResultadoPlausible('Leche Lala UHT entera 6 pack 1 l c/u', pLala), false);
});

test('esResultadoPlausible rechaza cantidades o pesos contradictorios', () => {
  const pCrema = PRODUCTS_CATALOG.find(p => p.ean === '7501020521015'); // 450ml
  assert.equal(esResultadoPlausible('Crema Ácida Lala 426 ml', pCrema), false);

  const pArroz = PRODUCTS_CATALOG.find(p => p.ean === '7501078100119'); // 900g
  assert.equal(esResultadoPlausible('Arroz Súper Extra Verde Valle 1 kg', pArroz), false);

  const pHuevo = PRODUCTS_CATALOG.find(p => p.ean === '7501166300405'); // 30 piezas
  assert.equal(esResultadoPlausible('Huevo Blanco San Juan 18 piezas', pHuevo), false);

  const pAriel = PRODUCTS_CATALOG.find(p => p.ean === '7500435128031'); // 1kg
  assert.equal(esResultadoPlausible('Detergente en Polvo Ariel Doble Poder 4 kg', pAriel), false);
});

test('esResultadoPlausible rechaza marca completamente distinta', () => {
  const pPetalo = PRODUCTS_CATALOG.find(p => p.ean === '7501943440129'); // Pétalo
  assert.equal(esResultadoPlausible('Papel Higiénico Aurrera Max Floral 12 rollos', pPetalo), false);
});

test('esResultadoPlausible devuelve false con entradas nulas o vacías', () => {
  const prod = PRODUCTS_CATALOG[0];
  assert.equal(esResultadoPlausible('', prod), false);
  assert.equal(esResultadoPlausible(null, prod), false);
  assert.equal(esResultadoPlausible('Leche Lala 1L', null), false);
});

// ---------------------------------------------------------------------------
// 5. construirQueryNombre — formación del término de búsqueda
// ---------------------------------------------------------------------------

test('construirQueryNombre devuelve el nombre exacto del catálogo', () => {
  for (const prod of PRODUCTS_CATALOG) {
    const query = construirQueryNombre(prod);
    assert.equal(query, prod.name, `Query incorrecta para ${prod.ean}`);
    assert.ok(query.length > 5, `Query demasiado corta para ${prod.ean}`);
  }
});

// ---------------------------------------------------------------------------
// 6. Contrato de observación producida e invariantes de Walmart
// ---------------------------------------------------------------------------

test('una observación bien formada de Walmart pasa validarObservacion y contiene los 6 campos en raw', () => {
  const prod = PRODUCTS_CATALOG[0];
  const observacion = {
    ean: prod.ean,
    storeId: 'walmart',
    price: 29.50,
    capturedAt: new Date().toISOString(),
    source: 'serpapi-walmart',
    sourceUrl: 'https://www.walmart.com.mx/ip/00750102056593',
    raw: {
      us_item_id: '00750102056593',
      product_id: '3JFLM2Y98T1G',
      offer_id: '77CFAEB4001',
      seller: 'Walmart',
      matched_by: 'direct_id',
      serpapi_query: '00750102056593'
    }
  };

  const problemas = validarObservacion(observacion, { eansValidos, tiendasValidas });
  assert.equal(problemas.length, 0, `Problemas inesperados: ${problemas.join(', ')}`);

  // Verificar exactamente los 6 campos requeridos dentro de raw
  assert.ok('us_item_id' in observacion.raw, 'Falta us_item_id en raw');
  assert.ok('product_id' in observacion.raw, 'Falta product_id en raw');
  assert.ok('offer_id' in observacion.raw, 'Falta offer_id en raw');
  assert.ok('seller' in observacion.raw, 'Falta seller en raw');
  assert.ok('matched_by' in observacion.raw, 'Falta matched_by en raw');
  assert.ok('serpapi_query' in observacion.raw, 'Falta serpapi_query en raw');

  // Verificar que NO incluya branch_id (precio online general, no sucursal física)
  assert.equal('branch_id' in observacion, false, 'No debe inventar branch_id');
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
// 7. Invariantes del catálogo
// ---------------------------------------------------------------------------

test('el catálogo objetivo contiene exactamente 19 productos', () => {
  assert.equal(PRODUCTS_CATALOG.length, 19);
});

test('todos los productos del catálogo tienen EAN de 13 dígitos', () => {
  for (const prod of PRODUCTS_CATALOG) {
    assert.match(prod.ean, /^\d{13}$/, `EAN inválido en ${prod.id}: "${prod.ean}"`);
  }
});

// ---------------------------------------------------------------------------
// 8. Prueba de integración opcional (sólo se ejecuta si SERPAPI_KEY está configurada)
// ---------------------------------------------------------------------------

const testIntegracion = process.env.SERPAPI_KEY ? test : test.skip;

testIntegracion('integración: consulta real a SerpApi devuelve precio para Leche Lala', async () => {
  const res = await consultarSerpApi('00750102056593', process.env.SERPAPI_KEY);
  assert.ok(res, 'Respuesta no debe ser nula');
  assert.ok(Array.isArray(res.organic_results), 'Debe contener organic_results');
  assert.ok(res.organic_results.length > 0, 'Debe devolver al menos un resultado');

  const primero = extraerPrimerResultado(res);
  assert.ok(primero, 'Debe extraer un resultado normalizado válido');
  assert.ok(primero.precio > 0, 'Precio debe ser positivo');
  assert.equal(primero.us_item_id, '00750102056593', 'Item ID debe coincidir');
});
