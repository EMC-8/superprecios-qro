/**
 * Adaptador Walmart México — SerpApi.
 *
 * Obtiene precios reales de Walmart México EXCLUSIVAMENTE para los 19 productos
 * definidos en js/data.js, usando SerpApi como intermediario legítimo.
 *
 * Flujo por producto:
 *   1. Consulta directa por us_item_id (del mapping scraper/mappings/walmart-items.json).
 *   2. Si no hay ID o el ID está inválido → fallback de rediscovery por nombre.
 *   3. El adaptador nunca actualiza walmart-items.json: solo loggea el ID nuevo
 *      para que una persona lo confirme y haga commit.
 *
 * Reglas estrictas:
 *   - No scraping directo de walmart.com.mx.
 *   - No evasión de Akamai/WAF. SerpApi gestiona eso en sus servidores.
 *   - No generar us_item_id a partir del EAN.
 *   - No descubrir productos adicionales fuera del catálogo.
 *   - Un precio ausente es mejor que uno incorrecto.
 *
 * Variables de entorno requeridas:
 *   SERPAPI_KEY — API key de SerpApi. Sin ella el adaptador falla.
 *
 * Fuente: https://serpapi.com/walmart-search-api
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { PRODUCTS_CATALOG } from '../../js/data.js';
import { normalizar } from '../lib/normalize.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = path.join(AQUI, '..', 'mappings', 'walmart-items.json');

const STORE_ID = 'walmart';
const SERPAPI_BASE = 'https://serpapi.com/search.json';
const WALMART_DOMAIN = 'walmart.com.mx';

// Ritmo de peticiones: SerpApi no requiere throttling agresivo, pero ser
// cortés evita errores de rate-limit en cuentas gratuitas.
const PAUSA_MS = 1200;

// ---------------------------------------------------------------------------
// Carga del mapping
// ---------------------------------------------------------------------------

async function cargarMapping() {
  try {
    const raw = await readFile(MAPPING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { items: [], _sin_mapear: [] };
  }
}

/** Índice EAN → us_item_id a partir del mapping cargado. */
function indexarMapping(mapping) {
  const idx = new Map();
  for (const item of (mapping.items || [])) {
    if (item.ean && item.us_item_id) {
      idx.set(item.ean, item);
    }
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Consulta SerpApi
// ---------------------------------------------------------------------------

/**
 * Realiza una petición a SerpApi para Walmart México.
 * @param {string} query - us_item_id o término de búsqueda por nombre.
 * @param {string} apiKey
 * @returns {Promise<object>} Respuesta JSON de SerpApi.
 */
async function consultarSerpApi(query, apiKey) {
  const params = new URLSearchParams({
    engine: 'walmart',
    walmart_domain: WALMART_DOMAIN,
    query,
    api_key: apiKey
  });
  const url = `${SERPAPI_BASE}?${params}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const texto = (await res.text()).slice(0, 300);
    throw new Error(`SerpApi HTTP ${res.status}: ${texto}`);
  }
  return res.json();
}

/**
 * Extrae el primer resultado orgánico con precio de la respuesta de SerpApi.
 * @returns {{ precio: number, nombre: string, us_item_id: string, url: string } | null}
 */
function extraerPrimerResultado(response) {
  const resultados = response?.organic_results;
  if (!Array.isArray(resultados) || resultados.length === 0) return null;

  for (const r of resultados) {
    // SerpApi puede devolver primary_price, price o extracted_price según el tipo de página.
    const precio = Number(r.primary_price ?? r.price ?? r.extracted_price);
    if (!Number.isFinite(precio) || precio <= 0) continue;
    return {
      precio: Math.round(precio * 100) / 100,
      nombre: r.title || r.name || '',
      us_item_id: String(r.us_item_id || r.item_id || ''),
      url: r.product_page_url || r.link || `https://www.walmart.com.mx/ip/${r.us_item_id || ''}`
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validación de coincidencia (cordura mínima)
// ---------------------------------------------------------------------------

/**
 * Comprueba que el resultado devuelto por Walmart corresponda mínimamente al
 * producto esperado. No es una validación estricta: sirve para detectar
 * cuando un ID ha rotado y ahora apunta a un producto completamente distinto.
 *
 * Exige que al menos UNA palabra significativa de la marca o del tipo de
 * producto aparezca en el nombre devuelto.
 */
export function esResultadoPlausible(nombreWalmart, productoEsperado) {
  if (!nombreWalmart || !productoEsperado) return false;
  const normWalmart = normalizar(nombreWalmart);

  // Extraer palabras significativas del nombre del catálogo (> 3 caracteres)
  const palabrasClave = normalizar(productoEsperado.name)
    .split(' ')
    .filter(p => p.length > 3);

  // Al menos la mitad de las palabras clave deben aparecer en el nombre de Walmart.
  const coincidencias = palabrasClave.filter(p => normWalmart.includes(p));
  return coincidencias.length >= Math.ceil(palabrasClave.length / 2);
}

/**
 * Construye la query de búsqueda por nombre para el fallback.
 * Usa marca + producto + presentación para maximizar la precisión.
 */
export function construirQueryNombre(producto) {
  // El nombre en el catálogo ya tiene marca + tipo + presentación.
  // Ej: "Leche Lala Entera 1 Litro", "Atún Dolores en Agua Aleta Amarilla 140g"
  return producto.name;
}

// ---------------------------------------------------------------------------
// Lógica principal de consulta por producto
// ---------------------------------------------------------------------------

/**
 * Consulta un producto directamente por su us_item_id.
 * @returns {{ resultado, metodo } | null}
 */
async function consultarPorId(us_item_id, producto, apiKey, log) {
  log(`    Consulta directa: ID ${us_item_id}`);
  const response = await consultarSerpApi(us_item_id, apiKey);
  const resultado = extraerPrimerResultado(response);

  if (!resultado) {
    log(`    ⚠️  ID ${us_item_id} no devolvió resultados (inválido o caducado).`);
    return null;
  }

  if (!esResultadoPlausible(resultado.nombre, producto)) {
    log(`    ⚠️  ID ${us_item_id} devolvió "${resultado.nombre.slice(0, 60)}" — no coincide con "${producto.name}". ID posiblemente rotado.`);
    return null;
  }

  return { resultado, metodo: 'direct_id' };
}

/**
 * Búsqueda por nombre como fallback o rediscovery.
 * Recorre los resultados hasta encontrar uno que coincida con la presentación.
 * @returns {{ resultado, metodo, idNuevo } | null}
 */
async function consultarPorNombre(producto, apiKey, log) {
  const query = construirQueryNombre(producto);
  log(`    Fallback por nombre: "${query}"`);
  const response = await consultarSerpApi(query, apiKey);
  const resultados = response?.organic_results;

  if (!Array.isArray(resultados) || resultados.length === 0) {
    log(`    ✖ Sin resultados para "${query}".`);
    return null;
  }

  for (const r of resultados) {
    const precio = Number(r.primary_price ?? r.price ?? r.extracted_price);
    if (!Number.isFinite(precio) || precio <= 0) continue;

    const candidato = {
      precio: Math.round(precio * 100) / 100,
      nombre: r.title || r.name || '',
      us_item_id: String(r.us_item_id || r.item_id || ''),
      url: r.product_page_url || r.link || `https://www.walmart.com.mx/ip/${r.us_item_id || ''}`
    };

    if (esResultadoPlausible(candidato.nombre, producto)) {
      return { resultado: candidato, metodo: 'name_search', idNuevo: candidato.us_item_id };
    }
  }

  log(`    ✖ Ningún resultado de "${query}" coincide con la presentación esperada.`);
  return null;
}

// ---------------------------------------------------------------------------
// Pausa entre peticiones
// ---------------------------------------------------------------------------

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Función principal del adaptador
// ---------------------------------------------------------------------------

export async function obtenerPrecios({ log = console.log } = {}) {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error('SERPAPI_KEY no está configurada. Agrega la variable de entorno o el secreto de CI.');
  }

  const mapping = await cargarMapping();
  const idx = indexarMapping(mapping);
  const sinMapear = new Set((mapping._sin_mapear || []).map(e => e.ean));

  log(`  Mapping cargado: ${idx.size} IDs conocidos, ${sinMapear.size} sin mapear.`);

  const productos = PRODUCTS_CATALOG;
  const observaciones = [];
  const sugerencias = [];
  const ahora = new Date().toISOString();
  let peticiones = 0;

  for (const producto of productos) {
    const entradaMapping = idx.get(producto.ean);
    let encontrado = null;

    // --- Consulta directa por ID (si existe en el mapping) ---
    if (entradaMapping?.us_item_id) {
      try {
        if (peticiones > 0) await esperar(PAUSA_MS);
        peticiones++;
        encontrado = await consultarPorId(entradaMapping.us_item_id, producto, apiKey, log);
      } catch (err) {
        log(`    ✖ Error en consulta directa [${producto.ean}]: ${err.message}`);
      }

      // Si el ID resultó inválido, hacemos rediscovery por nombre
      if (!encontrado) {
        log(`    → Rediscovery por nombre para [${producto.ean}] "${producto.name}"`);
        try {
          await esperar(PAUSA_MS);
          peticiones++;
          const fallback = await consultarPorNombre(producto, apiKey, log);
          if (fallback) {
            encontrado = fallback;
            if (fallback.idNuevo && fallback.idNuevo !== entradaMapping.us_item_id) {
              log(`    ⚠️  ACTUALIZAR MAPPING: EAN ${producto.ean} — ID viejo: ${entradaMapping.us_item_id} → ID nuevo: ${fallback.idNuevo}`);
              log(`       Agrega este cambio en scraper/mappings/walmart-items.json antes del próximo commit.`);
            }
          }
        } catch (err) {
          log(`    ✖ Error en fallback [${producto.ean}]: ${err.message}`);
        }
      }
    } else {
      // --- Sin ID en mapping: búsqueda por nombre directamente ---
      if (sinMapear.has(producto.ean)) {
        log(`  ⚠️  [${producto.ean}] "${producto.name}" está en _sin_mapear; se intenta rediscovery.`);
      } else {
        log(`  ○ [${producto.ean}] "${producto.name}" sin ID conocido; se intenta búsqueda por nombre.`);
      }

      try {
        if (peticiones > 0) await esperar(PAUSA_MS);
        peticiones++;
        const fallback = await consultarPorNombre(producto, apiKey, log);
        if (fallback) {
          encontrado = fallback;
          if (fallback.idNuevo) {
            log(`    ℹ️  NUEVO ID ENCONTRADO: EAN ${producto.ean} → us_item_id: ${fallback.idNuevo}`);
            log(`       Agrega en scraper/mappings/walmart-items.json para futuras corridas.`);
          }
        }
      } catch (err) {
        log(`    ✖ Error en búsqueda por nombre [${producto.ean}]: ${err.message}`);
      }
    }

    // --- Emitir observación o registrar sugerencia ---
    if (encontrado?.resultado) {
      const { resultado, metodo } = encontrado;
      observaciones.push({
        ean: producto.ean,
        storeId: STORE_ID,
        price: resultado.precio,
        capturedAt: ahora,
        source: 'serpapi-walmart',
        sourceUrl: resultado.url,
        raw: {
          us_item_id: resultado.us_item_id || entradaMapping?.us_item_id || null,
          nombre_walmart: resultado.nombre,
          matched_by: metodo,
          serpapi_query: entradaMapping?.us_item_id || construirQueryNombre(producto)
        }
      });
      log(`  ✔ [${producto.ean}] $${resultado.precio.toFixed(2)} MXN — "${resultado.nombre.slice(0, 50)}" (${metodo})`);
    } else {
      log(`  ✖ [${producto.ean}] "${producto.name}" — sin precio disponible.`);
      sugerencias.push({
        clave: `${producto.name} (${producto.ean})`,
        veces: 1,
        motivo: 'Sin us_item_id o ningún resultado coincidente en SerpApi Walmart'
      });
    }
  }

  log(`\n  Total: ${observaciones.length}/${productos.length} precios obtenidos (${peticiones} peticiones SerpApi).`);

  return {
    observaciones,
    sugerencias,
    meta: {
      source: 'serpapi-walmart',
      totalObjetivo: productos.length,
      totalObservaciones: observaciones.length,
      peticionesSerpApi: peticiones
    }
  };
}

export const adaptador = {
  id: 'walmart',
  nombre: 'Walmart México (SerpApi)',
  automatizable: true,
  cadenas: [STORE_ID],
  obtenerPrecios
};
