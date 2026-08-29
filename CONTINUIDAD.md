# Continuidad del proyecto

Este documento es para quien tome el proyecto sin haber estado en las
conversaciones previas. Explica **en qué estado está**, **por qué está armado
así** y **qué sigue**.

Si sólo vas a tocar código, lee las secciones 1, 3 y 4. Si vas a tomar
decisiones de producto, lee también la 2.

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
| Catálogo con EAN-13 | ✅ 19 productos |
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

Saltarse eso requeriría rotar identidades, resolver captchas o disfrazar el
tráfico. **El proyecto no hace eso y no debe empezar a hacerlo**: además del
problema legal, un pipeline construido sobre evasión se rompe cada dos semanas
y no se puede mantener.

Si alguien te pide "que jale el scraping de Walmart", la respuesta honesta es
que eso requiere acceso legítimo (programa de afiliados, API oficial, convenio),
no más ingeniería.

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

### 2.5 Este repo fusiona dos ramas que se habían separado

En agosto 2026 el proyecto se bifurcó: EMC-8 (Gotchy, pgarcia-debug) y este fork
reescribieron la app en paralelo desde el mismo commit inicial. **Ya están
fusionados**, tomando de cada lado lo que resolvía mejor el problema:

| Viene de | Qué |
|---|---|
| Este fork | 3 estrategias de optimización, parser con presentaciones, precios separados del código, base de datos, tests, scraper PROFECO, Vercel |
| Upstream | Compra Guiada, handoff al sitio oficial, perfil de entrega, canasta compartible, documentos de planeación (`.planning/`, `specs/`) |

Dos cosas que hay que saber de esa fusión:

- **Upstream había eliminado la compra dividida y la ruta de 2 tiendas** para
  pivotear a "comparar y mandar a comprar en línea". Aquí conviven: el
  optimizador decide *qué* comprar en cada tienda y la guía ayuda a
  *encontrarlo*. Por eso `itemsAsignadosA()` recorre sólo lo que el optimizador
  asignó a esa tienda, no la lista completa.
- **El parser de upstream no tenía la conversión de presentaciones.** En su
  versión `30 huevos` daba 30 carteras y `500g queso panela` daba 0.5 piezas.
  No reintroduzcas su `parseLine`.

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
  data.js             Catálogo de productos y cadenas. Sin precios.
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
  adapters/csv-manual Captura a mano. Única vía para HEB.
  lib/http.mjs        Cliente con ritmo, reintentos y timeout. Sin evasión.
  lib/normalize.mjs   Validación y consolidación por mediana.
  lib/sinks.mjs       Escribe a Supabase y a prices.json.
  mappings/           Empate explícito PROFECO → EAN.

scripts/
  validate-prices.mjs Valida prices.json contra el contrato. Úsalo en CI.
  generate-seed.mjs   Regenera supabase/seed.sql desde js/data.js.

test/                 30 pruebas con node:test, sin dependencias.
docs/despliegue.md    Vercel + Supabase paso a paso.
docs/scraping.md      Todo lo de la sección 2, con más detalle.
```

### Comandos

```bash
npm start                  # servidor local en :8080
npm test                   # 30 pruebas
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

El repositorio de trabajo es **`EMC-8/superprecios-qro`**. El fork
`JETER3/superprecios-qro` sirvió para desarrollar la reescritura y queda como
respaldo; no se trabaja ahí.
