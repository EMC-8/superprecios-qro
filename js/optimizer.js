/**
 * Motor de Optimización de Precios para Supermercados en Querétaro.
 *
 * Calcula:
 * 1. Total por cada supermercado individual (para comparar la canasta completa).
 * 2. Mejor supermercado único (comprar todo en 1 solo lugar).
 * 3. División óptima multi-tienda (comprar cada producto donde sea más barato).
 * 4. Estrategia equilibrada (mejor combinación de exactamente 2 tiendas).
 *
 * Regla central: un precio ausente significa "no se sabe / no lo hay ahí",
 * NUNCA cero. Tratarlo como cero haría ver baratísima a la tienda que menos
 * datos tiene, que es justo la conclusión contraria a la verdadera.
 */

import { SUPERMARKETS } from './data.js';

/**
 * Precios aplicables a un ítem.
 * Los del catálogo se resuelven por EAN contra la tabla de precios;
 * los personalizados cargan sus propios precios estimados.
 */
export function resolveItemPrices(item, priceTable) {
  if (!item) return {};
  if (item.isCustom) return item.estimatedPrices || {};
  if (priceTable && item.ean) return priceTable.getPrices(item.ean);
  return {};
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Array}  items                  ítems de la canasta
 * @param {Object} options
 * @param {Object} options.priceTable     tabla de precios (js/prices.js)
 * @param {Array}  options.enabledStores  ids de tienda a considerar; null = todas
 */
export function calculateOptimizations(items, options = {}) {
  if (!items || items.length === 0) return null;

  const { priceTable = null, enabledStores = null } = options;

  const storeKeys = (Array.isArray(enabledStores) && enabledStores.length > 0
    ? enabledStores
    : Object.keys(SUPERMARKETS)
  ).filter(id => SUPERMARKETS[id]);

  if (storeKeys.length === 0) {
    return { error: 'no-stores', itemsCount: items.length };
  }

  // Precios de cada ítem, ya filtrados a las tiendas habilitadas y a valores usables.
  const priced = [];
  const unpricedItems = [];

  for (const item of items) {
    const all = resolveItemPrices(item, priceTable);
    const usable = {};
    for (const storeId of storeKeys) {
      const p = Number(all[storeId]);
      if (Number.isFinite(p) && p > 0) usable[storeId] = p;
    }
    if (Object.keys(usable).length === 0) {
      unpricedItems.push(item);
    } else {
      priced.push({ item, prices: usable });
    }
  }

  // Sin un solo precio no hay nada que optimizar: se dice, no se inventa.
  if (priced.length === 0) {
    return {
      error: 'no-prices',
      itemsCount: items.length,
      unpricedItems,
      storeKeys
    };
  }

  const withUnitPrice = (entry, storeId) => {
    const unitPrice = entry.prices[storeId];
    return {
      ...entry.item,
      unitPrice,
      subtotal: round2(unitPrice * entry.item.quantity)
    };
  };

  // --- 1. Totales por supermercado individual -------------------------------
  // Cada tienda se evalúa solo sobre lo que sí tiene; se reporta lo que le falta.
  const singleStoreTotals = storeKeys.map(storeId => {
    const available = priced.filter(e => e.prices[storeId] !== undefined);
    const missingItems = priced.filter(e => e.prices[storeId] === undefined).map(e => e.item);
    const total = available.reduce((acc, e) => acc + e.prices[storeId] * e.item.quantity, 0);

    return {
      store: SUPERMARKETS[storeId],
      total: round2(total),
      items: available.map(e => withUnitPrice(e, storeId)),
      missingItems,
      coverage: available.length,
      hasFullCoverage: missingItems.length === 0
    };
  });

  // Ordenar: primero las que cubren toda la canasta, y dentro de cada grupo por precio.
  // Comparar el total de una tienda incompleta contra una completa sería tramposo.
  const sortedSingleStores = [...singleStoreTotals].sort((a, b) => {
    if (a.hasFullCoverage !== b.hasFullCoverage) return a.hasFullCoverage ? -1 : 1;
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    return a.total - b.total;
  });

  const fullCoverageStores = sortedSingleStores.filter(s => s.hasFullCoverage);
  const bestSingleStore = sortedSingleStores[0];
  // El "peor" solo sirve para medir ahorro, y solo es comparable entre tiendas completas.
  const comparableStores = fullCoverageStores.length > 0 ? fullCoverageStores : sortedSingleStores;
  const worstSingleStore = comparableStores.reduce(
    (a, b) => (b.total > a.total ? b : a),
    comparableStores[0]
  );

  // --- 2. División óptima (cada producto donde esté más barato) --------------
  const storeGroups = {};
  let multiStoreTotal = 0;

  const optimizedItems = priced.map(entry => {
    const pricesComparison = Object.entries(entry.prices)
      .map(([storeId, price]) => ({ storeId, storeName: SUPERMARKETS[storeId].shortName, price }))
      .sort((a, b) => a.price - b.price);

    const best = pricesComparison[0];
    const subtotal = best.price * entry.item.quantity;
    multiStoreTotal += subtotal;

    const optimizedItem = {
      ...entry.item,
      bestStoreId: best.storeId,
      bestStore: SUPERMARKETS[best.storeId],
      unitPrice: best.price,
      subtotal: round2(subtotal),
      pricesComparison,
      availableInStores: pricesComparison.length
    };

    if (!storeGroups[best.storeId]) {
      storeGroups[best.storeId] = { store: SUPERMARKETS[best.storeId], items: [], subtotal: 0 };
    }
    storeGroups[best.storeId].items.push(optimizedItem);
    storeGroups[best.storeId].subtotal += subtotal;

    return optimizedItem;
  });

  const activeMultiStores = Object.values(storeGroups)
    .map(g => ({ ...g, subtotal: round2(g.subtotal) }))
    .sort((a, b) => b.subtotal - a.subtotal);

  multiStoreTotal = round2(multiStoreTotal);

  // --- 3. Mejor combinación de 2 tiendas ------------------------------------
  const twoStoresCombo = findBestTwoStoresCombo(priced, storeKeys, withUnitPrice);

  // --- 4. Ahorro -------------------------------------------------------------
  const maxSavingsVsWorst = round2(worstSingleStore.total - multiStoreTotal);
  const savingsVsBestSingle = round2(bestSingleStore.total - multiStoreTotal);
  const savingsPercentage = worstSingleStore.total > 0
    ? Math.round((maxSavingsVsWorst / worstSingleStore.total) * 100)
    : 0;

  return {
    itemsCount: items.length,
    pricedCount: priced.length,
    totalUnits: items.reduce((acc, it) => acc + it.quantity, 0),
    storeKeys,
    unpricedItems,
    anyStoreCoversAll: fullCoverageStores.length > 0,
    singleStoreTotals: sortedSingleStores,
    bestSingleStore,
    worstSingleStore,
    multiStore: {
      total: multiStoreTotal,
      storesCount: activeMultiStores.length,
      storeGroups: activeMultiStores,
      items: optimizedItems
    },
    twoStoresCombo,
    savings: {
      maxSavingsVsWorst,
      savingsVsBestSingle,
      savingsPercentage,
      // Contra qué se está midiendo el ahorro, para poder decirlo en la UI.
      baselineStore: worstSingleStore.store,
      baselineIsComplete: worstSingleStore.hasFullCoverage
    }
  };
}

