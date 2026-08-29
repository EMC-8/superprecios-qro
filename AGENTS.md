# Instrucciones para agentes

Contexto operativo para un agente de código que trabaje en este repositorio.
Léelo completo antes de tu primer cambio. No duplica el README: aquí está lo que
te va a morder si no lo sabes.

---

## Orden de lectura (5 minutos)

1. **`README.md`** — qué hace el producto y el modelo mental (catálogo y precios
   separados, la cadena de tres fuentes de precio, el flujo de datos).
2. **`CONTINUIDAD.md`** — las decisiones con su porqué. La sección 2 explica por
   qué las cosas están como están; sin eso vas a "arreglar" cosas que están bien
   a propósito.
3. **`js/optimizer.js` y `js/parser.js`** — el corazón. Son puros, sin DOM.

No leas todo `js/app.js` de entrada (1,300+ líneas). Búscale la función que
necesites.

---

## Antes de tocar nada

```bash
npm test
```

**41 pruebas deben pasar.** Si algo falla en un repo limpio, para y averigua por
qué antes de escribir código.

---

## Reglas duras

Romper cualquiera de estas rompe el producto de forma silenciosa. Están
cubiertas por pruebas: **si una prueba falla por tu cambio, asume que el cambio
está mal, no la prueba.** Si de verdad la prueba está mal, di explícitamente por
qué antes de modificarla.

### Datos

- **Un precio ausente NO vale cero.** Significa "no se sabe". Tratarlo como cero
  hace ver baratísima a la tienda con menos datos.
- **No metas precios en `js/data.js`.** Ese archivo dice QUÉ existe; los precios
  viven en `data/prices.json` y se resuelven por EAN al vuelo.
- **`supabase/seed.sql` es generado.** No lo edites: corre `npm run seed`.
- **Los precios estimados se marcan con `≈`** y nunca se presentan como reales.

### Seguridad

- **Todo nombre que pintes pasa por `escaparHtml()`** (`js/app.js`). La canasta
  compartible acepta contenido de terceros por URL: el nombre de un producto
  personalizado lo escribe quien arma el enlace, no quien lo abre. Hay una
  prueba que lo verifica con `<img src=x onerror=...>`.
- **La `service_role` key de Supabase nunca entra al repo ni al cliente.** Sólo
  vive en secretos de CI. La *publishable key* sí va commiteada, es pública por
  diseño.

### Scraping

- **No construyas evasión de detección.** Las cadenas bloquean peticiones
  automatizadas y eso está documentado en `docs/scraping.md`. Rotar identidades,
  resolver captchas o disfrazar tráfico está fuera de alcance: además del
  problema legal, un pipeline así se rompe cada dos semanas.
- **El empate PROFECO → EAN es explícito y lo aprueba una persona**
  (`scraper/mappings/`). No lo automatices con similitud difusa: un precio mal
  empatado es peor que uno ausente, porque el ausente se avisa en la interfaz y
  el equivocado manda a alguien a cruzar la ciudad por un ahorro que no existe.

---

## Trampas de este repositorio

Cosas que parecen inofensivas y no lo son:

| Si cambias… | Tienes que… |
|---|---|
| La forma de los ítems de la lista | Subir la versión de `STORAGE_KEY` / `CHECKED_KEY` en `js/app.js`, o las listas guardadas se mostrarán mal |
| La lista de precache en `sw.js` | Subir `CACHE_NAME` (`superprecios-qro-vN`), o los usuarios seguirán con el caché viejo |
| El catálogo en `js/data.js` | Correr `npm run seed` y aplicar el seed de nuevo |
| Las `searchUrl` de las cadenas | Verificar que `npm run seed` no deforme el marcador `{query}` — HEB normaliza a slug |
| Cualquier render que muestre nombres | Aplicar `escaparHtml()` |

Además:

- **`npm run scrape` descarga ~150 MB** del CSV de PROFECO. Usa `npm run
  scrape:dry` mientras iteras.
- **La app debe servirse por HTTP.** Abrir `index.html` como archivo no funciona:
  los módulos ES y el Service Worker requieren origen `http(s)`.
- **No agregues dependencias.** El proyecto es vanilla a propósito: sin build,
  desplegable en cualquier hosting estático. Si crees que hace falta una, di por
  qué antes de instalarla.

---

## Cómo verificar tu trabajo

```bash
npm test                    # 41 pruebas
npm run validate:prices     # el contrato de data/prices.json
npm start                   # y revisa en el navegador
```

En el navegador, un cambio no está verificado hasta que compruebas:

- Las 5 pestañas cargan sin errores en consola.
- *Ahorro & Ruta* da un total y las 3 estrategias producen resultados distintos
  y coherentes (más tiendas = más barato).
- Un botón "Comprar en sitio oficial" abre la guía **con sólo los productos de
  esa tienda**.

Si tocaste el optimizador o el parser, agrega una prueba. Los dos son puros y no
necesitan DOM, así que no hay excusa.

---

## Qué está pendiente

Todo lo inmediato es infraestructura y no requiere código:

1. **Supabase** — migraciones y seed listos en `supabase/`. Bloqueo: la
   organización está en su límite de proyectos gratuitos.
2. **Vercel** — requiere instalar la GitHub App de Vercel en la organización
   antes de importar el proyecto.
3. **Secretos de CI** para el workflow de precios.

Procedimiento en `docs/despliegue.md`.

### Trabajo de producto, por impacto

1. **Ampliar el catálogo a perecederos** (carne, pollo, verdura). Son los que más
   varían de precio, hoy caen en "precio estimado", y PROFECO **sí** los trae.
   Ojo: se venden por peso y el catálogo asume presentaciones empaquetadas —
   revisa `pack` en `js/data.js` y la conversión en `parser.js`.
2. **Escáner de código de barras.** El catálogo ya está indexado por EAN-13 y
   existe el Modo Supermercado. Es la única vía realista a precios del día.
3. **Ampliar el mapeo de PROFECO**: `npm run scrape:sugerencias` lista candidatos.
   Sólo mapea cuando la presentación coincida.

### Rama sin integrar

`feature/price-scraper` tiene otro scraper (Python, JSON-LD sobre páginas de
producto) que ocupa el mismo directorio `scraper/` que el actual. **No la
fusiones por tu cuenta**: son enfoques distintos y la decisión es del equipo.

---

## Cómo reportar

Di lo que verificaste y lo que no. Si una prueba falla, muestra la salida. Si
dejaste algo fuera, dilo explícitamente en vez de omitirlo. Este proyecto entero
está construido sobre la idea de que un dato ausente y honesto vale más que uno
presente y equivocado; aplica igual a tus reportes.
