/** Fair comparison helpers: missing local references are never treated as zero. */
import { SUPERMARKETS } from './data.js';

const money = value => Math.round(value * 100) / 100;
const hasPrice = value => Number.isFinite(Number(value)) && Number(value) > 0;

export function getStoreComparison(items, storeId) {
  const rows = items.map(item => {
    const unitPrice = item.prices?.[storeId];
    const verified = hasPrice(unitPrice);
    return { ...item, unitPrice: verified ? Number(unitPrice) : null,
      subtotal: verified ? money(Number(unitPrice) * item.quantity) : null, verified };
  });
  const covered = rows.filter(row => row.verified);
  return {
    store: SUPERMARKETS[storeId], rows, coveredCount: covered.length, itemCount: rows.length,
    complete: covered.length === rows.length,
    total: covered.length ? money(covered.reduce((sum, row) => sum + row.subtotal, 0)) : null
  };
}

export function calculateOptimizations(items) {
  if (!items?.length) return null;
  const stores = Object.keys(SUPERMARKETS).map(id => getStoreComparison(items, id));
  const comparable = stores.filter(store => store.complete).sort((a, b) => a.total - b.total);
  return { itemsCount: items.length, stores, comparable, bestComparable: comparable[0] || null };
}
