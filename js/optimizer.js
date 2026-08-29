/**
 * Motor de Optimización de Precios para Supermercados en Querétaro.
 * 
 * Calcula:
 * 1. Total por cada supermercado individual (para comparar la canasta completa).
 * 2. Mejor supermercado único (comprar todo en 1 solo lugar).
 * 3. División óptima multi-tienda (comprar cada producto donde sea más barato).
 * 4. Estrategia equilibrada (Mejor combinación de exactamente 2 tiendas).
 */

import { SUPERMARKETS } from './data.js';

export function calculateOptimizations(items) {
  if (!items || items.length === 0) {
    return null;
  }

  const storeKeys = Object.keys(SUPERMARKETS);

  // 1. Totales por supermercado individual
  const singleStoreTotals = {};
  for (const storeId of storeKeys) {
    let total = 0;
    const storeItems = [];

    for (const item of items) {
      const unitPrice = (item.prices && item.prices[storeId]) ? item.prices[storeId] : 0;
      const itemSubtotal = unitPrice * item.quantity;
      total += itemSubtotal;

      storeItems.push({
        ...item,
        unitPrice,
        subtotal: itemSubtotal
      });
    }

    singleStoreTotals[storeId] = {
      store: SUPERMARKETS[storeId],
      total: Math.round(total * 100) / 100,
      items: storeItems
    };
  }

  // Ordenar tiendas de menor a mayor costo total
  const sortedSingleStores = Object.values(singleStoreTotals).sort((a, b) => a.total - b.total);
  const bestSingleStore = sortedSingleStores[0];
  const worstSingleStore = sortedSingleStores[sortedSingleStores.length - 1];

  // 2. Optimización Multi-tienda (Ahorro Máximo Absoluto)
  let multiStoreTotal = 0;
  const storeGroups = {};
  for (const storeId of storeKeys) {
    storeGroups[storeId] = {
      store: SUPERMARKETS[storeId],
      items: [],
      subtotal: 0
    };
  }

  const optimizedItems = items.map(item => {
    let minPrice = Infinity;
    let bestStoreId = null;
    const pricesComparison = [];

    for (const storeId of storeKeys) {
      const price = item.prices[storeId] || 0;
      pricesComparison.push({
        storeId,
        storeName: SUPERMARKETS[storeId].shortName,
        price
      });

      if (price > 0 && price < minPrice) {
        minPrice = price;
        bestStoreId = storeId;
      }
    }

    // Ordenar precios de menor a mayor
    pricesComparison.sort((a, b) => a.price - b.price);

    const itemSubtotal = minPrice * item.quantity;
    multiStoreTotal += itemSubtotal;

    const optimizedItem = {
      ...item,
      bestStoreId,
      bestStore: SUPERMARKETS[bestStoreId],
      unitPrice: minPrice,
      subtotal: Math.round(itemSubtotal * 100) / 100,
      pricesComparison,
      singleStoreDiff: (bestSingleStore.items.find(i => i.id === item.id)?.unitPrice || minPrice) - minPrice
    };

    if (bestStoreId && storeGroups[bestStoreId]) {
      storeGroups[bestStoreId].items.push(optimizedItem);
      storeGroups[bestStoreId].subtotal += itemSubtotal;
    }

    return optimizedItem;
  });

  // Filtrar solo tiendas que tengan al menos 1 producto asignado
  const activeMultiStores = Object.values(storeGroups)
    .filter(group => group.items.length > 0)
    .map(group => ({
      ...group,
      subtotal: Math.round(group.subtotal * 100) / 100
    }))
    .sort((a, b) => b.subtotal - a.subtotal);

  // 3. Estrategia Equilibrada (Máximo 2 Tiendas)
  const bestTwoStores = findBestTwoStoresCombo(items, storeKeys);

  // Totales redondeados
  multiStoreTotal = Math.round(multiStoreTotal * 100) / 100;
  const maxSavingsVsWorst = Math.round((worstSingleStore.total - multiStoreTotal) * 100) / 100;
  const savingsVsBestSingle = Math.round((bestSingleStore.total - multiStoreTotal) * 100) / 100;
  const savingsPercentage = worstSingleStore.total > 0 
    ? Math.round((maxSavingsVsWorst / worstSingleStore.total) * 100) 
    : 0;

  return {
    itemsCount: items.length,
    totalUnits: items.reduce((acc, it) => acc + it.quantity, 0),
    singleStoreTotals: sortedSingleStores,
    bestSingleStore,
    worstSingleStore,
    multiStore: {
      total: multiStoreTotal,
      storesCount: activeMultiStores.length,
      storeGroups: activeMultiStores,
      items: optimizedItems
    },
    twoStoresCombo: bestTwoStores,
    savings: {
      maxSavingsVsWorst,
      savingsVsBestSingle,
      savingsPercentage,
      bestSingleDiff: bestSingleStore.total - multiStoreTotal
    }
  };
}

/**
 * Encuentra el par de 2 supermercados que minimiza el costo total
 */
function findBestTwoStoresCombo(items, storeKeys) {
  let bestCombo = null;
  let minComboTotal = Infinity;

  // Generar todas las combinaciones de pares
  for (let i = 0; i < storeKeys.length; i++) {
    for (let j = i + 1; j < storeKeys.length; j++) {
      const s1 = storeKeys[i];
      const s2 = storeKeys[j];

      let comboTotal = 0;
      const group1 = { store: SUPERMARKETS[s1], items: [], subtotal: 0 };
      const group2 = { store: SUPERMARKETS[s2], items: [], subtotal: 0 };

      for (const item of items) {
        const p1 = item.prices[s1] || Infinity;
        const p2 = item.prices[s2] || Infinity;

        if (p1 <= p2) {
          const sub = p1 * item.quantity;
          comboTotal += sub;
          group1.items.push({ ...item, unitPrice: p1, subtotal: sub, assignedStore: s1 });
          group1.subtotal += sub;
        } else {
          const sub = p2 * item.quantity;
          comboTotal += sub;
          group2.items.push({ ...item, unitPrice: p2, subtotal: sub, assignedStore: s2 });
          group2.subtotal += sub;
        }
      }

      if (comboTotal < minComboTotal) {
        minComboTotal = comboTotal;
        bestCombo = {
          total: Math.round(comboTotal * 100) / 100,
          stores: [s1, s2],
          storeGroups: [group1, group2].filter(g => g.items.length > 0).map(g => ({
            ...g,
            subtotal: Math.round(g.subtotal * 100) / 100
          }))
        };
      }
    }
  }

  return bestCombo;
}
