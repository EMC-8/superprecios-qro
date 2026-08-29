# SuperPrecios QRO 🥑🛒

PWA para comparar el costo de la canasta de compras entre supermercados de
**Querétaro, México**, y decidir dónde comprar cada producto.

Cadenas: **Bodega Aurrera · Chedraui · Walmart · Soriana · La Comer / Fresko · HEB**

> **Estado: MVP funcional.** La app corre completa sin instalar nada y sin base de
> datos. Lo que falta es infraestructura (Supabase, Vercel), no funcionalidad.

```bash
npm start     # http://localhost:8080
npm test      # 41 pruebas
```

Sin dependencias. Sin build. Módulos ES estáticos servidos tal cual.

---

## Índice

- [Qué hace](#qué-hace)
- [Cómo funciona (el modelo mental)](#cómo-funciona-el-modelo-mental)
- [Arquitectura](#arquitectura)
- [Las reglas que el código defiende](#las-reglas-que-el-código-defiende)
- [De dónde salen los precios](#de-dónde-salen-los-precios)
- [Comandos](#comandos)
- [Lo que falta](#lo-que-falta)
- [Documentación](#documentación)

---

## Qué hace

Escribes tu lista en lenguaje natural y la app te dice **dónde comprar cada cosa**.

### 1. Optimizador de ruta — 3 estrategias

| Estrategia | Qué resuelve | Ejemplo real |
|---|---|---|
| 🌟 **Máximo Ahorro** | Cada producto donde esté más barato | $367.30 en 3 tiendas |
| ⚖️ **Ruta Práctica** | La mejor combinación de exactamente 2 tiendas | $368.80 en 2 tiendas |
| 🏪 **1 Sola Tienda** | El supermercado único más económico que tenga todo | $370.80 en 1 tienda |

Más tiendas siempre sale más barato; la app te deja elegir cuánto viaje vale ese ahorro.

### 2. Parser de texto libre

Escribe como hablas. Convierte medidas a **presentaciones reales de venta**:

| Escribes | Entiende | Por qué |
|---|---|---|
| `500g queso panela` | 2 bloques | Se vende en bloques de 400 g |
| `30 huevos` | 1 cartera | La cartera trae 30 piezas |
| `12 rollos papel de bano` | 1 paquete | El paquete trae 12 rollos |
| `1.5 l coca cola` | 1 botella | La presentación es de 2.5 L |
| `2 leche lala` | 2 piezas | Sin unidad = piezas |

La conversión se muestra en la lista para que sea auditable, no un misterio.

### 3. Selección de tiendas y sucursal

Eliges a qué cadenas puedes ir y qué sucursal te queda cerca. La optimización, el
catálogo y el checklist respetan esa selección, y se recuerda entre sesiones.

### 4. Modo Supermercado

Checklist interactivo filtrado por tienda para ir tachando en los pasillos.

### 5. Compra Guiada

Para comprar en línea. Recorre **sólo los productos que el optimizador asignó a
esa tienda**, con el término de búsqueda listo para copiar, el EAN y el enlace
directo a la búsqueda oficial de la cadena.

Los supermercados no ofrecen un carrito universal, así que la app no simula ser
el retailer: el login, la sucursal, la disponibilidad, el domicilio y el pago
ocurren únicamente en su dominio.

### 6. Canasta compartible

Un enlace reconstruye tu lista en el dispositivo de otra persona. Viaja en el
fragmento de la URL (no llega al servidor) y **no lleva precios**.

### 7. Funciona sin señal

El app shell se sirve desde caché y los precios usan red-primero con respaldo
local. Instalable en Android, iOS y escritorio.

---

## Cómo funciona (el modelo mental)

Si vas a tocar el código, esto es lo que hay que entender primero.

### Catálogo y precios están separados

```
js/data.js          →  QUÉ existe   (EAN, nombre, presentación, alias, cadenas)
data/prices.json    →  CUÁNTO cuesta
```

Los ítems de tu lista guardan **sólo el EAN** y resuelven el precio al vuelo.
Por eso una lista guardada nunca se queda con precios viejos pegados.

**No vuelvas a meter precios dentro de `js/data.js`.**

### El precio puede venir de tres lugares

`js/prices.js` intenta en orden y se queda con el primero que responda:

```
1. Supabase           el dato más fresco       (si js/config.js está lleno)
2. data/prices.json   respaldo versionado      (precacheado por el Service Worker)
3. localStorage       última copia buena       (cuando no hay red)
```

Si los tres fallan, la app **lo dice** en vez de mostrar totales inventados.

### El flujo completo

```
   texto libre
        │  parser.js  →  convierte a presentaciones de venta
        ▼
   ítems (sólo EAN + cantidad)
        │  prices.js  →  resuelve precios
        ▼
   optimizer.js  →  3 estrategias, respetando tiendas habilitadas
        │
        ├──→  Modo Supermercado   (comprar físicamente)
        └──→  Compra Guiada       (comprar en línea, sitio oficial)
```

---

## Arquitectura

```
index.html                    Interfaz completa; todas las vistas viven aquí
sw.js                         Service Worker: shell cache-first, precios network-first
vercel.json                   Cabeceras por ruta para hosting estático

js/
  app.js                      Controlador, estado y render
  data.js                     Catálogo de productos y cadenas. Sin precios.
  prices.js                   Carga de precios y su contrato de datos
  optimizer.js                Motor de cálculo. Puro, sin DOM.
  parser.js                   Texto libre → ítems, con conversión de presentaciones
  checkout.js                 Handoff oficial y canasta compartible ⚠️ entrada insegura
  profile.js                  Preferencia de entrega
  config.js                   Credenciales públicas de Supabase. Vacío = usa el archivo.
  pwa.js                      Registro del SW y banner de instalación

data/prices.json              Precios vigentes. Lo que la PWA precachea.

supabase/
  migrations/0001_*.sql       Tablas. price_observations es histórico inmutable.
  migrations/0002_*.sql       RLS + prices_snapshot() + price_history()
  seed.sql                    GENERADO desde js/data.js — no editar a mano

scraper/
  run.mjs                     Orquestador del pipeline de precios
  adapters/profeco.mjs        Automático: datos abiertos de PROFECO
  adapters/csv-manual.mjs     Captura a mano. Única vía para HEB.
  lib/                        HTTP con modales, validación, escritura
  mappings/                   Empate explícito PROFECO → EAN

scripts/
  validate-prices.mjs         Valida data/prices.json contra el contrato
  generate-seed.mjs           Regenera supabase/seed.sql desde el catálogo

test/                         41 pruebas con node:test, sin dependencias
```

**Contenido actual:** 19 productos con EAN-13, 6 cadenas, 19 sucursales, 5 categorías.

---

## Las reglas que el código defiende

Están cubiertas por pruebas. Si una prueba falla al cambiar algo, lo más probable
es que el cambio esté mal, no la prueba.

**Un precio ausente NO vale cero.** Significa "no se sabe / no lo hay ahí".
Tratarlo como cero haría ver baratísima a la tienda con menos datos, que es la
conclusión contraria a la verdadera.

**Una tienda que no cubre la canasta completa nunca gana** la comparación de "1
sola tienda" frente a una que sí la cubre. Su total se marca como parcial.

**En la ruta de 2 tiendas, la cobertura manda sobre el precio.** Un par barato que
no tiene media canasta no es una ruta, es un viaje perdido.

**El ahorro se mide contra una tienda que sí tiene todo**, si no el porcentaje es
ficción.

**Los precios estimados se marcan con `≈`** y nunca se presentan como reales.

**Cuando varias sucursales difieren, se usa la mediana**, no el promedio (se desvía
con cualquier dato raro) ni el mínimo (promete un precio que no vas a encontrar
donde llegues).

**El checkout es de cada cadena.** La app genera enlaces oficiales y copia la
lista; nunca simula crear un carrito ni promete disponibilidad o costo de envío.

**Todo nombre que se pinte pasa por `escaparHtml()`.** La canasta compartible
acepta contenido de terceros por URL: el nombre de un producto personalizado lo
escribe quien arma el enlace, no quien lo abre.

---

## De dónde salen los precios

Los precios son **capturas con fecha**, no una consulta en vivo. Pueden variar por
sucursal, promoción y temporada. La app muestra la antigüedad real y avisa cuando
pasa de 14 días.

### Las cadenas bloquean el scraping directo

Probado contra sus sitios: Chedraui responde `400 Scripts are not allowed!`,
Soriana `403` con anti-bot, HEB `404` con detección. Saltarse eso sería evasión de
detección y **este proyecto no la construye**.

### La fuente automatizada es PROFECO

`scraper/adapters/profeco.mjs` consume el programa de datos abiertos
["Quién es Quién en los Precios"](https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2025).
Oficial, abierto y verificado funcionando: en la última corrida procesó 437,363
filas en streaming y extrajo precios reales de Querétaro.

Sus límites, sin adornos:

- Cubre 5 de las 6 cadenas. **HEB no participa** — sus precios sólo entran por
  captura manual (`scraper/data-manual/`).
- **Publica con meses de retraso.** Sirve como línea base y para tendencias, no
  como precio de caja.
- **No incluye código de barras**, así que el empate con el catálogo es explícito
  y lo aprueba una persona: 8 de 19 productos mapeados hoy, los otros 11
  documentados uno por uno con su motivo.

Detalle completo en [`docs/scraping.md`](docs/scraping.md).

### El contrato de datos

Da igual si el precio viene de la base o del archivo: el esquema es idéntico, así
que un scraper no necesita tocar JavaScript.

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

| Regla | Detalle |
|---|---|
| Llaves de `products` | EAN-13 que exista en `PRODUCTS_CATALOG` |
| Llaves internas | `storeId` que exista en `SUPERMARKETS` |
| Precio ausente | Significa **"no se conoce"**, no cero. Omite la llave. |
| Precio inválido | `<= 0` o no numérico se descarta al cargar |
| `generatedAt` | ISO-8601 obligatorio |

Valídalo antes de publicar: `npm run validate:prices`

---

## Comandos

```bash
npm start                   # servidor local en :8080
npm test                    # 41 pruebas
npm run validate:prices     # valida data/prices.json contra el contrato
npm run scrape:dry          # corre el pipeline de precios sin escribir
npm run scrape              # corre el pipeline de verdad
npm run scrape:sugerencias  # candidatos para ampliar el mapeo de PROFECO
npm run seed                # regenera supabase/seed.sql desde el catálogo
```

> Debe servirse por HTTP, no abriendo `index.html` como archivo: los módulos ES y
> el Service Worker requieren un origen `http(s)`.

---

## Lo que falta

Todo lo pendiente es infraestructura. El código está completo y probado.

### 1. Supabase — opcional, da histórico de precios

Sin esto la app funciona leyendo `data/prices.json`.

Correr en el SQL Editor, en orden: `0001_initial_schema.sql`,
`0002_rls_and_snapshot.sql`, `seed.sql`. Luego poner la URL y la *publishable key*
en `js/config.js`. El badge del header debe pasar a decir **"· en vivo"**.

La `service_role` key **nunca** va en el repo; sólo en secretos de CI.

> Bloqueo conocido: la organización de Supabase está en su límite de proyectos
> gratuitos. Hay que pausar uno, subir de plan, o aplicar el esquema en un
> proyecto existente — las tablas tienen nombres propios del dominio y no chocan.

### 2. Vercel — despliegue continuo

Requiere instalar primero la [GitHub App de Vercel](https://github.com/apps/vercel)
en la organización y darle acceso al repo. Después: importar en
[vercel.com/new](https://vercel.com/new) con Framework Preset `Other` y **sin build
command**.

> El repo también trae `.github/workflows/deploy-pages.yml`, que publica a GitHub
> Pages sin ninguna configuración extra. Si con eso basta, Vercel es opcional.

### 3. Actualización automática de precios

`.github/workflows/actualizar-precios.yml` corre el scraper lunes y jueves, valida,
prueba y commitea `data/prices.json`. Necesita los secretos `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` para escribir el histórico; sin ellos igual actualiza
el archivo.

Procedimiento completo con verificación paso a paso en
[`docs/despliegue.md`](docs/despliegue.md).

### Roadmap

- [ ] Ampliar el catálogo a perecederos (carne, pollo, verdura). Son los que más
      varían de precio y PROFECO **sí** los trae.
- [ ] Escáner de código de barras. El catálogo ya está indexado por EAN-13 y
      existe el Modo Supermercado: agregar cámara convierte a cada usuario en
      fuente de datos. Es la única vía realista a precios del día.
- [ ] Precios por sucursal. `price_observations` ya tiene `branch_id`; falta la
      agregación y la UI.
- [ ] Gráficas de tendencia. La función `price_history(ean, dias)` ya existe.
- [ ] OCR de tickets.

---

## Documentación

| Documento | Para qué |
|---|---|
| [`CONTINUIDAD.md`](CONTINUIDAD.md) | **Empieza aquí si retomas el proyecto.** Decisiones con su porqué, invariantes, deuda técnica. |
| [`AGENTS.md`](AGENTS.md) | Instrucciones para agentes de código: reglas duras, trampas del repo y cómo verificar |
| [`docs/despliegue.md`](docs/despliegue.md) | Runbook de Supabase y Vercel, con verificación en cada paso |
| [`docs/scraping.md`](docs/scraping.md) | Fuentes de precios, qué se probó y qué se descartó |

---

## Licencia

MIT — ver [LICENSE](LICENSE). Desarrollado para la comunidad de Querétaro.
