/**
 * Adaptador Walmart México — SerpApi.
 *
 * Obtiene precios reales de Walmart México EXCLUSIVAMENTE para los 19 productos
 * definidos en js/data.js, usando SerpApi como intermediario legítimo.
 *
 * Flujo por producto:
 *   1. Consulta directa por us_item_id (del mapping scraper/mappings/walmart-items.json).
 *   2. Si no hay ID o el ID está inválido → fallback de rediscovery por nombre.
 *   3. El adaptador NUNCA modifica walmart-items.json: solo loggea el ID nuevo
 *      para que una persona lo confirme y haga commit.
 *
 * Reglas estrictas:
 *   - No scraping directo de walmart.com.mx.
 *   - No evasión de Akamai/WAF. SerpApi gestiona eso en sus servidores.
 *   - No generar us_item_id a partir del EAN.
 *   - No descubrir productos adicionales fuera del catálogo.
 *   - Un precio ausente es mejor que uno incorrecto.
 *   - El precio refleja walmart.com.mx (online/pickup), no una sucursal física específica.
 *
 * Variables de entorno requeridas:
 *   SERPAPI_KEY — API key de SerpApi. Sin ella el adaptador falla con mensaje claro.
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

// Ritmo de peticiones: ser cortés evita errores de rate-limit en cuentas gratuitas.
const PAUSA_MS = 1200;

// ---------------------------------------------------------------------------
// Carga del mapping
// ---------------------------------------------------------------------------

export async function cargarMapping() {
  try {
    const raw = await readFile(MAPPING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { items: [], _sin_mapear: [] };
  }
}

/** Índice EAN → entrada del mapping (incluyendo us_item_id). */
export function indexarMapping(mapping) {
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
export async function consultarSerpApi(query, apiKey) {
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
 * Resultado normalizado extraído de un elemento de organic_results de SerpApi.
 * @typedef {Object} ResultadoSerpApi
 * @property {number}      precio
 * @property {string}      nombre
 * @property {string|null} us_item_id
 * @property {string|null} product_id
 * @property {string|null} offer_id
 * @property {string|null} seller
 * @property {string}      url
 */

/**
 * Normaliza un elemento de organic_results en un ResultadoSerpApi.
 * Extrae todos los identificadores que SerpApi expone para Walmart.
 *
 * Campos documentados en SerpApi Walmart:
 *   us_item_id   — ID de item en Walmart EE.UU./México (formato numérico largo)
 *   product_id   — ID interno de producto (puede coincidir o diferir de us_item_id)
 *   offer_id     — ID de oferta del vendedor (útil para auditoría)
 *   seller_name  — nombre del vendedor ("Walmart", "Marketplace seller", etc.)
 *   primary_price, price, extracted_price — precio según tipo de página
 */
export function normalizarResultado(r) {
  if (!r || typeof r !== 'object') return null;

  const precio = Number(
    r.primary_offer?.offer_price ??
    r.primary_price ??
    r.price ??
    r.extracted_price
  );
  if (!Number.isFinite(precio) || precio <= 0) return null;

  const us_item_id = r.us_item_id ? String(r.us_item_id) : null;
  const offer_id = r.primary_offer?.offer_id
    ? String(r.primary_offer.offer_id)
    : (r.offer_id ? String(r.offer_id) : null);

  return {
    precio: Math.round(precio * 100) / 100,
    nombre: r.title || r.name || '',
    us_item_id,
    product_id: r.product_id ? String(r.product_id) : us_item_id,
    offer_id,
    seller: r.seller_name || r.seller || null,
    url: r.product_page_url || r.link ||
         (us_item_id ? `https://www.walmart.com.mx/ip/${us_item_id}` : null)
  };
}

/**
 * Extrae el primer resultado orgánico con precio válido de la respuesta de SerpApi.
 * @param {object} response - Respuesta JSON de SerpApi.
 * @returns {ResultadoSerpApi|null}
 */
export function extraerPrimerResultado(response) {
  const resultados = response?.organic_results;
  if (!Array.isArray(resultados) || resultados.length === 0) return null;

  for (const r of resultados) {
    const normalizado = normalizarResultado(r);
    if (normalizado) return normalizado;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validación de coincidencia (cordura mínima para fallback)
// ---------------------------------------------------------------------------

/**
 * Comprueba que el nombre devuelto por Walmart corresponda mínimamente al
 * producto esperado. Sirve para:
 *   a) Detectar cuando un us_item_id ha rotado (ahora apunta a otro producto).
 *   b) Filtrar resultados incorrectos en búsquedas por nombre.
 *
 * Criterio: al menos la mitad de las palabras significativas (>3 chars) del
 * nombre del catálogo deben aparecer en el nombre de Walmart.
 *
 * No es una validación de presentación exacta — eso requeriría revisión humana.
 * Su función es EXCLUIR productos claramente distintos (distinta marca, tipo o
 * categoría), no CONFIRMAR que la presentación sea idéntica.
 */
function obtenerMarca(prod) {
  const marcas = [
    'lala', 'san juan', 'fud', 'nutrioli', 'verde valle', 'dolores',
    'mccormick', 'nescafe', 'barilla', 'bimbo', 'petalo', 'ariel',
    'cloralex', 'axion', 'coca-cola', 'coca cola', 'corona', 'bonafont'
  ];
  const ne = normalizar(prod.name);
  return marcas.find(m => ne.includes(m)) || null;
}

/**
 * Comprueba que el nombre devuelto por Walmart corresponda estrictamente al
 * producto esperado. Sirve para:
 *   a) Detectar cuando un us_item_id ha rotado (apunta a otro producto/variante).
 *   b) Filtrar resultados incorrectos en búsquedas por nombre (fallback).
 *
 * Matching estricto:
 *   - La marca es obligatoria.
 *   - Variantes no solicitadas (deslactosada, light, descafeinado, etc.) son excluidas.
 *   - Multipacks son excluidos si el catálogo pide pieza individual.
 *   - Cantidades o pesos contradictorios son excluidos.
 */
export function esResultadoPlausible(nombreWalmart, productoEsperado) {
  if (!nombreWalmart || !productoEsperado) return false;
  const nw = normalizar(nombreWalmart);
  const ne = normalizar(productoEsperado.name);

  // 1. Marca obligatoria si el producto esperado la tiene
  const marca = obtenerMarca(productoEsperado);
  if (marca) {
    if (marca.includes('coca') && !nw.includes('coca')) return false;
    if (!marca.includes('coca') && !nw.includes(marca)) return false;
  }

  // 2. Variantes excluyentes (no aceptar si el producto esperado no las pide)
  const variantes = [
    'light', 'deslactosad', 'descremad', 'semidescremad',
    'descafeinad', 'sin azucar', 'zero', 'cero', 'premium', 'integral'
  ];
  for (const v of variantes) {
    if (!ne.includes(v) && nw.includes(v)) return false;
  }

  // Sabor / variedad específica cuando el catálogo lo especifica
  if (ne.includes('limon') && !nw.includes('limon')) return false;
  if (ne.includes('super extra') && !nw.includes('super extra')) return false;

  // 3. Coincidencia de palabras clave alfabéticas principales
  const palabrasClave = ne
    .split(' ')
    .map(p => p.replace(/[^a-z]/g, ''))
    .filter(p => p.length > 3);

  if (palabrasClave.length === 0) return false;

  const coincidencias = palabrasClave.filter(p => {
    if (p === 'litros' || p === 'litro') {
      return /\b(l|litro|litros)\b/.test(nw);
    }
    if (p === 'gramos' || p === 'gramo') {
      return /\b(g|gr|gramo|gramos)\b/.test(nw);
    }
    if (p === 'kilos' || p === 'kilo') {
      return /\b(kg|kilo|kilos|kilogramos)\b/.test(nw);
    }
    if (p === 'piezas' || p === 'pieza') {
      return /\b(pz|pza|pzas|pieza|piezas)\b/.test(nw);
    }
    return nw.includes(p);
  });

  if (coincidencias.length < Math.ceil(palabrasClave.length / 2)) {
    return false;
  }

  // 4. Empaque individual vs multipack
  if (productoEsperado.unit === 'pz' && productoEsperado.pack?.amount && !ne.includes('pack')) {
    if (/\b\d+\s*pack\b/.test(nw) || nw.includes('6 pack') || nw.includes('4 pack') || nw.includes('12 pack')) return false;
    if (/\b\d+\s*pzas?\b/.test(nw) && !ne.includes('pzas') && !ne.includes('piezas')) return false;
    if (nw.includes('c/u')) return false;
  }

  // 5. Cantidad numérica (peso / volumen / piezas)
  if (ne.includes('1kg') || ne.includes('1 kg')) {
    if (nw.includes('2 kg') || nw.includes('2kg') || nw.includes('3 kg') || nw.includes('4 kg') || nw.includes('4kg') || nw.includes('500 g')) return false;
  }
  const numsE = (ne.match(/\d+(\.\d+)?/g) || []).map(Number);
  const numsW = (nw.match(/\d+(\.\d+)?/g) || []).map(Number);
  for (const nE of numsE) {
    if (nE >= 2 && !numsW.includes(nE)) {
      return false;
    }
  }

  return true;
}

/**
 * Construye la query de búsqueda por nombre para el fallback.
 * Usa el nombre completo del catálogo (marca + tipo + presentación).
 */
export function construirQueryNombre(producto) {
  return producto.name;
}

// ---------------------------------------------------------------------------
// Lógica principal de consulta por producto
// ---------------------------------------------------------------------------

/**
 * Consulta un producto directamente por su us_item_id.
 * Retorna null si el ID no devuelve resultados o si el resultado no pasa
 * la verificación de plausibilidad (señal de ID rotado).
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

  return { resultado, metodo: 'direct_id', query: us_item_id };
}

/**
 * Búsqueda por nombre como fallback o rediscovery.
 * Recorre organic_results hasta encontrar el primero que pase esResultadoPlausible.
 * Aplica matching estricto: no acepta el primer resultado si no coincide.
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
    const candidato = normalizarResultado(r);
    if (!candidato) continue;

    if (esResultadoPlausible(candidato.nombre, producto)) {
      return {
        resultado: candidato,
        metodo: 'name_search',
        idDescubierto: candidato.us_item_id,
        query
      };
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
    throw new Error(
      'SERPAPI_KEY no está configurada. ' +
      'Agrega la variable de entorno o el secreto de CI (Settings → Secrets → Actions).'
    );
  }

  const mapping = await cargarMapping();
  const idx = indexarMapping(mapping);
  const sinMapear = new Set((mapping._sin_mapear || []).map(e => e.ean));

  log(`  Mapping cargado: ${idx.size} IDs conocidos, ${sinMapear.size} documentados sin mapear.`);

  const productos = PRODUCTS_CATALOG;
  const observaciones = [];
  const sugerencias = [];

  // Un único timestamp para todas las observaciones de esta corrida.
  const ahora = new Date().toISOString();
  let peticiones = 0;
  let fallbacks = 0;
  const idsDescubiertos = [];

  for (const producto of productos) {
    const entradaMapping = idx.get(producto.ean);
    let encontrado = null;

    log(`\n  [${producto.ean}] "${producto.name}"`);

    // ── RUTA 1: Consulta directa por us_item_id ──────────────────────────
    if (entradaMapping?.us_item_id) {
      try {
        if (peticiones > 0) await esperar(PAUSA_MS);
        peticiones++;
        encontrado = await consultarPorId(
          entradaMapping.us_item_id, producto, apiKey, log
        );
      } catch (err) {
        log(`    ✖ Error en consulta directa: ${err.message}`);
      }

      // Si el ID resultó inválido/rotado → rediscovery por nombre
      if (!encontrado) {
        fallbacks++;
        log(`    → Rediscovery por nombre (ID posiblemente rotado)`);
        try {
          await esperar(PAUSA_MS);
          peticiones++;
          const fb = await consultarPorNombre(producto, apiKey, log);
          if (fb) {
            encontrado = fb;
            if (fb.idDescubierto && fb.idDescubierto !== entradaMapping.us_item_id) {
              idsDescubiertos.push({
                ean: producto.ean,
                nombre: producto.name,
                id_viejo: entradaMapping.us_item_id,
                id_nuevo: fb.idDescubierto
              });
              log(`    ⚠️  ID ROTADO — EAN ${producto.ean}`);
              log(`       ID viejo: ${entradaMapping.us_item_id}`);
              log(`       ID nuevo: ${fb.idDescubierto}`);
              log(`       → Actualizar scraper/mappings/walmart-items.json (revisión humana requerida)`);
            }
          }
        } catch (err) {
          log(`    ✖ Error en fallback de rediscovery: ${err.message}`);
        }
      }

    // ── RUTA 2: Sin ID en mapping → búsqueda directa por nombre ─────────
    } else {
      fallbacks++;
      if (sinMapear.has(producto.ean)) {
        log(`    ⚠️  Documentado en _sin_mapear. Intentando rediscovery por nombre.`);
      } else {
        log(`    ○ Sin ID conocido. Intentando búsqueda por nombre.`);
      }

      try {
        if (peticiones > 0) await esperar(PAUSA_MS);
        peticiones++;
        const fb = await consultarPorNombre(producto, apiKey, log);
        if (fb) {
          encontrado = fb;
          if (fb.idDescubierto) {
            idsDescubiertos.push({
              ean: producto.ean,
              nombre: producto.name,
              id_viejo: null,
              id_nuevo: fb.idDescubierto
            });
            log(`    ℹ️  NUEVO ID ENCONTRADO: us_item_id = ${fb.idDescubierto}`);
            log(`       → Agregar en scraper/mappings/walmart-items.json (revisión humana requerida)`);
          }
        }
      } catch (err) {
        log(`    ✖ Error en búsqueda por nombre: ${err.message}`);
      }
    }

    // ── Emitir observación o registrar como sin precio ────────────────────
    if (encontrado?.resultado) {
      const { resultado, metodo, query: queryEjecutada } = encontrado;
      observaciones.push({
        ean: producto.ean,
        storeId: STORE_ID,
        price: resultado.precio,
        capturedAt: ahora,
        source: 'serpapi-walmart',
        sourceUrl: resultado.url,
        // branch_id omitido intencionalmente: el precio es de walmart.com.mx
        // (online/pickup), no de una sucursal física específica de Querétaro.
        raw: {
          us_item_id:    resultado.us_item_id   ?? entradaMapping?.us_item_id ?? null,
          product_id:    resultado.product_id   ?? null,
          offer_id:      resultado.offer_id     ?? null,
          seller:        resultado.seller       ?? null,
          matched_by:    metodo,
          serpapi_query: queryEjecutada ?? (entradaMapping?.us_item_id ?? construirQueryNombre(producto))
        }
      });
      log(`    ✔ $${resultado.precio.toFixed(2)} MXN — "${resultado.nombre.slice(0, 50)}" (${metodo})`);
    } else {
      log(`    ✖ Sin precio disponible.`);
      sugerencias.push({
        clave: `${producto.name} (${producto.ean})`,
        veces: 1,
        motivo: 'Sin us_item_id o ningún resultado coincidente en SerpApi Walmart'
      });
    }
  }

  const sinPrecio = productos.length - observaciones.length;
  log(`\n  ─── Resumen ───`);
  log(`  Total objetivo  : ${productos.length}`);
  log(`  Con precio      : ${observaciones.length}`);
  log(`  Sin precio      : ${sinPrecio}`);
  log(`  Fallbacks usados: ${fallbacks}`);
  log(`  Peticiones API  : ${peticiones}`);
  if (idsDescubiertos.length) {
    log(`  IDs descubiertos: ${idsDescubiertos.length} (revisar walmart-items.json)`);
    for (const d of idsDescubiertos) {
      log(`    EAN ${d.ean} → ${d.id_nuevo}${d.id_viejo ? ` (reemplaza ${d.id_viejo})` : ''}`);
    }
  }

  return {
    observaciones,
    sugerencias,
    meta: {
      source:            'serpapi-walmart',
      capturedAt:        ahora,
      totalObjetivo:     productos.length,
      totalConPrecio:    observaciones.length,
      totalSinPrecio:    sinPrecio,
      fallbacksUsados:   fallbacks,
      peticionesSerpApi: peticiones,
      idsDescubiertos
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
