import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { escribirPricesJson } from '../scraper/lib/sinks.mjs';

test('escribirPricesJson en ejecución parcial actualiza únicamente la tienda corrida y preserva las demás', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-prices-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  const initialDoc = {
    generatedAt: '2026-08-31T10:00:00.000Z',
    source: 'chedraui+profeco+manual',
    sourceLabel: 'Chedraui + PROFECO + Manual',
    currency: 'MXN',
    region: 'Queretaro, Qro., MX',
    postalCode: '76000',
    products: {
      '7501020513478': {
        aurrera: 29.5,
        chedraui: 30.0,
        heb: 31.0,
        lacomer: 32.0,
        soriana: 30.5,
        walmart: 28.0
      },
      '7501040001019': {
        aurrera: 70.0,
        chedraui: 72.0,
        heb: 75.0,
        lacomer: 74.0,
        soriana: 71.0,
        walmart: 69.0
      }
    }
  };

  await writeFile(tmpFile, JSON.stringify(initialDoc, null, 2), 'utf8');

  try {
    // Corrida parcial donde Walmart solo actualiza 7501020513478 con 30.50 y no encuentra 7501040001019
    const nuevasObservaciones = [
      {
        ean: '7501020513478',
        storeId: 'walmart',
        price: 30.5,
        capturedAt: '2026-09-04T12:00:00.000Z',
        source: 'serpapi-walmart'
      }
    ];

    await escribirPricesJson(
      nuevasObservaciones,
      {
        source: 'walmart',
        sourceLabel: 'Walmart México (SerpApi)',
        esParcial: true
      },
      tmpFile
    );

    const updatedRaw = await readFile(tmpFile, 'utf8');
    const updatedDoc = JSON.parse(updatedRaw);

    // 1. Conserva ambos productos
    assert.equal(Object.keys(updatedDoc.products).length, 2);

    // 2. 7501020513478 actualizó walmart y conservó todas las demás tiendas
    assert.equal(updatedDoc.products['7501020513478'].walmart, 30.5);
    assert.equal(updatedDoc.products['7501020513478'].aurrera, 29.5);
    assert.equal(updatedDoc.products['7501020513478'].chedraui, 30.0);
    assert.equal(updatedDoc.products['7501020513478'].heb, 31.0);
    assert.equal(updatedDoc.products['7501020513478'].lacomer, 32.0);
    assert.equal(updatedDoc.products['7501020513478'].soriana, 30.5);

    // 3. 7501040001019 (sin nueva observación de Walmart) NO fue borrado y conserva sus tiendas
    assert.equal(updatedDoc.products['7501040001019'].walmart, 69.0);
    assert.equal(updatedDoc.products['7501040001019'].aurrera, 70.0);
    assert.equal(updatedDoc.products['7501040001019'].chedraui, 72.0);

    // 4. Metadatos no afirman que todo el snapshot fue generado únicamente por Walmart
    assert.ok(updatedDoc.source.includes('chedraui'));
    assert.ok(updatedDoc.source.includes('walmart'));
    assert.ok(updatedDoc.sourceLabel.includes('Chedraui'));
    assert.ok(updatedDoc.sourceLabel.includes('Walmart'));
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
});

test('escribirPricesJson sin snapshot previo crea el archivo correctamente', async () => {
  const tmpFile = path.join(os.tmpdir(), `test-prices-new-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    const observaciones = [
      {
        ean: '7501020513478',
        storeId: 'walmart',
        price: 30.0,
        capturedAt: '2026-09-04T12:00:00.000Z',
        source: 'serpapi-walmart'
      }
    ];

    await escribirPricesJson(
      observaciones,
      {
        source: 'walmart',
        sourceLabel: 'Walmart México (SerpApi)',
        esParcial: true
      },
      tmpFile
    );

    const doc = JSON.parse(await readFile(tmpFile, 'utf8'));
    assert.equal(Object.keys(doc.products).length, 1);
    assert.equal(doc.products['7501020513478'].walmart, 30.0);
    assert.equal(doc.source, 'walmart');
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
});
