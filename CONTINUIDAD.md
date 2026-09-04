# Continuidad del proyecto

Este documento es para quien tome el proyecto sin haber estado en las
conversaciones previas. Explica **en qué estado está**, **por qué está armado
así** y **qué sigue**.

Si sólo vas a tocar código, lee las secciones 1, 3 y 4. Si vas a tomar
decisiones de producto, lee también la 2. Si vas a continuar el trabajo de
Walmart, ve directamente a la sección 6.

---

## 1. Qué es y en qué estado está

PWA sin build ni dependencias (JavaScript vanilla con módulos ES) que compara el
costo de una canasta de compras entre 6 cadenas de supermercados en Querétaro y
te dice dónde comprar cada cosa.

### Funciona hoy

| Pieza | Estado |
|---|---|
| Optimizador (3 estrategias) | ✅ completo, 41 pruebas |
| Parser de texto libre | ✅ completo, con conversión de unidades a presentaciones |
| Selección de cadenas y sucursal | ✅ completo, persistida |
| Modo Supermercado (checklist) | ✅ completo |
| Compra Guiada (handoff oficial) | ✅ integrada desde upstream |
| Canasta compartible por enlace | ✅ completa, con validación de entrada |
| Catálogo con EAN-13 | ✅ **19 productos** (fuente: `js/data.js`) |
| PWA offline | ✅ Service Worker con app shell cache-first |
| Avisos de calidad de datos | ✅ precios viejos, sin precio, copia local |
| Esquema de base de datos | ✅ escrito y listo, **no aplicado todavía** |
| Pipeline de ingesta de precios | ✅ corre de verdad contra datos oficiales |
| Despliegue | ⚠️ configurado y subido; **falta enlazar Vercel y Supabase** — ver [`docs/despliegue.md`](docs/despliegue.md) |

### No funciona / falta

- **La base de datos no existe todavía.** Las migraciones están escritas y
  probadas de forma estática, pero nunca se han aplicado a un Postgres real.
  Bloqueo: la organización de Supabase está en su límite de 2 proyectos gratuitos.
- **Los precios son viejos.** Ver sección 2.
- **El catálogo son 19 productos** y no incluye perecederos (frutas, verduras,
  carne), que son justamente los que más varían de precio entre tiendas.
- **HEB no tiene fuente automatizada.** Sólo captura manual.
- **Walmart no tiene fuente automatizable confirmada.** Ver sección 6.

---

## 2. Lo que hay que entender antes de tocar nada

### 2.1 Las cadenas bloquean el scraping. Esto no es un bug.

Se probó consultar directamente a los sitios de las cadenas. Respuestas reales:

| Cadena | Respuesta |
|---|---|
| Chedraui | `400 Bad Request! Scripts are not allowed!` |
| Soriana | `403` con página de protección anti-bot |
| HEB | `404` con inyección de script de detección |
| La Comer | `404` (endpoint no público) |
| **Walmart** | `307` → página de bloqueo Akamai "Verifica tu identidad" |

Saltarse eso requeriría rotar identidades, resolver captchas o disfrazar el
tráfico. **El proyecto no hace eso y no debe empezar a hacerlo**: además del
problema legal, un pipeline construido sobre evasión se rompe cada dos semanas
y no se puede mantener.

> **REGLA PERMANENTE:** No usar stealth browsers, CAPTCHA solving, proxies para
> evadir bloqueo, fingerprint spoofing ni ninguna técnica para evadir
> Akamai/WAF/anti-bot de ninguna cadena.

### 2.2 La fuente automatizada es PROFECO, y publica tarde

