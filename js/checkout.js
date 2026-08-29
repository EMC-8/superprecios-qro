/**
 * Handoff al sitio oficial del supermercado.
 *
 * Viene de upstream (EMC-8), adaptado a esta arquitectura. El cambio de fondo:
 * aquí los ítems NO cargan precios pegados — llevan EAN y el precio se resuelve
 * contra la tabla. Por eso lo que se comparte y lo que se reconstruye es la
 * *identidad* del producto, no su precio: un precio viajando dentro de una URL
 * queda congelado en el momento en que se generó el enlace, y el receptor lo
 * vería como actual.
 *
 * Las cadenas no ofrecen un carrito universal ni una API de carrito abierta.
 * Este flujo no simula ser el retailer: conserva tu lista para que no la
 * reescribas, y el inicio de sesión, la sucursal, la disponibilidad, el
 * domicilio y el pago ocurren únicamente en el dominio oficial.
 */

import { PRODUCTS_CATALOG } from './data.js';

/** Límite de ítems en un enlace compartido: acota el tamaño de la URL y el abuso. */
const MAX_ITEMS_COMPARTIDOS = 60;

const eanValido = (valor) => /^\d{8,14}$/.test(String(valor || ''));

export const getOfficialStoreUrl = (store) =>
  store.homeUrl || (store.searchUrl ? store.searchUrl('') : '');

export const getOfficialProductUrl = (store, item) =>
  store.searchUrl ? store.searchUrl(item.name) : getOfficialStoreUrl(store);

/** Cantidad legible, respetando la unidad de venta. */
export function formatQuantity(item) {
  return item.unit === 'kg' ? `${item.quantity} kg` : `${item.quantity} ${item.unit}`;
}

/**
 * Lista en texto plano para pegar en el chat del súper, en notas o en WhatsApp.
 */
export function formatStoreList(store, items, fulfillment) {
  const modalidad = fulfillment === 'pickup' ? 'Recoger en tienda' : 'Entrega a domicilio';
  return [
    `Lista para ${store.name}`,
    `Modalidad deseada: ${modalidad}`,
    '',
    ...items.map(item =>
      `- ${formatQuantity(item)} ${item.name}${eanValido(item.ean) ? ` | EAN ${item.ean}` : ''}`
    ),
    '',
    'Confirma existencias, cobertura y costo final directamente con el supermercado.'
  ].join('\n');
}

/**
 * Codifica la canasta en el fragmento de la URL.
 *
 * Va en el hash y no en el query string a propósito: el fragmento no se manda
 * al servidor, así que la lista de compras de alguien no termina en logs de
 * acceso ni en referers.
 */
export function buildShareUrl(items) {
  const payload = items.slice(0, MAX_ITEMS_COMPARTIDOS).map(item => ({
    c: item.catalogId || null,
    e: item.ean || null,
    n: String(item.name || '').slice(0, 120),
    u: String(item.unit || 'pz').slice(0, 20),
    q: Number(item.quantity) || 1,
    x: Boolean(item.isCustom)
  }));

  const json = JSON.stringify(payload);
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

  return `${window.location.href.split('#')[0]}#cart=${encoded}`;
}

/**
 * Reconstruye una canasta compartida desde la URL.
 *
 * Todo lo que entra por aquí es INSEGURO: lo escribió quien armó el enlace, no
 * el usuario que lo abre. Por eso los productos del catálogo se reconstruyen
 * desde el catálogo local (se usa sólo el id para buscarlo) y de los
 * personalizados sólo sobrevive un nombre recortado. Quien pinte esto tiene que
 * escaparlo igual: ver escaparHtml() en app.js.
 */
export function readSharedCart() {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get('cart');
  if (!encoded) return null;

  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(base64 + relleno), c => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));

    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_ITEMS_COMPARTIDOS) {
      return null;
    }
    const items = parsed.map(aItemDeCompra).filter(Boolean);
    // Si nada sobrevivio la validacion, el enlace no sirve. Devolver [] obligaria
    // a cada llamador a distinguir "sin enlace" de "enlace inutil"; null es una
    // sola senal de "no hay canasta que cargar".
    return items.length > 0 ? items : null;
  } catch (e) {
    return null;
  }
}

/** Quita el ?cart= de la barra sin recargar, para que un refresh no lo reimporte. */
export function clearSharedCartFromUrl() {
  if (window.location.hash.includes('cart=')) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

  // Respaldo para contextos sin clipboard API (http, WebViews viejos).
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

/**
 * Un renglón compartido -> ítem de la canasta.
 * Devuelve null si no se puede confiar en el renglón.
 */
function aItemDeCompra(renglon) {
  const cantidad = Number(renglon?.q);
  if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) return null;

  // Producto del catálogo: se reconstruye desde el catálogo local, no desde el
  // enlace. Así un enlace manipulado no puede inventar un producto ni su precio.
  const delCatalogo = renglon.c
    ? PRODUCTS_CATALOG.find(p => p.id === renglon.c)
    : (renglon.e ? PRODUCTS_CATALOG.find(p => p.ean === renglon.e) : null);

  if (delCatalogo) {
    return {
      id: delCatalogo.id,
      catalogId: delCatalogo.id,
      ean: delCatalogo.ean,
      name: delCatalogo.name,
      category: delCatalogo.category,
      unit: delCatalogo.unit,
      quantity: cantidad,
      rawInput: delCatalogo.name,
      measureNote: null,
      isCustom: false
    };
  }

  // Personalizado: sólo sobrevive un nombre recortado. Sin precios: los
  // estimados se recalculan localmente, nunca se aceptan desde la URL.
  if (!renglon.x || !renglon.n) return null;

  return {
    id: `compartido-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    catalogId: null,
    ean: null,
    name: String(renglon.n).slice(0, 120),
    category: 'despensa',
    unit: String(renglon.u || 'pz').slice(0, 20),
    quantity: cantidad,
    estimatedPrices: {},
    rawInput: String(renglon.n).slice(0, 120),
    measureNote: null,
    isEstimatedPrice: true,
    isCustom: true
  };
}
