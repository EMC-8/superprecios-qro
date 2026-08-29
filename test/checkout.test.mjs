import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SUPERMARKETS, PRODUCTS_CATALOG } from '../js/data.js';

// checkout.js habla con el navegador (window, btoa, navigator). Se le da lo
// mínimo para poder probar la lógica de serialización fuera del DOM.
globalThis.window = { location: { href: 'https://superprecios.test/app', hash: '' } };
globalThis.history = { replaceState() {} };

const { buildShareUrl, readSharedCart, formatStoreList, formatQuantity } =
  await import('../js/checkout.js');

const leche = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478');

function itemDeCatalogo(quantity = 2) {
  return {
    id: leche.id, catalogId: leche.id, ean: leche.ean, name: leche.name,
    category: leche.category, unit: leche.unit, quantity, isCustom: false
  };
}

/** Simula abrir el enlace: pone el hash y lee. */
function abrirEnlace(url) {
  window.location.hash = url.slice(url.indexOf('#'));
  return readSharedCart();
}

test('una canasta compartida sobrevive el viaje de ida y vuelta', () => {
  const url = buildShareUrl([itemDeCatalogo(3)]);
  assert.match(url, /#cart=/);

  const recuperada = abrirEnlace(url);
  assert.equal(recuperada.length, 1);
  assert.equal(recuperada[0].ean, leche.ean);
  assert.equal(recuperada[0].quantity, 3);
  assert.equal(recuperada[0].name, leche.name);
});

test('los productos del catálogo se reconstruyen desde el catálogo, no desde el enlace', () => {
  // Enlace manipulado: mismo catalogId pero con nombre y unidad falsos.
  const payload = [{ c: leche.id, n: 'Leche GRATIS $0.01', u: 'gratis', q: 1, x: false }];
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const recuperada = abrirEnlace(`https://superprecios.test/app#cart=${encoded}`);

  // Gana el catálogo local: el enlace no puede inventar producto ni presentación.
  assert.equal(recuperada[0].name, leche.name);
  assert.equal(recuperada[0].unit, leche.unit);
});

test('un enlace no puede inyectar precios', () => {
  const payload = [{ n: 'Caviar', u: 'pz', q: 1, x: true, prices: { aurrera: 0.01 } }];
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const recuperada = abrirEnlace(`https://superprecios.test/app#cart=${encoded}`);

  assert.equal(recuperada[0].isCustom, true);
  assert.deepEqual(recuperada[0].estimatedPrices, {});
  assert.equal(recuperada[0].prices, undefined);
});

test('el nombre de un ítem compartido llega crudo y debe escaparse al pintarlo', () => {
  const payload = [{ n: '<img src=x onerror=alert(1)>', u: 'pz', q: 1, x: true }];
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const recuperada = abrirEnlace(`https://superprecios.test/app#cart=${encoded}`);

  // readSharedCart no escapa a propósito: escapar es responsabilidad de quien
  // pinta (escaparHtml en app.js). Esta prueba fija el contrato para que nadie
  // asuma que el dato ya viene limpio.
  assert.equal(recuperada[0].name, '<img src=x onerror=alert(1)>');
  assert.equal(recuperada[0].isCustom, true);
});

test('rechaza cantidades imposibles', () => {
  for (const q of [0, -5, 1e6, 'muchos', null]) {
    const payload = [{ c: leche.id, n: 'x', u: 'pz', q, x: false }];
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    assert.equal(abrirEnlace(`https://superprecios.test/app#cart=${encoded}`), null,
      `deberia rechazar cantidad ${q}`);
  }
});

test('rechaza basura sin explotar', () => {
  for (const basura of ['no-es-base64!!', 'eyJhIjoxfQ', '']) {
    assert.doesNotThrow(() => abrirEnlace(`https://superprecios.test/app#cart=${basura}`));
  }
});

test('sin parámetro cart devuelve null', () => {
  window.location.hash = '';
  assert.equal(readSharedCart(), null);
});

test('la lista para la tienda incluye modalidad, cantidades y EAN', () => {
  const texto = formatStoreList(SUPERMARKETS.heb, [itemDeCatalogo(2)], 'pickup');

  assert.match(texto, /HEB/);
  assert.match(texto, /Recoger en tienda/);
  assert.match(texto, /2 pz/);
  assert.match(texto, new RegExp(`EAN ${leche.ean}`));
  assert.match(texto, /Confirma existencias/);
});

test('la modalidad por defecto es entrega a domicilio', () => {
  const texto = formatStoreList(SUPERMARKETS.heb, [itemDeCatalogo()], 'delivery');
  assert.match(texto, /Entrega a domicilio/);
});

test('formatQuantity respeta la unidad de venta', () => {
  assert.equal(formatQuantity({ quantity: 2, unit: 'kg' }), '2 kg');
  assert.equal(formatQuantity({ quantity: 3, unit: 'pz' }), '3 pz');
  assert.equal(formatQuantity({ quantity: 1, unit: 'pqte' }), '1 pqte');
});

test('el enlace acota cuántos ítems viajan', () => {
  const muchos = Array.from({ length: 200 }, () => itemDeCatalogo(1));
  const recuperada = abrirEnlace(buildShareUrl(muchos));
  assert.ok(recuperada.length <= 60, `viajaron ${recuperada.length}`);
});
