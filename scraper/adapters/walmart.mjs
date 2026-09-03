/**
 * Adaptador para Walmart México (Sitio Oficial).
 *
 * Obtiene precios reales de Walmart México EXCLUSIVAMENTE para los 19 productos
 * definidos en js/data.js.
 *
 * Reglas estrictas:
 *  - No descubre productos adicionales ni navega categorías.
 *  - Prioriza EAN/GTIN exacto; si busca por nombre, valida presentación y marca.
 *  - Si una consulta falla o es bloqueada (ej. WAF/anti-bot), se documenta
 *    y se detiene sin intentar técnicas de evasión.
 */

import { PRODUCTS_CATALOG, SUPERMARKETS } from '../../js/data.js';
import { normalizar } from '../lib/normalize.mjs';
import { get } from '../lib/http.mjs';

const STORE_ID = SUPERMARKETS.walmart?.id || 'walmart';

/**
 * Normaliza y extrae candidatos a partir de HTML (JSON-LD o __NEXT_DATA__)
 * o de un objeto JSON estructurado.
 */
export function extraerCandidatos(contenido) {
  if (!contenido) return [];

  // Si ya es un objeto parsed
  if (typeof contenido === 'object') {
    return normalizarListaCandidatos(contenido);
  }

  const candidatos = [];

  // 1. Extraer Schema.org JSON-LD (<script type="application/ld+json">)
  const ldJsonRegex = /<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = ldJsonRegex.exec(contenido)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Product' || item.offers) {
          const rawPrice = item.offers?.offers?.[0]?.price ?? item.offers?.price ?? item.offers?.lowPrice;
          const price = Number(rawPrice);
          candidatos.push({
            name: item.name || '',
            price: Number.isFinite(price) ? price : null,
            ean: item.gtin13 || item.gtin || item.ean || null,
            sku: item.sku || null,
            url: item.offers?.url || item.url || null,
            availability: item.offers?.availability || null
          });
        } else if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
          for (const el of item.itemListElement) {
            const prod = el.item || el;
            const rawPrice = prod.offers?.price ?? prod.offers?.offers?.[0]?.price;
            const price = Number(rawPrice);
            candidatos.push({
              name: prod.name || '',
              price: Number.isFinite(price) ? price : null,
              ean: prod.gtin13 || prod.gtin || prod.ean || null,
              sku: prod.sku || null,
              url: prod.url || null
            });
          }
        }
      }
    } catch {
      // Ignorar bloque JSON mal formado
    }
  }

  // 2. Extraer __NEXT_DATA__ si existe
  const nextDataRegex = /<script\s+id=["']__NEXT_DATA__["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i;
  const nextMatch = nextDataRegex.exec(contenido);
  if (nextMatch) {
    try {
      const nextData = JSON.parse(nextMatch[1]);
      const items = extraerItemsDeNextData(nextData);
      candidatos.push(...items);
    } catch {
      // Ignorar
    }
  }

  return candidatos;
}

function extraerItemsDeNextData(data) {
  const items = [];
  try {
    const itemStacks = data?.props?.pageProps?.initialData?.searchResult?.itemStacks;
    if (Array.isArray(itemStacks)) {
      for (const stack of itemStacks) {
        if (Array.isArray(stack.items)) {
          for (const it of stack.items) {
            const price = Number(it.priceInfo?.currentPrice?.price ?? it.price);
            items.push({
              name: it.name || it.title || '',
              price: Number.isFinite(price) ? price : null,
              ean: it.upc || it.gtin || it.ean || null,
              sku: it.usItemId || it.id || null,
              url: it.canonicalUrl ? `https://www.walmart.com.mx${it.canonicalUrl}` : null
            });
          }
        }
      }
    }
    // Si es una página de producto directo
    const product = data?.props?.pageProps?.initialData?.product;
    if (product) {
      const price = Number(product.priceInfo?.currentPrice?.price ?? product.price);
      items.push({
        name: product.name || '',
        price: Number.isFinite(price) ? price : null,
        ean: product.upc || product.gtin || product.ean || null,
        sku: product.usItemId || product.id || null,
        url: product.canonicalUrl ? `https://www.walmart.com.mx${product.canonicalUrl}` : null
      });
    }
  } catch {
    // Ignorar errores de recorrido
  }
  return items;
}

function normalizarListaCandidatos(obj) {
  if (Array.isArray(obj)) return obj;
  if (obj.products && Array.isArray(obj.products)) return obj.products;
  if (obj.items && Array.isArray(obj.items)) return obj.items;
  return [obj];
}