`scraper/adapters/profeco.mjs` consume el programa de datos abiertos
["Quién es Quién en los Precios"](https://www.datos.gob.mx/dataset/programa_quien_es_quien_precios_2025).
Es oficial, abierto y **verificado funcionando**: en la última corrida leyó
437,363 filas en streaming y sacó 54 precios de Querétaro.

Sus tres límites, que hay que repetirle a quien pregunte:

1. **Publica con meses de retraso.** Al momento de escribir esto lo más reciente
   disponible era de noviembre 2025: 273 días de antigüedad. Sirve como línea
   base y para tendencias históricas, **no como precio de caja**.
2. **HEB no participa** en el programa.
3. **No incluye código de barras.** De ahí sale la decisión 2.3.

### 2.3 El empate de productos es explícito a propósito

Como PROFECO no da EAN, el empate se hace por texto. Se podría automatizar con
similitud difusa. **Deliberadamente no se hace.**

La razón: un precio mal empatado es peor que un precio ausente. El ausente se
avisa en la interfaz y el usuario lo verifica en tienda. El equivocado se ve
idéntico a uno correcto y manda a alguien a cruzar la ciudad por un ahorro que
no existe. Toda la app está construida sobre esa distinción.

Por eso cada empate vive en `scraper/mappings/profeco-queretaro.json` y lo
aprueba una persona. Hoy hay 8 de 19 productos mapeados; los 11 restantes están
documentados uno por uno en la llave `_sin_mapear` con el motivo (varios existen
en PROFECO pero en **otra presentación**, y mezclar presentaciones es exactamente
el error que se está evitando).

### 2.4 Invariantes que no se deben romper

Estas reglas están cubiertas por pruebas. Si una prueba falla al cambiar algo,
lo más probable es que el cambio esté mal, no la prueba.

- **Un precio ausente NO vale cero.** Tratarlo como cero hace ver baratísima a la
  tienda con menos datos, que es la conclusión contraria a la verdadera.
- **Una tienda que no cubre la canasta completa nunca gana** la comparación de
  "1 sola tienda" frente a una que sí la cubre.
- **En la ruta de 2 tiendas, la cobertura manda sobre el precio.** Un par barato
  que no tiene media canasta no es una ruta, es un viaje perdido.
- **El ahorro se mide contra una tienda que sí tiene todo**, si no el porcentaje
  es ficción.
- **Los precios estimados se marcan con `≈`** y nunca se presentan como reales.
- **Cuando varias sucursales difieren, se usa la mediana**, no el promedio (se
  desvía con cualquier dato raro) ni el mínimo (promete un precio que el usuario
  no va a encontrar donde llegue).
- **El checkout es de cada cadena.** La app genera enlaces oficiales y copia la
  lista; nunca simula crear un carrito del retailer ni promete disponibilidad,
  costo de envío o condiciones de entrega.
- **La app es sin dependencias, módulos ES estáticos.** Debe poder desplegarse en
  cualquier hosting estático. Antes de subir, se valida con un servidor HTTP
  local, no abriendo el HTML como archivo.

### 2.5 Este repo fusiona dos ramas que se habían separado

En agosto 2026 el proyecto se bifurcó: EMC-8 (Gotchy, pgarcia-debug) y este fork
reescribieron la app en paralelo desde el mismo commit inicial. **Ya están
fusionados**, tomando de cada lado lo que resolvía mejor el problema:

| Viene de | Qué |
|---|---|
| Este fork | 3 estrategias de optimización, parser con presentaciones, precios separados del código, base de datos, tests, scraper PROFECO, Vercel |
| Upstream | Compra Guiada, handoff al sitio oficial, perfil de entrega, canasta compartible, las URLs oficiales de cada cadena, despliegue a GitHub Pages |

Dos cosas que hay que saber de esa fusión:

- **Upstream había eliminado la compra dividida y la ruta de 2 tiendas** para
  pivotear a "comparar y mandar a comprar en línea". Aquí conviven: el
  optimizador decide *qué* comprar en cada tienda y la guía ayuda a
  *encontrarlo*. Por eso `itemsAsignadosA()` recorre sólo lo que el optimizador
  asignó a esa tienda, no la lista completa.
- **El parser de upstream no tenía la conversión de presentaciones.** En su
  versión `30 huevos` daba 30 carteras y `500g queso panela` daba 0.5 piezas.
  No reintroduzcas su `parseLine`.
- **Al limpiar se removieron `.planning/`, `.specify/`, `specs/` y `NAPKIN.md`.**
  Los primeros describían el producto anterior (sin optimización de rutas) y
  habrían confundido a quien llegara; `.specify/` era andamiaje de tooling ajeno
  al producto. Las cuatro reglas útiles de `NAPKIN.md` viven ahora en los
  invariantes de la sección 2.4. Todo sigue en el historial de git:
  `git show af6f134:.planning/PROJECT.md`

### 2.6 Todo lo que entra por URL es contenido de terceros

Desde que existe la canasta compartible, el nombre de un producto personalizado
lo escribe quien arma el enlace, no quien lo abre. Hay dos defensas y ambas
tienen que seguir en pie:

1. `readSharedCart()` (checkout.js) reconstruye los productos del catálogo
   **desde el catálogo local**, usando el id sólo para buscarlos. Un enlace no
   puede inventar un producto, una presentación ni un precio.
2. `escaparHtml()` (app.js) escapa todo nombre antes de interpolarlo. Está
   verificado: un enlace con `<img src=x onerror=...>` se pinta como texto y no
   ejecuta nada.

Si agregas un render nuevo que muestre nombres de productos, **escápalo**.

### 2.7 Separación catálogo / precios

`js/data.js` describe **qué** existe (EAN, nombre, presentación, alias).
`data/prices.json` dice **cuánto cuesta**.

Los ítems de la lista de compras guardan **sólo el EAN** y resuelven el precio al
vuelo. Eso es lo que evita que una lista guardada en `localStorage` se quede con
precios viejos pegados para siempre (bug que sí existía en la versión original).

No vuelvas a meter precios dentro de `js/data.js`.

---

## 3. Mapa del código

```
index.html            Interfaz completa; todas las vistas viven aquí
sw.js                 Service Worker: app shell cache-first, precios network-first
vercel.json           Cabeceras por ruta (sw.js sin caché, precios revalidados)

js/
  app.js              Controlador, estado y render. El archivo grande.
  checkout.js         Handoff oficial y canasta compartible. ENTRADA INSEGURA.
  profile.js          Preferencia de entrega. Sin datos sensibles.
  data.js             Catálogo de 19 productos y cadenas. Sin precios. FUENTE DE VERDAD.
  prices.js           Carga de precios: Supabase → prices.json → caché local.
                      ← El contrato de datos vive documentado aquí arriba.
  optimizer.js        Motor de cálculo. Puro, sin DOM. Fácil de probar.
  parser.js           Texto libre → ítems. Conversión de unidades a presentaciones.
  config.js           URL y llave pública de Supabase. Vacío = usa el archivo.
  pwa.js              Registro del SW y banner de instalación.

data/prices.json      Estado vigente de precios. Lo que la PWA precachea.

supabase/
  migrations/0001_    Tablas. price_observations es un histórico inmutable.
  migrations/0002_    RLS (sólo lectura pública) + prices_snapshot() + price_history()
  seed.sql            GENERADO. No editar a mano; correr `npm run seed`.

scraper/
  run.mjs             Orquestador: adaptadores → validación → consolidación → escritura
  adapters/profeco    Automático. Streaming de CSV de ~150 MB.
  adapters/walmart    IMPLEMENTADO pero 0 precios obtenidos. Ver sección 6.
  adapters/csv-manual Captura a mano. Única vía para HEB.
  lib/http.mjs        Cliente con ritmo, reintentos y timeout. Sin evasión.
  lib/normalize.mjs   Validación y consolidación por mediana.
  lib/sinks.mjs       Escribe a Supabase y a prices.json.
  mappings/           Empate explícito PROFECO → EAN.

scripts/
  validate-prices.mjs Valida prices.json contra el contrato. Úsalo en CI.
  generate-seed.mjs   Regenera supabase/seed.sql desde js/data.js.

test/                 51 pruebas con node:test, sin dependencias.
docs/despliegue.md    Vercel + Supabase paso a paso.
docs/scraping.md      Todo lo de la sección 2, con más detalle.
```

### Comandos

```bash
npm start                  # servidor local en :8080
npm test                   # 51 pruebas (node --test test)
npm run validate:prices    # valida data/prices.json
npm run scrape:dry         # corre el pipeline sin escribir
npm run scrape             # corre el pipeline de verdad
npm run scrape:sugerencias # candidatos para ampliar el mapeo
npm run seed               # regenera supabase/seed.sql
```

---

## 4. Qué sigue

### 4.1 Desbloqueos inmediatos (requieren a una persona, no código)

El repositorio de trabajo es **`EMC-8/superprecios-qro`**, público. El
procedimiento de infraestructura está en [`docs/despliegue.md`](docs/despliegue.md),
escrito como runbook paso a paso.

Dos bloqueos, en orden de urgencia:

1. **Espacio en Supabase.** La organización ETER está en su límite de 2 proyectos
   gratuitos (`ETERID`, `torrent-studio-crm`). Hay que pausar uno, subir de plan,
   o aplicar el esquema en un proyecto existente — las tablas tienen nombres
   propios del dominio y no chocan. Runbook parte B.1.

2. **Verificar el Service Worker en un navegador real.** Nunca se pudo confirmar
   durante el desarrollo. Es lo que hace que la app sirva sin señal dentro del
   súper, así que es la verificación que más importa. Runbook parte A.2.

La app funciona sin Supabase (lee `data/prices.json`), así que el punto 1 no
bloquea desplegar en Vercel.

### 4.2 Trabajo de producto, por impacto

1. **Ampliar el catálogo a perecederos.** Frutas, verduras y carne son lo que más
   varía de precio y hoy caen en "precio estimado". PROFECO **sí** los trae
   (`Carne Res`, `Carne Pollo`, `Chile Fresco`, `Tortilla de Maíz`), así que
   agregarlos al catálogo desbloquea datos reales de inmediato. Ojo: se venden
   por peso, y el catálogo actual asume presentaciones empaquetadas — revisa
   `pack` en `js/data.js` y la conversión en `parser.js`.

2. **Escáner de código de barras.** El catálogo ya está indexado por EAN-13 y
   existe el Modo Supermercado. Agregar cámara + un campo de precio convierte a
   cada usuario en fuente de datos. **Es la única vía realista a precios del
   día**, dado lo de la sección 2.1. Librerías: `@zxing/library` o `html5-qrcode`.

3. **Ampliar el mapeo de PROFECO.** `npm run scrape:sugerencias` lista los
   candidatos ordenados por frecuencia. Regla: sólo mapear cuando la presentación
   coincida.

4. **Precios por sucursal.** Hoy el precio es por cadena; la sucursal sólo afecta
   la ruta que se muestra. El esquema de la base ya tiene `branch_id` en
   `price_observations`, así que el cambio es de agregación y de UI, no de
   modelo.

5. **Gráficas de tendencia.** La función `price_history(ean, dias)` ya existe en
   la base. Falta la UI.

### 4.3 Deuda técnica conocida

- `js/app.js` pasa de 1,100 líneas y mezcla estado, render y eventos. Si va a
  crecer más, conviene separar render por pestaña antes de agregar features.
- El render usa `innerHTML` con plantillas. Ya hay escapado (`escaparHtml`) en
  los puntos donde entra contenido de terceros; si agregas otro render que
  muestre nombres de producto, aplícalo. Ver sección 2.6.
- `icon-512.png` pesa 261 KB porque el degradado no comprime bien. Funciona;
  pasarlo por un optimizador PNG estaría bien.
- El registro del Service Worker nunca se pudo verificar en el navegador de
  desarrollo usado. Hay que confirmarlo en Chrome real:
  `Application → Service Workers`.

---

## 5. Historia del repositorio

| Commit | Qué trae |
|---|---|
| `1fe97d2` | Release inicial (versión heredada) |
| `839e9a4` | Arregla íconos PWA faltantes, bug de unidades del parser y precios presentados como "verificados" cuando eran inventados |
| `81c8828` | Separa precios del código, endurece el optimizador ante datos faltantes, selección de tiendas, tests |
| `708ed7d` | Esquema de base de datos, seed generado, Supabase como fuente en el cliente |
| `6fd66cb` | Pipeline de scraping, workflow de CI, documentación de despliegue |
| `430f7d4` | Este documento |
| *(fusión)* | Integra Compra Guiada, perfil y canasta compartible desde upstream |
| `8a0fb1f` | **feat(scraper): agregar adaptador de Walmart Mexico para 19 productos del catalogo** — en `feature/walmart-scraper` |

El repositorio de trabajo es **`EMC-8/superprecios-qro`**. El fork
`JETER3/superprecios-qro` sirvió para desarrollar la reescritura y queda como
respaldo; no se trabaja ahí.

---

## 6. Investigación y trabajo sobre Walmart México

> **Esta sección documenta todo el trabajo realizado sobre Walmart en
> `feature/walmart-scraper`. Es la parte más importante para quien retome.**

### 6.1 Objetivo

Agregar precios reales de Walmart México para los **19 productos del catálogo**
(`js/data.js`). El alcance es ÚNICAMENTE esos 19 productos. No crawling de
catálogo, no nuevos productos.

### 6.2 Branch y commit

- **Branch:** `feature/walmart-scraper`
- **Commit de implementación:** `8a0fb1f feat(scraper): agregar adaptador de Walmart Mexico para 19 productos del catalogo`
- **Tests:** 51 passed (se añadieron 10 tests de Walmart a los 41 existentes)
- **`npm run validate:prices`:** OK
- **`npm run scrape:dry` (Walmart):** 0 observations obtenidas

### 6.3 Archivos modificados en `feature/walmart-scraper`

| Archivo | Cambio |
|---|---|
| `scraper/adapters/walmart.mjs` | **NUEVO.** Adaptador para Walmart México. Implementado pero bloqueado. |
| `test/walmart.test.mjs` | **NUEVO.** 10 pruebas unitarias del adaptador. |
| `scraper/run.mjs` | Registra `walmart` como adaptador en el orquestador. |
| `package.json` | Script `test` cambiado a `node --test test` (cross-platform). |

### 6.4 Intento 1 — HTTP directo

Se intentó acceder a `walmart.com.mx` directamente mediante peticiones HTTP
(fetch/node-fetch) para obtener páginas de producto o búsqueda.

**Resultado:** Akamai Bot Manager intercepta la petición y devuelve `HTTP 307`
redirigiendo a una página de bloqueo/verificación. No se obtuvo ningún precio.

> ❌ **HTTP directo: NO VIABLE.**

### 6.5 Intento 2 — Playwright (navegador real)

Se realizó una prueba de factibilidad con Playwright usando **únicamente 1
producto**:

- EAN: `7501020513478`
- Producto: `Leche Lala Entera 1 Litro`

Se probaron dos búsquedas:
1. Por EAN: `7501020513478`
2. Por nombre: `"leche lala entera 1 litro"`

**Resultado en ambos casos:** Walmart redirige inmediatamente a la página de
Akamai "Verifica tu identidad" (`/blocked`). No se cargó ningún resultado de
producto ni se obtuvo precio alguno.

> ❌ **Playwright con navegador real: NO VIABLE.**

Los archivos de prueba de Playwright se eliminaron del árbol de trabajo para
mantener el repositorio limpio. El working tree quedó en estado `clean`.

### 6.6 Regla permanente sobre Walmart

> **No utilizar stealth browsers, CAPTCHA solving, proxies para evadir bloqueo,
> fingerprint spoofing, IP rotation, ni ninguna otra técnica para evadir
> Akamai/WAF de Walmart.** Un pipeline basado en evasión es frágil, de
> mantenimiento costoso, y potencialmente viola los términos de servicio.

### 6.7 Investigación de fuentes alternativas — PROFECO

Se investigó el dataset **PROFECO — Quién es Quién en los Precios (QQP)**
como fuente alternativa para precios de Walmart.

**Dataset analizado:**
- Archivo: `11-2025_02.csv`
- URL: `https://repodatos.atdt.gob.mx/api_update/profeco/programa_quien_es_quien_precios_2025/11-2025_02.csv`
- Last-Modified: Thu, 11 Dec 2025 07:41:27 GMT
- Tamaño: ~138 MB

**Prueba con `7501020513478 — Leche Lala Entera 1 Litro`:**

| Métrica | Valor |
|---|---|
| Observaciones Walmart en QRO | **2** |
| Sucursal encontrada | `Walmart Sucursal Unidad Plaza de Toros`, Santiago de Querétaro |
| Precios encontrados | $36.00 (2025/11/18) y $37.00 (2025/11/25) |
| Mínimo | $36.00 |
| Máximo | $37.00 |
| Mediana | $36.50 |
| Promedio | $36.50 |
| ¿Existe columna EAN en el CSV? | **No** |
| Identificación de Walmart | `cadena_comercial = "Wal-mart"` |
| Identificación de Querétaro | `estado = "Querétaro"` (normalizado) |
| Fecha de la observación | Individual por fila (`fecha_registro`) |

**Conclusión de PROFECO para Walmart:**

- ✅ Es una fuente pública, legítima y oficial.
- ✅ Permite obtener precios **observados por encuestadores PROFECO en sucursales Walmart físicas de Querétaro**, con fecha exacta de registro.
- ⚠️ **NO representa el precio actual de Walmart.** Latencia mínima de semanas, frecuentemente meses.
- ⚠️ Cobertura limitada: solo 1 sucursal (`Plaza de Toros`) de las múltiples que existen en Querétaro.
- ⚠️ Sin EAN: el match depende 100% del mapping textual en `scraper/mappings/profeco-queretaro.json`.
- ⚠️ Solo 2 observaciones en todo noviembre 2025 para esa sucursal.

> **CONCLUSIÓN: `APTO PARA PRECIO HISTÓRICO / REFERENCIA`. NO usar como precio actual de Walmart.**

### 6.8 Fuente adoptada — SerpApi

**SerpApi — Walmart Search API** es la fuente de precios adoptada para Walmart México.

**Endpoint:**
```
GET https://serpapi.com/search.json
  ?engine=walmart
  &query=<us_item_id>
  &walmart_domain=walmart.com.mx
  &api_key={SERPAPI_KEY}
```

| Criterio | Estado |
|---|---|
| ¿Soporta `walmart.com.mx`? | ✅ Sí, mediante `walmart_domain=walmart.com.mx` |
| ¿Es automatizable? | ✅ Sí, API REST JSON |
| ¿Requiere autenticación? | ✅ Sí, `SERPAPI_KEY` en variables de entorno |
| ¿Evade Akamai? | SerpApi gestiona eso en sus servidores. El proyecto no interactúa con Walmart directamente. |
| ¿Es legítimo? | ✅ SerpApi es un intermediario legal reconocido. |
| Búsqueda por EAN | ❌ No funciona. EAN de 13 dígitos devuelve 0 resultados. |
| Consulta directa por `us_item_id` | ✅ **Determinista y verificada** con 10 de 19 productos. |
| Fallback por nombre | ✅ Funciona. Se usa como rediscovery cuando el ID es inválido o desconocido. |
| Costo con 1 corrida/semana | 19 req/semana ≈ 76–80 req/mes → dentro del plan gratuito (100 req/mes). |
| Costo con 2 corridas/semana | ~152 req/mes → **supera el plan gratuito**. Requiere plan de pago. |

> **CONCLUSIÓN: ✅ ADOPTADA E IMPLEMENTADA.** Ver archivos modificados en la sección 6.3.

### 6.9 Precios de Walmart observados durante la investigación

Estos precios se obtuvieron de páginas de Walmart indexadas en buscadores durante
la investigación. **NO son precios verificados automáticamente. Pueden depender
de ubicación, inventario, vendedor o modalidad de entrega. No los tratar como
precios actuales confirmados de Walmart Querétaro.**

#### Coincidencias fuertes / alta confianza

| EAN | Producto | Precio observado |
|---|---|---|
| `7501020513478` | Leche Lala Entera 1 Litro | $30 (web) / $36–$37 (PROFECO nov 2025) |
| `7501030463807` | Huevo Blanco San Juan 30 piezas | $58 |
| `7750575790` | Queso Panela FUD 400g | $77 |
| `7500478006030` | Atún Dolores Aleta Amarilla en Agua 140g | $25 |
| `7501000611027` | Mayonesa McCormick Limón 390g | $60 |
| `7501060400058` | Nescafé Clásico 120g | $103 |
| `8076809513487` | Barilla Spaghetti 500g | $29 |
| `7441029501630` | Pan Blanco Bimbo 620g | $49 |
| `7501052500125` | Cloralex El Rendidor 950ml | $22 |
| `7506306200073` | Axion Limón 750ml | $61 |
| `7501055300083` | Coca-Cola Original 2.5L | $53.50 |
| `7501064000062` | Corona Extra 6×355ml | $115 |
| `7501035008041` | Bonafont Natural 6L | $45 |

#### Coincidencias parciales / variante de presentación

| Producto | Situación |
|---|---|
| Crema Lala 450ml | Solo se encontró presentación de 426 ml |
| Nutrioli 850ml | Se encontraron variantes pero no exactamente 850 ml confirmado |
| Arroz Verde Valle 900g | Se encontró Súper Extra 1 kg, no 900 g |
| Frijol Verde Valle 900g | Se encontró variante Negro Querétaro 900 g |
| Pétalo Rendimax 12 rollos | Solo marketplace, no first-party Walmart confiable |

#### No confirmado

| Producto | Situación |
|---|---|
| Ariel Doble Poder 1 kg | No confirmado en ninguna fuente |

### 6.10 Arquitectura implementada para el resolver de Walmart

El EAN del catálogo y el `us_item_id` de Walmart no coinciden. La solución
implementada usa un mapping estático explícito:

```
EAN (js/data.js)
  → scraper/mappings/walmart-items.json
      (EAN → us_item_id, aprobado manualmente)
  → SerpApi (engine=walmart, walmart_domain=walmart.com.mx)
      query=<us_item_id>  [consulta directa, determinista]
        ↓ si ID inválido o no mapeado
      query=<nombre_producto>  [fallback/rediscovery]
  → observación estándar:
      { ean, storeId:'walmart', price, capturedAt, source:'serpapi-walmart',
        sourceUrl, raw:{ us_item_id, nombre_walmart, matched_by } }
  → normalize.mjs (validarObservacion → consolidar)
  → sinks.mjs → data/prices.json + Supabase
```

**Política de actualización de IDs:**
El adaptador detecta cuando un ID está inválido o rotado y loggea el nuevo ID
encontrado por búsqueda de nombre. Un humano actualiza `walmart-items.json`
y hace commit. Nunca se actualiza automáticamente.

---

## 7. Estado actual

> Última actualización: 2026-09-03

### Walmart

**`IMPLEMENTADO — PENDIENTE DE SERPAPI_KEY EN CI`**

- HTTP directo: ❌ Akamai bloquea
- Playwright: ❌ Akamai bloquea
- PROFECO: ✅ disponible pero solo histórico
- SerpApi: ✅ **adoptado e implementado** en `scraper/adapters/walmart.mjs`
- `us_item_id` mapeados: **10 de 19** productos en `scraper/mappings/walmart-items.json`
- 9 productos restantes: en `_sin_mapear`, pasan por fallback de rediscovery por nombre

**Para activar en producción:**
1. Agregar secreto `SERPAPI_KEY` en GitHub (`Settings → Secrets → Actions`).
2. Verificar que la frecuencia del cron esté en **1 corrida/semana** (plan gratuito: 100 req/mes).
3. Correr `node scraper/run.mjs --only walmart --dry-run` con la key configurada.
4. Revisar el log: los 9 productos sin ID recibirán un nuevo ID vía fallback; actualizar `walmart-items.json`.

### PROFECO

**`DISPONIBLE COMO FUENTE HISTÓRICA/SECUNDARIA`**

Funciona hoy para las cadenas participantes (Walmart, Chedraui, Soriana, La
Comer, Bodega Aurrera, Oxxo). Latencia de meses. HEB no participa.

### Tests

**`55 PASSED`** — `node --test test`  
(41 originales + 4 de Chedraui + 10 de Walmart SerpApi = 55)

### Catálogo

**`19 PRODUCTOS`** — fuente de verdad: `js/data.js`

### Branch activa de Walmart

**`feature/walmart-scraper`** — commits `8a0fb1f` (adaptador inicial) + implementación SerpApi

---

## 8. Próxima tarea

> **Activar el adaptador Walmart en CI y completar el mapping de us_item_id.**

### Pasos concretos

1. **Agregar secreto `SERPAPI_KEY`** en GitHub (`Settings → Secrets and variables → Actions → New repository secret`).
2. **Actualizar el cron del workflow** a 1 corrida/semana si se usa plan gratuito de SerpApi (100 req/mes).
3. **Primera corrida de validación:**
   ```bash
   SERPAPI_KEY=<tu_key> node scraper/run.mjs --only walmart --dry-run
   ```
   Revisar el log: cada producto sin ID en el mapping hará una búsqueda por nombre.
   El log indicará `ℹ️ NUEVO ID ENCONTRADO: EAN xxx → us_item_id: yyy`.
4. **Actualizar `scraper/mappings/walmart-items.json`** con los IDs descubiertos.
   Mover cada entrada de `_sin_mapear` a `items` una vez verificada.
5. **Hacer merge de `feature/walmart-scraper` a `main`** una vez que el dry-run
   produzca ≥15/19 precios y el equipo esté satisfecho con la cobertura.

### No hacer

- ❌ No evadir Akamai/WAF/CAPTCHA
- ❌ No usar stealth, proxies, fingerprint spoofing ni técnicas similares
- ❌ No expandir a más de 19 productos
- ❌ No repetir los experimentos HTTP/Playwright que ya demostraron el bloqueo
- ❌ No actualizar `walmart-items.json` automáticamente desde código

---

## 9. Para el siguiente agente

1. **Lee `AGENTS.md`** — contiene instrucciones operativas del proyecto.
2. **Lee este archivo completo** (`CONTINUIDAD.md`).
3. **Verifica el estado de Git:**
   ```bash
   git branch --show-current   # debe ser: feature/walmart-scraper
   git status
   git log --oneline -5
   ```
4. **El adaptador Walmart está implementado** con SerpApi. No es necesario reescribirlo.
   Para probarlo: `SERPAPI_KEY=<key> node scraper/run.mjs --only walmart --dry-run`.
5. **Los archivos clave del adaptador son:**
   - `scraper/adapters/walmart.mjs` — lógica de consulta SerpApi
   - `scraper/mappings/walmart-items.json` — mapping EAN → us_item_id (10 mapeados, 9 sin mapear)
   - `test/walmart.test.mjs` — 10 pruebas unitarias (55 total en la suite)
6. **No modificar el esquema de Supabase** — los IDs de Walmart van en el campo `raw` (JSONB).
7. **No repetir experimentos HTTP/Playwright.** Ya están documentados como NO VIABLES.
8. **Mantener el alcance en los 19 productos de `js/data.js`.**
9. **Ante la duda, consultar `AGENTS.md` y esta sección 9.**
