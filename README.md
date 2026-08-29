# SuperPrecios QRO 🥑🛒

**SuperPrecios QRO** es una Progressive Web App (PWA) móvil y de escritorio diseñada para comparar y optimizar el costo de la canasta de compras entre las principales cadenas de supermercados en **Querétaro, México**:
- **Bodega Aurrera**
- **Chedraui / Chedraui Selecto**
- **Walmart Supercenter / Express**
- **Soriana Híper**
- **HEB Querétaro**
- **La Comer / Fresko**

> **Estado:** la app funciona completa de punta a punta, hay esquema de base de datos, pipeline de ingesta de precios y despliegue configurado.
>
> - 🤝 **¿Vas a retomar el proyecto?** Empieza por [`CONTINUIDAD.md`](CONTINUIDAD.md)
> - 🚀 **Desplegar:** [`docs/despliegue.md`](docs/despliegue.md)
> - 🔌 **Precios y scraping:** [`docs/scraping.md`](docs/scraping.md)
>
> Advertencia honesta sobre los datos: las cadenas **bloquean el scraping directo**, así que la fuente automatizada es el programa de datos abiertos de PROFECO, que publica con meses de retraso. Los precios sirven como referencia, no como precio de caja. La app lo dice sola.

---

## 🌟 Características Principales

1. **⚡ Motor de Optimización de Rutas de Compra**:
   - **🌟 Máximo Ahorro (Compra Dividida)**: asigna cada producto a la tienda donde tiene el precio más bajo y calcula el ahorro total ($ y %).
   - **⚖️ Ruta Práctica (Máximo 2 Tiendas)**: busca la mejor combinación de 2 supermercados. **La cobertura manda sobre el precio**: un par barato que no tiene la mitad de la canasta no es una ruta.
   - **🏪 Todo en 1 Sola Tienda**: identifica el supermercado individual más económico que además tenga la canasta completa.
2. **🏬 Selección de tiendas y sucursal**: eliges a qué cadenas puedes ir y qué sucursal de cada una te queda cerca. La optimización sólo considera esas, y la elección se recuerda entre sesiones.
3. **✍️ Parser de texto libre**: escribe o pega la lista en lenguaje natural (`2 leche lala, 500g queso panela, 30 huevos, 1 papel de bano`). Reconoce cantidades, unidades y marcas, y **convierte medidas a presentaciones reales de venta**: `500g queso panela` → 2 bloques de 400 g; `30 huevos` → 1 cartera de 30. La conversión se muestra en la lista para que sea auditable.
4. **🛒 Modo Supermercado**: checklist interactivo filtrado por tienda para ir tachando productos en los pasillos.
5. **📲 PWA offline**: el app shell se sirve desde caché y los precios usan red-primero con respaldo local. Funciona sin señal dentro del súper. Instalable en Android, iOS y escritorio.
6. **🏷️ Catálogo con EAN-13**: productos con su código GTIN/EAN-13 y enlace de verificación.
7. **🔎 Honestidad de datos**: la app avisa cuando los precios están viejos, cuando está usando una copia local por falta de conexión, cuando un producto no tiene precio en las tiendas elegidas, y marca con `≈` todo lo que sea estimado.

---

## ⚠️ Sobre los precios (léelo antes de confiar en el total)

Los precios **no viven en el código**: viven en `data/prices.json` y son **capturas con fecha**, no una consulta en vivo. Pueden variar por sucursal, promoción y temporada.

Reglas que respeta el motor:

- **Un precio ausente NO vale cero.** Significa "no se sabe / no lo hay ahí". Tratarlo como cero haría ver baratísima a la tienda con menos datos, que es justo la conclusión contraria a la verdadera.
- Una tienda que no cubre toda la canasta **nunca gana** la comparación de "1 sola tienda" frente a una que sí la cubre; su total se muestra marcado como parcial.
- El ahorro se mide contra una tienda que **sí** tiene todo, para que el porcentaje sea real.
- Los productos fuera del catálogo (frutas, verduras, carne) reciben un **precio estimado** de relleno. Se marcan con `≈` y sirven para que la lista no se rompa, **no** para decidir dónde comprar.

---

## 📁 Estructura del Proyecto