/**
 * Valida si un candidato corresponde al producto objetivo.
 * Regla:
 *  1. Coincidencia de EAN/GTIN exacta.
 *  2. Si no hay EAN en el candidato, coincidencia estricta de marca y tamaño/presentación.
 */
export function coincideProducto(candidato, productoObjetivo) {
  if (!candidato || !productoObjetivo) return false;

  // 1. EAN exacto si está disponible en ambos
  if (candidato.ean && productoObjetivo.ean) {
    const cleanCandEan = String(candidato.ean).trim();
    const cleanTargetEan = String(productoObjetivo.ean).trim();
    if (cleanCandEan === cleanTargetEan) return true;
    // Si ambos declaran EAN y difieren, NO coinciden
    return false;
  }

  // 2. Coincidencia por texto normalizado
  const nombreCand = normalizar(candidato.name);
  if (!nombreCand) return false;

  const palabrasObjetivo = normalizar(productoObjetivo.name).split(' ').filter(p => p.length > 2);
  const todasPalabras = palabrasObjetivo.every(p => nombreCand.includes(p));

  // Verificar la presentación/paquete (ej. 850ml, 900g, 30 piezas, 1kg)
  let coincidePresentacion = true;
  if (productoObjetivo.pack) {
    const { amount, unit } = productoObjetivo.pack;
    const patrones = [
      `${amount}${unit}`,
      `${amount} ${unit}`,
      `${amount}`
    ];
    coincidePresentacion = patrones.some(p => nombreCand.includes(normalizar(p)));
  }

  return todasPalabras && coincidePresentacion;
}

export const adaptador = {
  id: 'walmart',
  nombre: 'Walmart México (Sitio Oficial)',
  automatizable: true,
  cadenas: ['walmart'],

  async obtenerPrecios({ log = () => {} } = {}) {
    const productos = PRODUCTS_CATALOG.slice(0, 19);
    log(`  Iniciando consulta para ${productos.length} productos objetivo en Walmart.`);

    const observaciones = [];
    const sugerencias = [];
    const ahora = new Date().toISOString();

    for (const prod of productos) {
      // Prioridad 1: Consulta por EAN exacto
      const query = prod.ean || prod.name;
      const url = `https://www.walmart.com.mx/search?q=${encodeURIComponent(query)}`;

      try {
        log(`  ▶ Consultando [${prod.ean}] ${prod.name}`);
        const res = await get(url, {
          minIntervalMs: 1500,
          timeoutMs: 15000,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-MX,es;q=0.9'
          }
        });

        if (!res.ok) {
          log(`  ⚠️  [${prod.ean}]: HTTP ${res.status}`);
          continue;
        }

        const html = await res.text();

        // Verificar si la respuesta es una redirección de bloqueo anti-bot
        if (html.includes('blocked - redirecting') || res.url?.includes('/blocked')) {
          log(`  🛑 [${prod.ean}]: Walmart bloqueó la petición con redirección a /blocked.`);
          // Detenerse ante bloqueo directo para respetar las reglas de acceso ético
          break;
        }

        const candidatos = extraerCandidatos(html);
        let encontrado = null;

        for (const cand of candidatos) {
          if (cand.price && cand.price > 0 && coincideProducto(cand, prod)) {
            encontrado = cand;
            break;
          }
        }

        if (encontrado) {
          observaciones.push({
            ean: prod.ean,
            storeId: STORE_ID,
            price: Math.round(encontrado.price * 100) / 100,
            capturedAt: ahora,
            source: 'walmart-live',
            sourceUrl: encontrado.url || url,
            raw: {
              scrapedName: encontrado.name,
              sku: encontrado.sku,
              matchedBy: encontrado.ean ? 'ean' : 'name'
            }
          });
          log(`  ✔ [${prod.ean}]: $${encontrado.price.toFixed(2)} MXN ("${encontrado.name}")`);
        } else {
          log(`  ✖ [${prod.ean}]: Sin precio / no encontrado candidato con coincidencia estricta.`);
          sugerencias.push({ clave: `${prod.name} (${prod.ean})`, veces: 1 });
        }
      } catch (err) {
        log(`  ✖ [${prod.ean}]: Error al consultar (${err.message})`);
        if (err.status === 307 || err.status === 403 || err.message?.includes('blocked')) {
          log(`  🛑 Detectado bloqueo (${err.message}). Deteniendo consultas respetando PASO 6.`);
          break;
        }
      }
    }

    return {
      observaciones,
      sugerencias,
      meta: {
        totalObjetivo: productos.length,
        totalObservaciones: observaciones.length,
        fuente: 'https://www.walmart.com.mx'
      }
    };
  }
};
