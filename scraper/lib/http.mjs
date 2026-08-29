/**
 * Cliente HTTP con buenos modales.
 *
 * Un scraper que golpea un sitio sin pausa es un scraper que se gana un bloqueo
 * y que le cuesta dinero a alguien más. Este módulo impone:
 *   - un intervalo mínimo entre peticiones al mismo host,
 *   - reintentos con espera creciente sólo en errores transitorios,
 *   - timeout duro,
 *   - User-Agent identificable y de contacto.
 *
 * Deliberadamente NO incluye rotación de identidad, proxies, resolución de
 * captchas ni nada parecido: si un sitio dice que no, la respuesta es buscar
 * una fuente legítima, no disfrazarse.
 */

const DEFAULT_UA =
  'SuperPreciosQRO/1.0 (comparador de precios sin fines de lucro; +https://github.com/JETER3/superprecios-qro)';

const ultimaPeticionPorHost = new Map();

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Espera lo necesario para no rebasar el intervalo mínimo contra un host.
 */
async function respetarRitmo(host, intervaloMs) {
  const ultima = ultimaPeticionPorHost.get(host) || 0;
  const espera = intervaloMs - (Date.now() - ultima);
  if (espera > 0) await sleep(espera);
  ultimaPeticionPorHost.set(host, Date.now());
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} en ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/**
 * GET con ritmo, reintentos y timeout.
 *
 * @param {string} url
 * @param {object} options
 * @param {object} options.headers        cabeceras extra (aquí va el CP)
 * @param {number} options.timeoutMs      default 20000
 * @param {number} options.retries        default 2
 * @param {number} options.minIntervalMs  espera mínima entre peticiones al host
 */
export async function get(url, options = {}) {
  const {
    headers = {},
    timeoutMs = 20000,
    retries = 2,
    minIntervalMs = 1500,
    userAgent = DEFAULT_UA
  } = options;

  const host = new URL(url).host;
  let ultimoError = null;

  for (let intento = 0; intento <= retries; intento++) {
    await respetarRitmo(host, minIntervalMs);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'es-MX,es;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow'
      });

      // 4xx (salvo 429) es un "no" definitivo: reintentar sólo hace ruido.
      if (!res.ok && res.status !== 429 && res.status < 500) {
        throw new HttpError(res.status, url, (await res.text()).slice(0, 400));
      }
      if (!res.ok) {
        ultimoError = new HttpError(res.status, url, '');
        const espera = Number(res.headers.get('retry-after')) * 1000 || 2000 * (intento + 1);
        await sleep(espera);
        continue;
      }

      return res;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      ultimoError = err;
      await sleep(1000 * (intento + 1));
    } finally {
      clearTimeout(t);
    }
  }

  throw ultimoError || new Error(`No se pudo obtener ${url}`);
}

export async function getJson(url, options = {}) {
  const res = await get(url, { headers: { Accept: 'application/json' }, ...options });
  return res.json();
}

export async function getText(url, options = {}) {
  const res = await get(url, options);
  return res.text();
}

/**
 * Recorre un CSV remoto línea por línea sin cargarlo entero en memoria.
 * Los archivos de PROFECO pesan más de 150 MB; leerlos completos no es opción.
 *
 * @param {string} url
 * @param {(fila: object, indice: number) => void} onRow  recibe la fila ya mapeada por encabezado
 */
export async function streamCsv(url, onRow, options = {}) {
  const res = await get(url, options);
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let header = null;
  let indice = 0;

  const procesarLinea = (line) => {
    if (!line) return;
    if (!header) {
      header = parseCsvLine(line).map(h => h.trim());
      return;
    }
    const cols = parseCsvLine(line);
    const fila = {};
    for (let i = 0; i < header.length; i++) fila[header[i]] = cols[i];
    onRow(fila, indice++);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      procesarLinea(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  procesarLinea(buffer.replace(/\r$/, ''));

  return indice;
}

/**
 * Parser CSV mínimo que respeta comillas dobles y comas dentro de campos.
 */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let enComillas = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (enComillas) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { enComillas = false; }
      } else cur += ch;
    } else if (ch === '"') {
      enComillas = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
