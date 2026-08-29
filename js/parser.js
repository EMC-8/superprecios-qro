/**
 * Parser inteligente de texto libre para listas de compras.
 * Soporta formatos como:
 * - "2kg manzana"
 * - "1.5 kg pechuga de pollo"
 * - "2 piezas de leche lala"
 * - "1 cartera de huevo san juan"
 * - "3 latas de atun"
 * - "500g queso panela" -> 2 bloques de 400g
 * - "papel de bano" (asume 1)
 */

import { PRODUCTS_CATALOG } from './data.js';

function normalizeString(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Unidades reconocidas -> dimensión y factor hacia la unidad base.
 * Unidades base: 'g' (masa), 'ml' (volumen), 'pz' (conteo).
 * La dimensión 'pack' significa "el número son paquetes de venta" (cartera, six, paquete).
 */
const UNIT_ALIASES = {
  kg: ['mass', 1000], kilo: ['mass', 1000], kilos: ['mass', 1000],
  g: ['mass', 1], gr: ['mass', 1], gramos: ['mass', 1],
  l: ['volume', 1000], lt: ['volume', 1000], litro: ['volume', 1000], litros: ['volume', 1000],
  ml: ['volume', 1], mililitros: ['volume', 1],
  pz: ['count', 1], pza: ['count', 1], pzas: ['count', 1], pieza: ['count', 1], piezas: ['count', 1],
  lata: ['count', 1], latas: ['count', 1], rollo: ['count', 1], rollos: ['count', 1],
  botella: ['count', 1], botellas: ['count', 1], huevo: ['count', 1], huevos: ['count', 1],
  pqte: ['pack', 1], paquete: ['pack', 1], paquetes: ['pack', 1],
  cartera: ['pack', 1], carteras: ['pack', 1], six: ['pack', 1], sixpack: ['pack', 1]
};

const UNIT_TOKENS = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length).join('|');
// La unidad solo cuenta si no va pegada a más letras: en "2 leche" la 'l' no es litros.
const QTY_REGEX = new RegExp(
  '^([0-9]+(?:[.,][0-9]+)?)[ ]*(?:(' + UNIT_TOKENS + ')(?![a-zA-Z]))?[ ]*(?:de[ ]+)?(.*)$',
  'i'
);

const DIMENSION_OF_BASE_UNIT = { g: 'mass', ml: 'volume', pz: 'count' };

/**
 * Convierte lo que pidió el usuario al número de presentaciones que hay que comprar.
 * Los precios del catálogo son POR PRESENTACIÓN (un bloque de 400g, una cartera de 30),
 * así que la cantidad final siempre tiene que ser un número de presentaciones.
 */
function resolvePackQuantity(product, amount, dim) {
  const pack = product.pack;

  // Sin unidad explícita ("2 leche lala") o unidad de paquete ("1 cartera de huevo"):
  // el número ya son presentaciones.
  if (!dim || dim === 'pack' || !pack) {
    return { quantity: amount, measureNote: null };
  }

  const packDim = DIMENSION_OF_BASE_UNIT[pack.unit] || 'count';

  if (dim === packDim) {
    // Misma dimensión: "500 g" de un bloque de 400 g -> 2 bloques.
    // Se redondea hacia arriba porque no se puede comprar una fracción de presentación.
    const packs = Math.max(1, Math.ceil(amount / pack.amount));
    if (packs === amount && pack.amount === 1) {
      return { quantity: packs, measureNote: null };
    }
    return {
      quantity: packs,
      measureNote: `pediste ${formatAmount(amount)} ${pack.unit} · cada presentación trae ${formatAmount(pack.amount)} ${pack.unit}`
    };
  }

  if (dim === 'count') {
    // "3 latas de atún": el catálogo lo mide en gramos, así que el número son presentaciones.
    return { quantity: amount, measureNote: null };
  }

  // Pidió peso/volumen de algo que no se mide así (ej. "500 g de huevo").
  // No hay forma de inferir cuántas presentaciones son: se asume 1 y se avisa.
  return {
    quantity: 1,
    measureNote: `no se pudo convertir ${formatAmount(amount)} ${dim === 'mass' ? 'g' : 'ml'} a presentaciones; se asumió 1`
  };
}