/**
 * Encuentra el par de supermercados que cubre más productos al menor costo.
 * La cobertura manda sobre el precio: un par barato que no tiene la mitad de la
 * canasta no es una ruta, es un viaje perdido.
 */
function findBestTwoStoresCombo(priced, storeKeys, withUnitPrice) {
  if (storeKeys.length < 2) return null;

  let best = null;

  for (let i = 0; i < storeKeys.length; i++) {
    for (let j = i + 1; j < storeKeys.length; j++) {
      const s1 = storeKeys[i];
      const s2 = storeKeys[j];

      const g1 = { store: SUPERMARKETS[s1], items: [], subtotal: 0 };
      const g2 = { store: SUPERMARKETS[s2], items: [], subtotal: 0 };
      let total = 0;
      let covered = 0;
      const missingItems = [];

      for (const entry of priced) {
        const p1 = entry.prices[s1];
        const p2 = entry.prices[s2];

        if (p1 === undefined && p2 === undefined) {
          missingItems.push(entry.item);
          continue;
        }

        covered++;
        const useFirst = p2 === undefined || (p1 !== undefined && p1 <= p2);
        const storeId = useFirst ? s1 : s2;
        const group = useFirst ? g1 : g2;
        const enriched = withUnitPrice(entry, storeId);

        group.items.push({ ...enriched, assignedStore: storeId });
        group.subtotal += enriched.subtotal;
        total += enriched.subtotal;
      }

      const candidate = {
        total: round2(total),
        stores: [s1, s2],
        coverage: covered,
        missingItems,
        hasFullCoverage: missingItems.length === 0,
        storeGroups: [g1, g2]
          .filter(g => g.items.length > 0)
          .map(g => ({ ...g, subtotal: round2(g.subtotal) }))
      };

      if (!best
        || candidate.coverage > best.coverage
        || (candidate.coverage === best.coverage && candidate.total < best.total)) {
        best = candidate;
      }
    }
  }

  return best;
}
