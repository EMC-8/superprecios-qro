/**
 * Adaptador PROFECO — "Quién es Quién en los Precios".
 *
 * Es la única fuente automatizable que quedó verificada: datos oficiales,
 * abiertos y explícitamente publicados para reuso, con precios reales de
 * sucursales de Santiago de Querétaro.
 *
 * Lo que hay que saber antes de confiar en esto:
 *
 *  - Cubre 5 de nuestras 6 cadenas (Bodega Aurrera, Chedraui, Soriana,
 *    Wal-mart y La Comer). **HEB no aparece.**
 *  - Se publica ~2 veces al mes, no a diario.
 *  - NO trae código de barras. El empate con nuestro catálogo se hace por
 *    marca + presentación mediante un mapeo EXPLÍCITO en
 *    scraper/mappings/profeco-queretaro.json.
 *
 * Ese mapeo explícito es a propósito: adivinar el empate produciría precios
 * confiadamente equivocados, que es el peor resultado posible para una app
 * cuyo único trabajo es decirte dónde está más barato. Lo que no está mapeado
 * se reporta como sugerencia y lo aprueba una persona.
 *
 * Fuente: https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2025
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { streamCsv, get } from '../lib/http.mjs';
import { normalizar } from '../lib/normalize.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MAPEO_PATH = path.join(AQUI, '..', 'mappings', 'profeco-queretaro.json');

const BASE_URL = 'https://repodatos.atdt.gob.mx/api_update/profeco';

// Cuántas quincenas hacia atrás buscar. PROFECO publica con retraso de meses,
// así que la ventana tiene que ser amplia y cruzar años.
const QUINCENAS_A_PROBAR = 24;

/** Nombre de cadena en PROFECO -> id de tienda nuestro. */
const CADENAS = {
  'bodega aurrera': 'aurrera',
  'chedraui': 'chedraui',
  'wal-mart': 'walmart',
  'walmart': 'walmart',
  'hipermercado soriana': 'soriana',
  'soriana': 'soriana',
  'mega soriana': 'soriana',
  'la comer': 'lacomer',
  'fresko': 'lacomer'
  // HEB no publica en este programa.
};

const ESTADO_OBJETIVO = 'queretaro';

/**
 * URL de una quincena concreta.
 *
 * El año va DOS veces: en el nombre del dataset y en el del archivo.
 *   .../programa_quien_es_quien_precios_2025/11-2025_01.csv
 *
 * Olvidarlo hace que a partir de enero la app busque en un dataset que no
 * existe y concluya que no hay datos.
 */
export function urlDeQuincena(anio, mes, quincena) {
  const mm = String(mes).padStart(2, '0');
  return `${BASE_URL}/programa_quien_es_quien_precios_${anio}/${mm}-${anio}_${quincena}.csv`;
}

/**
 * Quincenas a intentar, de la más reciente hacia atrás, cruzando años.
 */
export function urlesCandidatas(desde = new Date(), cuantas = QUINCENAS_A_PROBAR) {
  const urls = [];
  let anio = desde.getUTCFullYear();
  let mes = desde.getUTCMonth() + 1;
  let quincena = desde.getUTCDate() <= 15 ? 1 : 2;

  for (let i = 0; i < cuantas; i++) {
    urls.push(urlDeQuincena(anio, mes, String(quincena).padStart(2, '0')));
    quincena--;
    if (quincena === 0) {
      quincena = 2;
      mes--;
      if (mes === 0) { mes = 12; anio--; }
    }
  }
  return urls;
}

/**
 * Encuentra la quincena publicada más reciente.
 *
 * Se pregunta por 1 byte con Range y sin reintentos: un archivo inexistente
 * responde al instante y no tiene sentido insistirle. Descargar 150 MB es caro;
 * averiguar si existe, no.
 */
export async function buscarArchivoMasReciente({ log = () => {} } = {}) {
  for (const url of urlesCandidatas()) {
    try {
      const res = await get(url, {
        headers: { Range: 'bytes=0-0' },
        retries: 0,
        timeoutMs: 15000,
        minIntervalMs: 150
      });
      if (res.ok) {
        log(`  Quincena más reciente publicada: ${url.split('/').pop()}`);
        return url;
      }
    } catch (e) {
      // No existe esa quincena; se prueba la anterior.
    }
  }
  return null;
}

async function cargarMapeo() {
  try {
    return JSON.parse(await readFile(MAPEO_PATH, 'utf8'));
  } catch (e) {
    return { entradas: [] };
  }
}

/**
 * ¿Esta fila de PROFECO corresponde a algún producto mapeado?
 * Se exige que TODOS los términos requeridos aparezcan; ninguno de los excluidos.
 */
