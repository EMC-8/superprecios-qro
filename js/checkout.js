/** Official retailer handoff helpers. Retailer carts require approved integrations. */
import { PRODUCTS_CATALOG } from './data.js';

export const getOfficialStoreUrl = store => store.searchUrl ? store.searchUrl('') : '';
export const getOfficialProductUrl = (store, item) => store.searchUrl ? store.searchUrl(item.name) : getOfficialStoreUrl(store);

export function formatStoreList(store, items, fulfillment) {
  const mode = fulfillment === 'pickup' ? 'Recoger en tienda' : 'Entrega a domicilio';
  return [
    `Lista para ${store.name}`,
    `Modalidad deseada: ${mode}`,
    '',
    ...items.map(item => `- ${item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`} ${item.name}`),
    '',
    'Confirma existencias, cobertura y costo final directamente con el supermercado.'
  ].join('\n');
}

export function buildShareUrl(items) {
  const payload = items.slice(0, 60).map(item => ({
    catalogId: item.catalogId || null,
    name: String(item.name || '').slice(0, 120), category: String(item.category || 'despensa').slice(0, 50),
    unit: String(item.unit || 'pz').slice(0, 20), quantity: Number(item.quantity) || 1,
    prices: item.prices || {}, ean: item.ean || null, isCustom: Boolean(item.isCustom)
  }));
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${window.location.href.split('#')[0]}#cart=${encoded}`;
}

export function readSharedCart() {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get('cart');
  if (!encoded) return null;
  try {
    const value = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = decodeURIComponent(escape(atob(value + '='.repeat((4 - value.length % 4) % 4))));
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed) || !parsed.length || parsed.length > 60) return null;
    return parsed.map(toShoppingItem).filter(Boolean);
  } catch { return null; }
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text; textarea.setAttribute('readonly', ''); textarea.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
}

function toShoppingItem(item) {
  const quantity = Number(item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) return null;
  const catalog = PRODUCTS_CATALOG.find(product => product.id === item.catalogId);
  if (catalog) return { id: catalog.id, catalogId: catalog.id, name: catalog.name, category: catalog.category, unit: catalog.unit, quantity, prices: catalog.prices, ean: catalog.ean || null, rawInput: catalog.name, isCustom: false };
  if (!item.isCustom || !item.name || typeof item.prices !== 'object') return null;
  const prices = Object.fromEntries(Object.entries(item.prices).filter(([, price]) => Number.isFinite(Number(price)) && Number(price) >= 0 && Number(price) < 100000));
  return { id: `shared-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`, catalogId: null, name: String(item.name).slice(0, 120), category: String(item.category || 'despensa').slice(0, 50), unit: String(item.unit || 'pz').slice(0, 20), quantity, prices, ean: /^\d{8,14}$/.test(item.ean || '') ? item.ean : null, rawInput: String(item.name).slice(0, 120), isCustom: true };
}