function formatAmount(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Parsea una sola línea de texto a un ítem estructurado
 */
export function parseLine(line) {
  const originalText = line.trim();
  if (!originalText) return null;

  let text = normalizeString(originalText);

  // amount queda siempre en unidad base (g / ml / pz); dim indica cómo interpretarlo.
  let amount = 1;
  let dim = null;
  let searchTerm = text;

  const match = text.match(QTY_REGEX);
  if (match) {
    amount = parseFloat(match[1].replace(',', '.')) || 1;
    const rawUnit = (match[2] || '').toLowerCase();

    if (rawUnit && UNIT_ALIASES[rawUnit]) {
      const [unitDim, factor] = UNIT_ALIASES[rawUnit];
      dim = unitDim;
      amount = amount * factor;
    }

    searchTerm = (match[3] || '').trim();
    if (!searchTerm) {
      searchTerm = text;
    }
  }

  // Buscar coincidencia en el catálogo
  const matchedProduct = findBestMatch(searchTerm);

  if (matchedProduct) {
    const { quantity, measureNote } = resolvePackQuantity(matchedProduct, amount, dim);
    return {
      id: matchedProduct.id,
      catalogId: matchedProduct.id,
      name: matchedProduct.name,
      category: matchedProduct.category,
      unit: matchedProduct.unit,
      quantity: quantity,
      prices: matchedProduct.prices,
      rawInput: originalText,
      measureNote: measureNote,
      isCustom: false
    };
  }

  // Si no se encuentra en el catálogo, se crea un producto genérico.
  // Aquí no hay presentación conocida, así que se conserva la medida tal cual la escribió el usuario.
  let customUnit = 'pz';
  let customQty = amount;
  if (dim === 'mass') {
    customUnit = 'kg';
    customQty = amount / 1000;
  } else if (dim === 'volume') {
    customUnit = 'l';
    customQty = amount / 1000;
  }

  const fallbackPrices = estimatePricesForUnknown(searchTerm);
  return {
    id: 'custom-' + Math.random().toString(36).substr(2, 9),
    catalogId: null,
    name: capitalize(originalText.replace(QTY_REGEX, '$3').trim() || originalText),
    category: 'despensa',
    unit: customUnit,
    quantity: customQty,
    prices: fallbackPrices,
    rawInput: originalText,
    measureNote: null,
    isEstimatedPrice: true,
    isCustom: true
  };
}

/**
 * Encuentra el mejor producto en el catálogo por alias o nombre
 */
export function findBestMatch(query) {
  if (!query) return null;
  const cleanQuery = normalizeString(query);

  // 1. Coincidencia exacta con alias
  for (const prod of PRODUCTS_CATALOG) {
    if (prod.aliases.some(alias => normalizeString(alias) === cleanQuery)) {
      return prod;
    }
  }

  // 2. Coincidencia de inclusión con alias
  for (const prod of PRODUCTS_CATALOG) {
    if (prod.aliases.some(alias => cleanQuery.includes(normalizeString(alias)) || normalizeString(alias).includes(cleanQuery))) {
      return prod;
    }
  }

  // 3. Coincidencia en nombre oficial
  for (const prod of PRODUCTS_CATALOG) {
    const prodName = normalizeString(prod.name);
    if (prodName.includes(cleanQuery) || cleanQuery.includes(prodName)) {
      return prod;
    }
  }

  // 4. Búsqueda por palabras clave compartidas
  const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length > 2);
  let bestProd = null;
  let maxScore = 0;

  for (const prod of PRODUCTS_CATALOG) {
    let score = 0;
    const allSearchable = [prod.name, ...prod.aliases].map(normalizeString).join(' ');
    for (const token of queryTokens) {
      if (allSearchable.includes(token)) score++;
    }
    if (score > maxScore) {
      maxScore = score;
      bestProd = prod;
    }
  }

  return maxScore > 0 ? bestProd : null;
}

/**
 * Parsea un bloque completo de texto (múltiples líneas o comas)
 */
export function parseShoppingListText(rawText) {
  if (!rawText) return [];

  // Separar por salto de línea o por coma/punto y coma si es texto continuo
  let lines = rawText.split(/\r?\n/);
  if (lines.length === 1 && rawText.includes(',')) {
    lines = rawText.split(',');
  }

  const items = [];
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      // Si ya existe el producto en la lista, sumar la cantidad
      const existing = items.find(it => it.catalogId && it.catalogId === parsed.catalogId);
      if (existing) {
        existing.quantity += parsed.quantity;
      } else {
        items.push(parsed);
      }
    }
  }

  return items;
}

function estimatePricesForUnknown(term) {
  // Precios referenciales genéricos para artículos no catalogados
  const base = 35.0;
  return {
    aurrera: Math.round(base * 0.94 * 10) / 10,
    chedraui: Math.round(base * 0.96 * 10) / 10,
    walmart: Math.round(base * 1.05 * 10) / 10,
    soriana: Math.round(base * 1.02 * 10) / 10,
    lacomer: Math.round(base * 1.15 * 10) / 10,
    heb: Math.round(base * 1.08 * 10) / 10
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
