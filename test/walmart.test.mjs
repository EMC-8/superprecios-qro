import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRODUCTS_CATALOG, SUPERMARKETS } from '../js/data.js';
import { validarObservacion } from '../scraper/lib/normalize.mjs';
import {
  adaptador,
  extraerCandidatos,
  coincideProducto
} from '../scraper/adapters/walmart.mjs';

const eansValidos = new Set(PRODUCTS_CATALOG.map(p => p.ean));
const tiendasValidas = new Set(Object.keys(SUPERMARKETS));

test('adaptador de Walmart expone el contrato esperado', () => {
  assert.equal(adaptador.id, 'walmart');
  assert.equal(adaptador.automatizable, true);
  assert.deepEqual(adaptador.cadenas, ['walmart']);
  assert.equal(typeof adaptador.obtenerPrecios, 'function');
});

test('parseo correcto de una respuesta JSON-LD válida de Walmart', () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Leche Lala Entera 1 Litro",
          "gtin13": "7501020513478",
          "sku": "00750102051347",
          "offers": {
            "@type": "Offer",
            "price": "29.50",
            "priceCurrency": "MXN",
            "availability": "https://schema.org/InStock",
            "url": "https://www.walmart.com.mx/ip/leche-lala-entera-1-l/00750102051347"
          }
        }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const candidatos = extraerCandidatos(html);
  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].name, 'Leche Lala Entera 1 Litro');
  assert.equal(candidatos[0].price, 29.5);
  assert.equal(candidatos[0].ean, '7501020513478');
  assert.equal(candidatos[0].sku, '00750102051347');
});

test('parseo correcto de una respuesta __NEXT_DATA__ de Walmart', () => {
  const nextDataObj = {
    props: {
      pageProps: {
        initialData: {
          searchResult: {
            itemStacks: [
              {
                items: [
                  {
                    name: 'Aceite Vegetal Nutrioli Puro de Soya 850ml',
                    upc: '7501039100063',
                    usItemId: '123456',
                    canonicalUrl: '/ip/aceite-nutrioli-850ml/123456',
                    priceInfo: {
                      currentPrice: {
                        price: 42.00
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    }
  };

  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextDataObj)}</script>`;
  const candidatos = extraerCandidatos(html);

  assert.equal(candidatos.length, 1);
  assert.equal(candidatos[0].name, 'Aceite Vegetal Nutrioli Puro de Soya 850ml');
  assert.equal(candidatos[0].price, 42.0);
  assert.equal(candidatos[0].ean, '7501039100063');
  assert.equal(candidatos[0].sku, '123456');
  assert.equal(candidatos[0].url, 'https://www.walmart.com.mx/ip/aceite-nutrioli-850ml/123456');
});

test('rechazo de productos con precio <= 0 o inválido', () => {
  const htmlInvalido = `
    <script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Producto Sin Precio",
      "offers": { "price": "0.00" }
    }
    </script>
    <script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Producto Precio Negativo",
      "offers": { "price": "-10.00" }
    }
    </script>
    <script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Producto Precio No Numérico",
      "offers": { "price": "gratis" }
    }
    </script>
  `;

  const candidatos = extraerCandidatos(htmlInvalido);
  for (const c of candidatos) {
    const p = c.price;
    const esInvalido = !p || p <= 0;
    assert.ok(esInvalido, `El precio ${p} debería ser considerado inválido`);
  }
});

test('validación del producto correcto por EAN exacto', () => {
  const objetivo = PRODUCTS_CATALOG.find(p => p.ean === '7501020513478');
  assert.ok(objetivo);

  const candidatoCoincidente = {
    name: 'Leche Lala Entera Pasteurizada 1 L',
    ean: '7501020513478',
    price: 29.5
  };
  assert.ok(coincideProducto(candidatoCoincidente, objetivo));

  const candidatoDistintoEan = {
    name: 'Leche Lala Entera 1 Litro',
    ean: '7501020521015', // EAN de la crema
    price: 29.5
  };
  assert.equal(coincideProducto(candidatoDistintoEan, objetivo), false);
});

test('validación estricta por nombre y presentación cuando no hay EAN', () => {
  const objetivo = PRODUCTS_CATALOG.find(p => p.id === 'atun-en-agua-dolores-140g');
  assert.ok(objetivo);

  // Mismo producto y misma presentación (140g)
  const candidatoBueno = {
    name: 'Atún Dolores en Agua Aleta Amarilla 140g',
    price: 21.5
  };
  assert.ok(coincideProducto(candidatoBueno, objetivo));

  // Mismo producto pero OTRA presentación (295g o 74g) -> DEBE RECHAZARSE
  const candidatoOtraPresentacion = {
    name: 'Atún Dolores en Agua Aleta Amarilla 295g',
    price: 39.0
  };
  assert.equal(coincideProducto(candidatoOtraPresentacion, objetivo), false);

  // Otra marca -> DEBE RECHAZARSE
  const candidatoOtraMarca = {
    name: 'Atún Tuny en Agua Aleta Amarilla 140g',
    price: 20.0
  };
  assert.equal(coincideProducto(candidatoOtraMarca, objetivo), false);
});

test('cumplimiento del contrato de observación en el pipeline', () => {
  const prod = PRODUCTS_CATALOG[0];
  const observacionSimulada = {
    ean: prod.ean,
    storeId: 'walmart',
    price: 29.50,
    capturedAt: new Date().toISOString(),
    source: 'walmart-live',
    sourceUrl: 'https://www.walmart.com.mx/ip/test',
    raw: { sku: '123' }
  };

  const problemas = validarObservacion(observacionSimulada, { eansValidos, tiendasValidas });
  assert.equal(problemas.length, 0, `No debe tener problemas: ${problemas.join(', ')}`);
});

test('el catálogo objetivo contiene exactamente 19 productos', () => {
  assert.equal(PRODUCTS_CATALOG.length, 19);
});