```
superprecios-qro/
├── index.html                  # Interfaz principal y vistas PWA
├── manifest.webmanifest        # Manifiesto PWA
├── sw.js                       # Service Worker (app shell cache-first, precios network-first)
├── vercel.json                 # Headers de despliegue estático
├── data/
│   └── prices.json             # ← LOS PRECIOS. Lo único que el scraper debe escribir.
├── css/
│   ├── main.css                # Sistema de diseño, temas de cadenas y glassmorphism
│   └── responsive.css          # Móvil y barra inferior de navegación
├── js/
│   ├── app.js                  # Controlador principal y gestión de estado
│   ├── data.js                 # Catálogo (EAN, presentación, alias) y cadenas/sucursales
│   ├── prices.js               # Carga, validación y caché de precios  ← contrato del scraper
│   ├── optimizer.js            # Motor de cálculo y optimización
│   ├── parser.js               # Parser de lenguaje natural
│   └── pwa.js                  # Service Worker y banner de instalación
├── supabase/
│   ├── migrations/             # Esquema Postgres (histórico de precios + RLS)
│   └── seed.sql                # Generado desde js/data.js
├── scraper/
│   ├── run.mjs                 # Orquestador del pipeline de precios
│   ├── adapters/               # profeco (automático) + csv-manual
│   ├── lib/                    # HTTP con modales, validación, escritura
│   └── mappings/               # Empate explícito PROFECO -> EAN
├── scripts/
│   ├── validate-prices.mjs     # Valida data/prices.json contra el contrato
│   └── generate-seed.mjs       # Regenera supabase/seed.sql desde el catálogo
├── test/
│   ├── optimizer.test.mjs
│   └── parser.test.mjs
└── assets/icons/               # icon.svg + icon-192.png + icon-512.png
```

**Separación de responsabilidades:** `data.js` describe *qué* productos existen (EAN, nombre, presentación, alias). `data/prices.json` dice *cuánto cuestan*. Los ítems de la lista guardan sólo el EAN y resuelven el precio al vuelo, así que **una lista guardada nunca se queda con precios viejos pegados**.

---

## 🚀 Cómo Ejecutar el Proyecto Localmente

No requiere dependencias. Sirve la carpeta con cualquier servidor HTTP:

```bash
python -m http.server 8080
```

Abre `http://localhost:8080`. También `npm start`, o `npx serve .`.

> Debe servirse por HTTP, no abriendo `index.html` como archivo: los módulos ES y el Service Worker requieren un origen `http(s)`.

### Tests

```bash
npm test
```

30 pruebas sobre el parser (unidades, presentaciones, alias) y el optimizador (precios faltantes, cobertura, ahorro).

### Validar la tabla de precios

```bash
npm run validate:prices
```

### Actualizar precios

```bash
npm run scrape:dry
```

Corre el pipeline completo sin escribir nada. Quita `:dry` para que escriba de verdad. Detalle en [`docs/scraping.md`](docs/scraping.md).

---

## 🔌 De dónde salen los precios

La app entera consume un solo documento, y da igual si viene de la base de datos o de un archivo: el esquema es idéntico. Un scraper no necesita tocar JavaScript.

```json
{
  "generatedAt": "2026-08-29T06:00:00.000Z",
  "source": "scraper-v1",
  "sourceLabel": "Scraping de sitios oficiales",
  "currency": "MXN",
  "region": "Queretaro, Qro., MX",
  "postalCode": "76000",
  "products": {
    "7501020513478": { "aurrera": 29.00, "walmart": 30.00, "heb": 29.90 }
  }
}
```

Reglas del contrato:

| Regla | Detalle |
|---|---|
| Llaves de `products` | EAN-13 que exista en `PRODUCTS_CATALOG` (`js/data.js`) |
| Llaves internas | `storeId` que exista en `SUPERMARKETS` (`js/data.js`) |
| Precio ausente | Significa **"no se conoce"**, no cero. Simplemente omite la llave. |
| Precio inválido | `<= 0` o no numérico se descarta al cargar |
| `generatedAt` | ISO-8601 obligatorio; la app lo usa para avisar si los precios están viejos |

Después de generarlo, verifica que cumple antes de publicar:

```bash
node scripts/validate-prices.mjs data/prices.json
```

El script reporta cobertura por tienda, productos sin precio y sale con código distinto de cero si algo no cumple, así que sirve tal cual en CI.

### Nota indispensable para el scraper

Al pedir datos a las webs o APIs de los supermercados (Walmart, Aurrera, Chedraui, Soriana), **es obligatorio enviar el código postal de Querétaro en cookies o headers** (ej. `postalCode: 76000` o `76230`). Sin eso, los sitios devuelven el catálogo de *Marketplace* en lugar del inventario de *Despensa/Súper físico*, y los precios no corresponden a la tienda a la que el usuario va a ir.

---

## 🛠️ Roadmap posterior al scraping

- [ ] Histórico de precios por sucursal (Supabase/PostgreSQL) para graficar tendencias.
- [ ] Escáner de código de barras con la cámara (`@zxing/library` o `html5-qrcode`); el catálogo ya está indexado por EAN-13.
- [ ] Ampliar el catálogo a perecederos (frutas, verduras, carne), que hoy caen en precio estimado y son los que más varían.
- [ ] Precios diferenciados por sucursal (la estructura de sucursales ya existe en `data.js`; el esquema de precios necesitaría un nivel más).
- [ ] OCR de tickets para capturar precios reales de caja.
- [ ] Despliegue con CI/CD y un job programado que corra el scraper y publique `data/prices.json`.

---

## 📄 Licencia
MIT — ver [LICENSE](LICENSE). Desarrollado para la comunidad de Querétaro.
