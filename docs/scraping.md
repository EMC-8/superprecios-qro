# Scraping de precios

## Lo que encontré al intentarlo

Antes de escribir el scraper probé si se podía consultar directamente a las
cadenas. **No se puede.** Resultados reales de la prueba:

| Cadena | Respuesta |
|---|---|
| Chedraui | `400 Bad Request! Scripts are not allowed!` |
| Soriana | `403` con página de protección anti-bot |
| HEB | `404` con inyección de script de detección |
| La Comer | `404` (endpoint no público) |

Las cuatro bloquean peticiones automatizadas de forma deliberada. Saltarse eso
significaría rotar identidades, resolver captchas o disfrazar el tráfico:
evasión de detección. **Este proyecto no hace eso**, y no por timidez legal sino
porque un pipeline construido sobre evasión se rompe cada dos semanas y no se
puede mantener.

La respuesta correcta es usar fuentes que sí permiten el uso automatizado.

---

## Las dos fuentes que sí funcionan

### 1. PROFECO — "Quién es Quién en los Precios" ✅ verificado

Datos oficiales del gobierno mexicano, abiertos y publicados explícitamente para
reuso. Verifiqué que funciona descargando y procesando un archivo real.

**Lo bueno**
- Precios reales de sucursales concretas de Santiago de Querétaro.
- Cubre 5 de nuestras 6 cadenas: Bodega Aurrera, Chedraui, Soriana, Wal-mart y
  La Comer.
- Incluye perecederos (carne de res, pollo, chile, tortilla) que nuestro catálogo
  todavía no tiene y que son justo los que más varían de precio.

**Lo que hay que saber**
- **HEB no participa** en el programa. Sus precios sólo pueden entrar por captura
  manual.
- **No trae código de barras.** El empate con nuestro catálogo se hace por marca y
  presentación, con un mapeo explícito (ver abajo).
- **Publicación quincenal y con retraso.** Al momento de escribir esto, lo más
  reciente publicado es de 2025. Sirve como base y para tendencias históricas;
  no como precio de caja de hoy. La app lo dice sola: el badge muestra la
  antigüedad real y avisa cuando pasa de 14 días.
- Cada archivo pesa ~150 MB, por eso el adaptador lo procesa en streaming en
  lugar de cargarlo en memoria.

**Cobertura actual del mapeo:** 8 de nuestros 19 productos. Los otros 11 o no
aparecen en la muestra de Querétaro, o aparecen en otra presentación (la pasta
Barilla está muestreada en 200 g y la nuestra es de 500 g; la Corona en botella
familiar de 940 ml y la nuestra en six de latas). Están documentados uno por uno
en `_sin_mapear` dentro del archivo de mapeo.

### 2. Captura manual ✅ funciona hoy

Un CSV en `scraper/data-manual/`. Es la única vía para HEB y para cualquier SKU
que PROFECO no muestree. Ver `scraper/data-manual/EJEMPLO-heb.csv`.

---

## Por qué el empate es explícito y no automático

PROFECO no publica EAN. Se podría intentar adivinar el empate por similitud de
texto. **No lo hace, a propósito.**

Un precio mal empatado es peor que un precio ausente: el ausente se avisa en la
interfaz y el usuario lo verifica en tienda; el equivocado se ve idéntico a uno
correcto y manda a alguien a cruzar la ciudad por un ahorro que no existe. Toda
la app está construida sobre esa distinción.

Por eso cada empate vive en `scraper/mappings/profeco-queretaro.json` y lo
aprueba una persona:

```json
{
  "ean": "7501045401340",
  "producto": "Atún Dolores en Agua Aleta Amarilla 140g",
  "requiere": ["atun", "dolores", "lata 140 gr", "en agua"],
  "excluye": ["con aceite", "ensalada", "sardina"]
}
```

Se exige que **todos** los términos de `requiere` aparezcan y que **ninguno** de
`excluye` lo haga, sobre el texto normalizado de `producto marca presentacion`.
La regla de oro es que la presentación coincida: 140 g y 74 g no son el mismo
precio.

Para ampliarlo, pide los candidatos que no empataron:

```bash
npm run scrape:sugerencias
```

---

## Uso

```bash
npm run scrape:dry
```

Corre todo sin escribir nada. Úsalo siempre antes de un cambio de mapeo.

```bash
npm run scrape
```

Corre de verdad: escribe el histórico en Supabase (si está configurado) y
reescribe `data/prices.json`.

```bash
node scraper/run.mjs --only manual
```

Sólo un adaptador.

---

## Cómo fluye un precio

```
adaptador  →  validación  →  consolidación  →  Supabase (histórico)
                                            →  data/prices.json (vigente)
```

- **Validación** (`lib/normalize.mjs`): el EAN tiene que existir en el catálogo,
  la tienda tiene que existir, el precio tiene que ser un número positivo y
  razonable. Lo que no cumple se descarta con motivo y se reporta; no se cuela.
- **Consolidación**: PROFECO trae varias sucursales por cadena con precios
  distintos. Se toma la **mediana**, no el promedio ni el mínimo. El promedio se
  desvía con cualquier dato raro; el mínimo promete un precio que el usuario no
  va a encontrar en la sucursal a la que llegue.
- **Escritura**: Supabase guarda cada observación (nada se pisa, todo queda para
  graficar tendencias). `data/prices.json` guarda sólo el estado vigente, que es
  lo que la PWA precachea para funcionar sin señal.

`escribirPricesJson` **conserva** los precios de las tiendas que la corrida no
tocó, para que un adaptador que sólo cubre 5 cadenas no borre la sexta.

---

## Buenos modales del cliente HTTP

`lib/http.mjs` impone intervalo mínimo entre peticiones al mismo host, reintentos
con espera creciente sólo en errores transitorios, timeout duro y User-Agent
identificable con URL de contacto.

No incluye rotación de identidad, proxies ni resolución de captchas, y no debe
incluirlos. Si un sitio dice que no, la respuesta es buscar una fuente legítima.

---

## Agregar una cadena o fuente nueva

Un adaptador es un módulo que exporta:

```js
export const adaptador = {
  id: 'mi-fuente',
  nombre: 'Nombre legible',
  automatizable: true,
  cadenas: ['walmart'],
  async obtenerPrecios({ log }) {
    return {
      observaciones: [{
        ean: '7501020513478',
        storeId: 'walmart',
        price: 29.90,
        capturedAt: new Date().toISOString(),
        source: 'mi-fuente',
        sourceUrl: 'https://...',
        raw: {}
      }],
      sugerencias: [],
      meta: {}
    };
  }
};
```

Regístralo en el arreglo `ADAPTADORES` de `scraper/run.mjs`. El resto del
pipeline (validación, consolidación, escritura, bitácora) ya está hecho.

---

## Caminos que valen la pena explorar

1. **Colaborativo dentro de la tienda.** La app ya tiene el Modo Súper y el
   catálogo indexado por EAN-13. Agregar un escáner de código de barras y un
   campo de precio convierte a cada usuario en una fuente. Es la vía que más
   escala y la única que da precios del día.
2. **Tickets con OCR.** El ticket trae precio real pagado, tienda y fecha. Es el
   dato de mayor calidad posible.
3. **Programas de afiliados o APIs oficiales.** Walmart México tiene programa de
   afiliados; vale la pena preguntar por acceso legítimo a datos.
4. **INEGI / Banxico.** Publican índices de precios que no dan el precio por
   tienda, pero sirven para detectar cuándo un dato guardado ya quedó fuera de
   rango.