function empatar(fila, mapeo) {
  const blob = normalizar(
    `${fila.producto || ''} ${fila.marca || ''} ${fila.presentacion || ''}`
  );

  for (const entrada of mapeo.entradas) {
    const requiere = (entrada.requiere || []).map(normalizar);
    const excluye = (entrada.excluye || []).map(normalizar);

    if (requiere.length === 0) continue;
    if (!requiere.every(t => blob.includes(t))) continue;
    if (excluye.some(t => blob.includes(t))) continue;

    return entrada.ean;
  }
  return null;
}

/**
 * @returns {Promise<{observaciones: Array, sugerencias: Array, meta: object}>}
 */
export async function obtenerPrecios({ log = console.log } = {}) {
  const mapeo = await cargarMapeo();
  if (mapeo.entradas.length === 0) {
    log('  ⚠️  scraper/mappings/profeco-queretaro.json está vacío: no se podrá empatar nada.');
  }

  let urlUsada = null;
  let ultimoError = null;

  const observaciones = [];
  const sinEmpatar = new Map();
  let filasQro = 0;
  let filasTotales = 0;

  const encontrada = await buscarArchivoMasReciente({ log });
  if (!encontrada) {
    throw new Error('PROFECO no tiene ninguna quincena publicada en la ventana buscada.');
  }

  for (const url of [encontrada]) {
    observaciones.length = 0;
    sinEmpatar.clear();
    filasQro = 0;
    filasTotales = 0;

    try {
      log(`  Descargando (${'~150 MB'}) ${url}`);
      await streamCsv(url, (fila) => {
        filasTotales++;

        if (normalizar(fila.estado) !== ESTADO_OBJETIVO) return;
        const storeId = CADENAS[normalizar(fila.cadena_comercial)];
        if (!storeId) return;

        filasQro++;

        const precio = Number(String(fila.precio || '').replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(precio) || precio <= 0) return;

        const ean = empatar(fila, mapeo);
        if (!ean) {
          const clave = `${fila.producto} | ${fila.marca} | ${fila.presentacion}`;
          const previo = sinEmpatar.get(clave) || { clave, veces: 0, ejemploPrecio: precio };
          previo.veces++;
          sinEmpatar.set(clave, previo);
          return;
        }

        observaciones.push({
          ean,
          storeId,
          price: Math.round(precio * 100) / 100,
          capturedAt: fechaIso(fila.fecha_registro),
          source: 'profeco-qqp',
          sourceUrl: url,
          raw: {
            producto: fila.producto,
            marca: fila.marca,
            presentacion: fila.presentacion,
            sucursal: fila.nombre_comercial,
            municipio: fila.municipio
          }
        });
      }, { timeoutMs: 180000, minIntervalMs: 0 });

      urlUsada = url;
      break;
    } catch (err) {
      ultimoError = err;
      log(`  No disponible (${err.message}); intento con la quincena anterior.`);
    }
  }

  if (!urlUsada) {
    throw new Error(`Ningún archivo de PROFECO disponible. Último error: ${ultimoError?.message}`);
  }

  log(`  ${filasTotales} filas leídas, ${filasQro} de supermercados en Querétaro.`);
  log(`  ${observaciones.length} precios empatados con el catálogo.`);

  // La antigüedad importa: PROFECO publica con meses de retraso y un precio
  // viejo presentado como actual es peor que no tener precio.
  const fechas = observaciones.map(o => new Date(o.capturedAt).getTime()).filter(Number.isFinite);
  if (fechas.length) {
    const masReciente = new Date(Math.max(...fechas));
    const dias = Math.floor((Date.now() - masReciente.getTime()) / 86400000);
    log(`  Dato más reciente: ${masReciente.toISOString().slice(0, 10)} (hace ${dias} días).`);
    if (dias > 45) {
      log(`  ⚠️  Estos precios tienen más de mes y medio. Sirven de base, no como precio de caja.`);
    }
  }

  const sugerencias = [...sinEmpatar.values()]
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 80);

  return {
    observaciones,
    sugerencias,
    meta: { source: 'profeco-qqp', sourceUrl: urlUsada, filasQro }
  };
}

/** '2025/11/03' -> ISO */
function fechaIso(texto) {
  const m = String(texto || '').match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
  if (!m) return new Date().toISOString();
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toISOString();
}

export const adaptador = {
  id: 'profeco',
  nombre: 'PROFECO — Quién es Quién en los Precios',
  automatizable: true,
  cadenas: [...new Set(Object.values(CADENAS))],
  obtenerPrecios
};
