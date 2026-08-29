import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateOptimizations } from '../js/optimizer.js';
import { createPriceTable, sanitizePriceTable } from '../js/prices.js';

const LECHE = '7501020513478';
const HUEVO = '7501166300405';

function tableOf(products, meta = { generatedAt: new Date().toISOString() }) {
  return createPriceTable(products, meta, 'test');
}

function item(ean, quantity = 1, extra = {}) {
  return { id: ean, catalogId: ean, ean, name: ean, unit: 'pz', quantity, isCustom: false, ...extra };
}

test('elige la tienda más barata para cada producto', () => {
  const priceTable = tableOf({
    [LECHE]: { aurrera: 29, walmart: 30, heb: 35 },
    [HUEVO]: { aurrera: 64, walmart: 60, heb: 62 }
  });

  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });

  assert.equal(opt.multiStore.total, 89); // 29 + 60
  const byStore = Object.fromEntries(opt.multiStore.storeGroups.map(g => [g.store.id, g.subtotal]));
  assert.deepEqual(byStore, { aurrera: 29, walmart: 60 });
});

test('multiplica por la cantidad', () => {
  const priceTable = tableOf({ [LECHE]: { aurrera: 29, walmart: 30 } });
  const opt = calculateOptimizations([item(LECHE, 3)], { priceTable });
  assert.equal(opt.multiStore.total, 87);
});

test('un precio faltante NO cuenta como cero', () => {
  // Aurrera solo tiene leche. Si el faltante valiera 0, Aurrera "ganaría" con $29.
  const priceTable = tableOf({
    [LECHE]: { aurrera: 29, walmart: 30 },
    [HUEVO]: { walmart: 60 }
  });

  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });

  const aurrera = opt.singleStoreTotals.find(s => s.store.id === 'aurrera');
  const walmart = opt.singleStoreTotals.find(s => s.store.id === 'walmart');

  assert.equal(aurrera.hasFullCoverage, false);
  assert.equal(aurrera.missingItems.length, 1);
  assert.equal(walmart.hasFullCoverage, true);

  // La tienda completa gana aunque su total sea mayor que el parcial de Aurrera.
  assert.equal(opt.bestSingleStore.store.id, 'walmart');
  assert.equal(opt.bestSingleStore.total, 90);
});

test('los productos sin ningún precio se reportan aparte y no entran al total', () => {
  const priceTable = tableOf({ [LECHE]: { aurrera: 29 } });
  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });

  assert.equal(opt.unpricedItems.length, 1);
  assert.equal(opt.unpricedItems[0].ean, HUEVO);
  assert.equal(opt.pricedCount, 1);
  assert.equal(opt.multiStore.total, 29);
});

test('devuelve error explícito cuando no hay ningún precio', () => {
  const opt = calculateOptimizations([item(LECHE)], { priceTable: tableOf({}) });
  assert.equal(opt.error, 'no-prices');
  assert.equal(opt.unpricedItems.length, 1);
});

test('devuelve error explícito cuando no hay tiendas habilitadas', () => {
  const priceTable = tableOf({ [LECHE]: { aurrera: 29 } });
  const opt = calculateOptimizations([item(LECHE)], { priceTable, enabledStores: [] });
  // Lista vacía = "sin filtro", así que aquí sí optimiza; el error es con ids inválidos.
  assert.equal(opt.error, undefined);

  const opt2 = calculateOptimizations([item(LECHE)], { priceTable, enabledStores: ['tienda-fantasma'] });
  assert.equal(opt2.error, 'no-stores');
});

test('respeta las tiendas habilitadas', () => {
  const priceTable = tableOf({ [LECHE]: { aurrera: 29, walmart: 30, heb: 35 } });
  const opt = calculateOptimizations([item(LECHE)], { priceTable, enabledStores: ['walmart', 'heb'] });

  assert.equal(opt.multiStore.total, 30);
  assert.equal(opt.multiStore.storeGroups[0].store.id, 'walmart');
  assert.deepEqual(opt.storeKeys, ['walmart', 'heb']);
});

test('la ruta de 2 tiendas prioriza cobertura sobre precio', () => {
  // Ninguna tienda vende las dos cosas:
  //   aurrera+chedraui  -> $10 pero solo cubre 1 de 2 (el par más barato)
  //   aurrera+soriana   -> $68 y cubre los 2
  // Debe ganar el que cubre, no el que cuesta menos.
  const priceTable = tableOf({
    [LECHE]: { aurrera: 10, chedraui: 11 },
    [HUEVO]: { walmart: 60, soriana: 58 }
  });

  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });
  const combo = opt.twoStoresCombo;

  assert.equal(combo.coverage, 2);
  assert.equal(combo.hasFullCoverage, true);
  assert.deepEqual([...combo.stores].sort(), ['aurrera', 'soriana']);
  assert.equal(combo.total, 68); // 10 + 58
});

test('la ruta de 2 tiendas nunca produce Infinity ni NaN', () => {
  const priceTable = tableOf({
    [LECHE]: { aurrera: 29 },
    [HUEVO]: { heb: 62 }
  });
  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });

  assert.ok(Number.isFinite(opt.twoStoresCombo.total));
  assert.ok(Number.isFinite(opt.multiStore.total));
  for (const s of opt.singleStoreTotals) assert.ok(Number.isFinite(s.total));
});

test('los ítems personalizados usan sus precios estimados', () => {
  const custom = {
    id: 'custom-1', catalogId: null, ean: null, name: 'Jitomate', unit: 'kg', quantity: 2,
    isCustom: true, isEstimatedPrice: true,
    estimatedPrices: { aurrera: 30, walmart: 40 }
  };
  const opt = calculateOptimizations([custom], { priceTable: tableOf({}) });

  assert.equal(opt.multiStore.total, 60);
  assert.equal(opt.multiStore.storeGroups[0].store.id, 'aurrera');
});

test('el ahorro se mide contra una tienda que sí cubre toda la canasta', () => {
  const priceTable = tableOf({
    [LECHE]: { aurrera: 29, walmart: 30, heb: 40 },
    [HUEVO]: { aurrera: 64, walmart: 60, heb: 80 }
  });
  const opt = calculateOptimizations([item(LECHE), item(HUEVO)], { priceTable });

  assert.equal(opt.savings.baselineIsComplete, true);
  assert.equal(opt.savings.baselineStore.id, 'heb');   // 120, la más cara completa
  assert.equal(opt.multiStore.total, 89);              // 29 + 60
  assert.equal(opt.savings.maxSavingsVsWorst, 31);
});

test('sanitizePriceTable descarta basura sin tumbar el resto', () => {
  const { products, issues } = sanitizePriceTable({
    generatedAt: '2026-08-29T00:00:00.000Z',
    products: {
      [LECHE]: { aurrera: 29, tiendaInexistente: 5, walmart: -3, heb: 'abc' },
      '0000000000000': { aurrera: 10 }
    }
  });

  assert.deepEqual(products, { [LECHE]: { aurrera: 29 } });
  assert.equal(issues.length, 4); // tienda inválida, precio negativo, precio no numérico, EAN desconocido
});

test('la tabla de precios reporta frescura', () => {
  const hoy = tableOf({}, { generatedAt: new Date().toISOString() });
  assert.equal(hoy.freshnessLabel(), 'hoy');
  assert.equal(hoy.isStale(), false);

  const viejo = tableOf({}, { generatedAt: new Date(Date.now() - 40 * 86400000).toISOString() });
  assert.equal(viejo.isStale(), true);
  assert.match(viejo.freshnessLabel(), /mes/);
});
