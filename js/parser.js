/**
 * Parser inteligente de texto libre para listas de compras.
 * Soporta formatos como:
 * - "2kg manzana"
 * - "1.5 kg pechuga de pollo"
 * - "2 piezas de leche lala"
 * - "1 cartera de huevo san juan"
 * - "3 latas de atun"
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
 * Parsea una sola línea de texto a un ítem estructurado
 */
export function parseLine(line) {
  const originalText = line.trim();
  if (!originalText) return null;

  let text = normalizeString(originalText);

  // Expresión regular para capturar cantidad y unidad inicial
  // Ejemplos: "2kg", "2.5 kg", "3 pz", "3pz", "3 latas de", "1 paquete de", "2 "
  const qtyRegex = /^([0-9]+(?:[\.,][0-9]+)?)\s*(kg|kilos|kilo|gr|gramos|g|pz|pza|pzas|piezas|pieza|pqte|paquete|paquetes|l|litro|litros|six|sixpack|latas|lata|cartera|carteras)?\s*(?:de\s+)?(.*)$/i;
  
  let quantity = 1;
  let unit = 'pz';
  let searchTerm = text;

  const match = text.match(qtyRegex);
  if (match) {
    const rawQty = match[1].replace(',', '.');
    quantity = parseFloat(rawQty) || 1;
    const rawUnit = (match[2] || '').toLowerCase();
    
    if (['kg', 'kilo', 'kilos'].includes(rawUnit)) {
      unit = 'kg';
    } else if (['g', 'gr', 'gramos'].includes(rawUnit)) {
      quantity = quantity / 1000;
      unit = 'kg';
    } else if (['pqte', 'paquete', 'paquetes', 'cartera', 'carteras'].includes(rawUnit)) {
      unit = 'pqte';
    } else if (['six', 'sixpack'].includes(rawUnit)) {
      unit = 'sixpack';
    } else {
      unit = 'pz';
    }

    searchTerm = (match[3] || '').trim();
    if (!searchTerm) {
      searchTerm = text;
    }
  }

  // Buscar coincidencia en el catálogo
  const matchedProduct = findBestMatch(searchTerm);

  if (matchedProduct) {
    return {
      id: matchedProduct.id,
      catalogId: matchedProduct.id,
      name: matchedProduct.name,
      category: matchedProduct.category,
      unit: matchedProduct.unit || unit,
      quantity: quantity,
      prices: matchedProduct.prices,
      rawInput: originalText,
      isCustom: false
    };
  }

  // Si no se encuentra en el catálogo, se crea un producto genérico
  const fallbackPrices = estimatePricesForUnknown(searchTerm);
  return {
    id: 'custom-' + Math.random().toString(36).substr(2, 9),
    catalogId: null,
    name: capitalize(originalText.replace(/^[0-9]+(?:[\.,][0-9]+)?\s*(?:kg|kilos|pz|piezas|pzas|paquete)?\s*(?:de\s+)?/i, '').trim() || originalText),
    category: 'despensa',
    unit: unit,
    quantity: quantity,
    prices: fallbackPrices,
    rawInput: originalText,
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
