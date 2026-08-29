/**
 * Adaptador para Chedraui (Sitio Oficial).
 *
 * Lee directamente las páginas de producto oficiales mapeadas y extrae
 * la información estructurada Schema.org (Product / Offer) desde los bloques
 * <script type="application/ld+json">.
 *
 * Cumple con los buenos modales HTTP: intervalos respetuosos, reintentos controlados
 * y extracción exacta de precios numéricos en MXN.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { get } from '../lib/http.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAPEO_PATH = path.join(AQUI, '..', 'mappings', 'chedraui.json');

async function cargarMapeo() {
  try {
    const raw = await readFile(MAPEO_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { entradas: [] };
  }
}

function extraerPrecioJsonLd(html) {
  const ldJsonRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = ldJsonRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'Product' || data.offers) {
        const rawPrice = data.offers?.offers?.[0]?.price ?? data.offers?.lowPrice ?? data.offers?.price;
        const price = Number(rawPrice);
        if (!isNaN(price) && price > 0) {
          return {
            name: data.name,
            price,
            availability: data.offers?.offers?.[0]?.availability || 'InStock',
            sku: data.sku || data.mpn
          };
        }
      }
    } catch {
      // Si un bloque falla al parsear, se continúa con el siguiente
    }
  }
  return null;
}

export const adaptador = {
  id: 'chedraui',
  nombre: 'Chedraui (Sitio Oficial)',
  automatizable: true,
  cadenas: ['chedraui'],

  async obtenerPrecios({ log = () => {} } = {}) {
    const mapeo = await cargarMapeo();
    const entradas = mapeo.entradas || [];
    log(`  Cargadas ${entradas.length} entradas del mapeo de Chedraui.`);

    const observaciones = [];
    const sugerencias = [];
    const ahora = new Date().toISOString();

    for (const entrada of entradas) {
      const { ean, producto, url } = entrada;
      if (!url || !ean) continue;

      try {
        const res = await get(url, {
          minIntervalMs: 600,
          timeoutMs: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        if (!res.ok) {
          log(`  ⚠️  [${ean}] ${producto}: HTTP ${res.status}`);
          continue;
        }

        const html = await res.text();
        const info = extraerPrecioJsonLd(html);

        if (info && info.price > 0) {
          observaciones.push({
            ean,
            storeId: 'chedraui',
            price: info.price,
            capturedAt: ahora,
            source: 'chedraui-live',
            sourceUrl: url,
            raw: {
              scrapedName: info.name,
              sku: info.sku,
              availability: info.availability
            }
          });
          log(`  ✔ [${ean}] ${producto}: $${info.price.toFixed(2)} MXN ("${info.name}")`);
        } else {
          log(`  ✖ [${ean}] ${producto}: No se encontró precio válido en JSON-LD`);
          sugerencias.push({ clave: `${producto} (${url})`, veces: 1 });
        }
      } catch (err) {
        log(`  ✖ [${ean}] ${producto}: Error al consultar (${err.message})`);
      }
    }

    return {
      observaciones,
      sugerencias,
      meta: {
        totalMapeados: entradas.length,
        totalCapturados: observaciones.length,
        fuente: 'https://www.chedraui.com.mx'
      }
    };
  }
};
