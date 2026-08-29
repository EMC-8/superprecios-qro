/**
 * Normalización de texto compartida por los adaptadores.
 * Sin acentos, sin mayúsculas, sin espacios de más: lo mínimo para que
 * "Atún" y "atun" sean la misma palabra.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Valida una observación antes de dejarla entrar al sistema.
 * @returns {string[]} lista de problemas; vacía si está bien.
 */
export function validarObservacion(obs, { eansValidos, tiendasValidas }) {
  const problemas = [];

  if (!obs || typeof obs !== 'object') return ['no es un objeto'];
  if (!eansValidos.has(obs.ean)) problemas.push(`EAN ${obs.ean} no está en el catálogo`);
  if (!tiendasValidas.has(obs.storeId)) problemas.push(`tienda "${obs.storeId}" desconocida`);

  const p = Number(obs.price);
  if (!Number.isFinite(p) || p <= 0) problemas.push(`precio inválido: ${obs.price}`);
  if (p > 100000) problemas.push(`precio absurdamente alto: ${obs.price}`);

  if (obs.capturedAt && Number.isNaN(new Date(obs.capturedAt).getTime())) {
    problemas.push(`capturedAt inválido: ${obs.capturedAt}`);
  }
  if (!obs.source) problemas.push('falta source');

  return problemas;
}

/**
 * Colapsa varias observaciones del mismo producto+tienda en una sola.
 *
 * PROFECO trae varias sucursales por cadena y precios distintos entre ellas.
 * Se toma la MEDIANA, no el promedio ni el mínimo: el promedio se va con
 * cualquier dato raro y el mínimo vende una promesa que el usuario no va a
 * encontrar en la sucursal a la que llegue.
 */
export function consolidar(observaciones) {
  const grupos = new Map();

  for (const obs of observaciones) {
    const clave = `${obs.ean}|${obs.storeId}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(obs);
  }

  const salida = [];
  for (const [, lista] of grupos) {
    const precios = lista.map(o => Number(o.price)).sort((a, b) => a - b);
    const medio = Math.floor(precios.length / 2);
    const mediana = precios.length % 2
      ? precios[medio]
      : (precios[medio - 1] + precios[medio]) / 2;

    // Se conserva la observación más reciente como representante.
    const rep = lista.reduce((a, b) =>
      new Date(b.capturedAt || 0) > new Date(a.capturedAt || 0) ? b : a, lista[0]);

    salida.push({
      ...rep,
      price: Math.round(mediana * 100) / 100,
      observaciones: lista.length,
      precioMin: precios[0],
      precioMax: precios[precios.length - 1]
    });
  }

  return salida;
}
