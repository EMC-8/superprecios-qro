import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLine, parseShoppingListText } from '../js/parser.js';
import { PRODUCTS_CATALOG } from '../js/data.js';

function parse(text) {
  const it = parseLine(text);
  return { name: it.name, qty: it.quantity, unit: it.unit, custom: it.isCustom, note: it.measureNote };
}

test('cantidad simple sin unidad = número de presentaciones', () => {
  const r = parse('2 leche lala');
  assert.equal(r.qty, 2);
  assert.equal(r.custom, false);
  assert.match(r.name, /Leche Lala/);
});

test('la unidad no puede ser el prefijo de una palabra', () => {
  // "2 leche" no es "2 litros" de "eche"
  assert.equal(parse('2 leche lala').qty, 2);
  assert.equal(parse('1 latas de atun dolores').qty, 1);
});

test('convierte gramos a presentaciones redondeando hacia arriba', () => {
  const r = parse('500g queso panela');
  assert.equal(r.qty, 2); // bloque de 400 g
  assert.match(r.note, /500 g/);
});

test('convierte litros a presentaciones', () => {
  assert.equal(parse('1.5 l coca cola').qty, 1);   // botella de 2.5 L
  assert.equal(parse('5 l coca cola').qty, 2);
});

test('convierte kilos a presentaciones', () => {
  assert.equal(parse('1kg detergente ariel').qty, 1);
  assert.equal(parse('2 kg detergente ariel').qty, 2);
});

test('cuenta piezas contra el contenido del paquete', () => {
  assert.equal(parse('30 huevos').qty, 1);              // 1 cartera de 30
  assert.equal(parse('60 huevos').qty, 2);
  assert.equal(parse('12 rollos papel de bano').qty, 1); // 1 paquete de 12
});

test('una unidad de paquete explícita son paquetes', () => {
  assert.equal(parse('1 cartera de huevo san juan').qty, 1);
  assert.equal(parse('2 paquetes de papel de bano').qty, 2);
});

test('las unidades de conteo sobre productos por peso son presentaciones', () => {
  assert.equal(parse('3 latas de atun dolores').qty, 3);
});

test('sin cantidad asume 1', () => {
  assert.equal(parse('papel de bano').qty, 1);
});

test('acepta acentos y mayúsculas', () => {
  assert.equal(parse('1 Aceite Nutrioli').custom, false);
  assert.equal(parse('2 CAFÉ NESCAFÉ').qty, 2);
});

test('lo que no está en el catálogo queda marcado como estimado', () => {
  const it = parseLine('2kg pechuga de pollo');
  assert.equal(it.isCustom, true);
  assert.equal(it.isEstimatedPrice, true);
  assert.equal(it.ean, null);
  assert.equal(it.quantity, 2);
  assert.equal(it.unit, 'kg');
  assert.ok(it.estimatedPrices.aurrera > 0);
});

test('los ítems del catálogo referencian EAN y no traen precios pegados', () => {
  const it = parseLine('1 huevo san juan');
  assert.ok(it.ean);
  assert.equal(it.prices, undefined);
  assert.equal(it.isEstimatedPrice, undefined);
});

test('parsea listas de varias líneas y suma repetidos', () => {
  const items = parseShoppingListText('2 leche lala\n1 pan bimbo\n1 leche lala');
  assert.equal(items.length, 2);
  const leche = items.find(i => /Leche/.test(i.name));
  assert.equal(leche.quantity, 3);
});

test('parsea listas separadas por comas', () => {
  const items = parseShoppingListText('1 pan bimbo, 1 aceite nutrioli, 1 cloro cloralex');
  assert.equal(items.length, 3);
});

test('ignora líneas vacías', () => {
  assert.equal(parseShoppingListText('1 pan bimbo\n\n\n  \n1 leche lala').length, 2);
});

test('todo el catálogo declara su presentación de venta', () => {
  for (const p of PRODUCTS_CATALOG) {
    assert.ok(p.pack, `${p.id} sin pack`);
    assert.ok(p.pack.amount > 0, `${p.id} con pack.amount inválido`);
    assert.ok(['g', 'ml', 'pz'].includes(p.pack.unit), `${p.id} con pack.unit inválido`);
    assert.ok(p.ean, `${p.id} sin EAN`);
  }
});

test('cada canasta de ejemplo se resuelve contra el catálogo', async () => {
  const { SAMPLE_LISTS } = await import('../js/data.js');
  for (const sample of SAMPLE_LISTS) {
    const items = parseShoppingListText(sample.text);
    assert.ok(items.length > 0, `${sample.id} no produjo ítems`);
    for (const it of items) {
      assert.equal(it.isCustom, false, `${sample.id}: "${it.rawInput}" no matcheó el catálogo`);
    }
  }
});
