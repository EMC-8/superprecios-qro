/**
 * Capa de precios: la única fuente de verdad de cuánto cuesta cada producto.
 *
 * Los precios NO viven en el código. Viven en `data/prices.json`, y esta capa
 * los carga, los cachea y los expone al resto de la app. Ese archivo es el
 * único contrato que tiene que cumplir un scraper: si lo escribe con el
 * esquema de abajo, la app entera funciona sin tocar una línea de JS.
 *
 * Esquema de data/prices.json:
 *
 *   {
 *     "generatedAt": "2026-08-29T06:00:00.000Z",  // ISO-8601, obligatorio
 *     "source":      "captura-manual",            // id corto de la fuente
 *     "sourceLabel": "Captura manual...",         // lo que ve el usuario
 *     "currency":    "MXN",
 *     "region":      "Queretaro, Qro., MX",
 *     "postalCode":  "76000",                     // CP con el que se consultó
 *     "products": {
 *       "<EAN-13>": { "<storeId>": <precio>, ... }
 *     }
 *   }
 *
 * Reglas del contrato:
 *  - Las llaves de `products` son EAN-13 y deben existir en PRODUCTS_CATALOG.
 *  - Los `storeId` deben existir en SUPERMARKETS (data.js).
 *  - Un precio ausente significa "no se conoce el precio en esa tienda", NO cero.
 *    El optimizador lo trata como producto no disponible ahí.
 *  - Un precio <= 0 o no numérico se descarta al cargar.
 */

import { SUPERMARKETS, PRODUCTS_CATALOG } from './data.js';
import { SUPABASE, isSupabaseConfigured } from './config.js';

export const PRICES_URL = './data/prices.json';
const CACHE_KEY = 'superprecios_qro_prices_cache_v1';

const VALID_STORE_IDS = new Set(Object.keys(SUPERMARKETS));
const KNOWN_EANS = new Set(PRODUCTS_CATALOG.map(p => p.ean).filter(Boolean));

/**
 * Descarta lo que no cumpla el contrato en vez de propagar basura al optimizador.
 * Devuelve la tabla saneada y la lista de problemas encontrados.
 */
export function sanitizePriceTable(raw) {
  const issues = [];
  if (!raw || typeof raw !== 'object' || !raw.products || typeof raw.products !== 'object') {
    return { products: {}, meta: null, issues: ['El archivo no tiene la forma { products: {...} }'] };
  }

  const products = {};
  for (const [ean, byStore] of Object.entries(raw.products)) {
    if (!KNOWN_EANS.has(ean)) {
      issues.push(`EAN ${ean} no está en el catálogo; se ignora`);
      continue;
    }
    if (!byStore || typeof byStore !== 'object') continue;

    const clean = {};
    for (const [storeId, price] of Object.entries(byStore)) {
      if (!VALID_STORE_IDS.has(storeId)) {
        issues.push(`Tienda desconocida "${storeId}" en EAN ${ean}; se ignora`);
        continue;
      }
      const n = Number(price);
      if (!Number.isFinite(n) || n <= 0) {
        issues.push(`Precio inválido (${price}) en ${storeId}/${ean}; se ignora`);
        continue;
      }
      clean[storeId] = Math.round(n * 100) / 100;
    }
    if (Object.keys(clean).length > 0) products[ean] = clean;
  }

  const meta = {
    generatedAt: raw.generatedAt || null,
    source: raw.source || 'desconocida',
    sourceLabel: raw.sourceLabel || 'Origen no declarado',
    currency: raw.currency || 'MXN',
    region: raw.region || null,
    postalCode: raw.postalCode || null
  };

  return { products, meta, issues };
}

/**
 * Envuelve la tabla en un objeto con los accesos que necesita el resto de la app.
 */
export function createPriceTable(products, meta, origin, issues = []) {
  return {
    origin,               // 'network' | 'cache' | 'none'
    meta,
    issues,
    isEmpty: Object.keys(products).length === 0,

    /** Precios de un producto por tienda. Objeto vacío si no se conoce ninguno. */
    getPrices(ean) {
      return (ean && products[ean]) ? products[ean] : {};
    },

    /** Cuántos productos del catálogo tienen al menos un precio. */
    get pricedProductCount() {
      return Object.keys(products).length;
    },

    /** Etiqueta legible de qué tan frescos son los precios. */
    freshnessLabel() {
      if (!meta || !meta.generatedAt) return 'sin fecha';
      const then = new Date(meta.generatedAt);
      if (Number.isNaN(then.getTime())) return 'sin fecha';
      const days = Math.floor((Date.now() - then.getTime()) / 86400000);
      if (days <= 0) return 'hoy';
      if (days === 1) return 'ayer';
      if (days < 30) return `hace ${days} días`;
      const months = Math.floor(days / 30);
      return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
    },

    /** true si los precios ya están tan viejos que conviene avisar. */
    isStale(maxDays = 14) {
      if (!meta || !meta.generatedAt) return true;
      const then = new Date(meta.generatedAt);
      if (Number.isNaN(then.getTime())) return true;
      return (Date.now() - then.getTime()) / 86400000 > maxDays;
    }
  };
}

/**
 * Pide el snapshot a Supabase.
 * La función `prices_snapshot()` devuelve exactamente el mismo documento que
 * data/prices.json, así que a partir de aquí todo el código es el mismo.
 */
async function fetchFromSupabase(fetchImpl) {
  const res = await fetchImpl(`${SUPABASE.url}/rest/v1/rpc/prices_snapshot`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE.publishableKey,
      'Authorization': `Bearer ${SUPABASE.publishableKey}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res.json();
}

async function fetchFromStaticFile(fetchImpl) {
  const res = await fetchImpl(PRICES_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Carga los precios probando fuentes en orden:
 *   1. Supabase (si está configurado): el dato más fresco.
 *   2. data/prices.json: respaldo versionado, precacheado por el Service Worker.
 *   3. Copia en localStorage: último recurso cuando no hay red.
 *
 * Nunca lanza: si todo falla devuelve una tabla vacía con origin 'none'
 * para que la UI pueda decirlo en vez de mostrar totales inventados.
 */
export async function loadPriceTable(fetchImpl = globalThis.fetch) {
  const sources = [];
  if (isSupabaseConfigured()) {
    sources.push({ origin: 'supabase', load: () => fetchFromSupabase(fetchImpl) });
  }
  sources.push({ origin: 'network', load: () => fetchFromStaticFile(fetchImpl) });

  for (const source of sources) {
    try {
      const raw = await source.load();
      const { products, meta, issues } = sanitizePriceTable(raw);
      if (Object.keys(products).length === 0) throw new Error('Tabla de precios vacía tras validar');

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(raw));
      } catch (e) {
        // Cuota llena o modo privado: se puede seguir sin caché.
      }
      if (issues.length) console.warn('[precios] Entradas descartadas:', issues);
      return createPriceTable(products, meta, source.origin, issues);
    } catch (err) {
      console.warn(`[precios] Fuente "${source.origin}" no disponible:`, err.message);
    }
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { products, meta, issues } = sanitizePriceTable(JSON.parse(cached));
      if (Object.keys(products).length > 0) {
        return createPriceTable(products, meta, 'cache', issues);
      }
    }
  } catch (e) {
    console.warn('[precios] Caché local ilegible:', e.message);
  }

  return createPriceTable({}, null, 'none', ['No hay precios disponibles ni en red ni en caché']);
}
