# Guía de Integración de una Nueva Tienda o Fuente de Precios

Esta guía documenta el procedimiento estándar, reproducible y sostenible para integrar una nueva cadena de supermercados o fuente de datos de precios en **SuperPrecios QRO**.

Toda la metodología descrita surge del proceso real seguido al investigar, descartar caminos no viables e implementar la integración de **Walmart México** mediante SerpApi, abstrayendo cada fase para que cualquier colaborador pueda aplicarla a futuras tiendas (Soriana, HEB, La Comer, Chedraui directo, etc.).

---

## 1. Propósito de la guía

### ¿Qué problema resuelve?
SuperPrecios QRO necesita mantener observaciones de precios vigentes y confiables de los supermercados de Querétaro sin comprometer la estabilidad legal o técnica del proyecto, y sin introducir datos erróneos en la canasta del usuario.

### ¿Qué significa "integrar una tienda"?
Integrar una tienda no consiste en escribir un script de scraping rápido que extraiga HTML. Significa:
1. Identificar una **fuente legítima, accesible y sostenible** (oficial, abierta, API o intermediario).
2. Construir un **mecanismo de correspondencia determinista** entre el catálogo canónico del proyecto (EAN-13) y los identificadores internos de la tienda.
3. Aplicar un **criterio de matching estricto** que prefiera descartar un precio antes que asociar una variante incorrecta.
4. Desarrollar un **adaptador modular desacoplado** que cumpla con el contrato común de observaciones del pipeline.
5. Garantizar **pruebas automatizadas offline** (sin consumir cuotas ni depender de red externa en CI).
6. Configurar la ejecución controlada en GitHub Actions protegiendo secretos y cuotas.

### ¿Qué debe producir un adaptador?
Un adaptador debe producir exclusivamente un objeto con:
- `observaciones`: lista de objetos de precio normalizados según el contrato del proyecto.
- `sugerencias`: lista de productos no encontrados o no mapeados para auditoría humana.
- `meta`: telemetría de la corrida (total objetivo, con precio, sin precio, peticiones realizadas, etc.).

### Desacoplamiento arquitectónico
El adaptador **no** debe conocer la base de datos (Supabase), **no** debe escribir archivos en disco, **no** debe modificar la interfaz de usuario (PWA) y **no** debe auto-modificar los catálogos ni mappings. Su única responsabilidad es extraer datos de la fuente externa y proyectarlos al contrato canónico.

```text
┌──────────────────────────────────────┐
│       Catálogo Canónico EAN-13       │
│             (js/data.js)             │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│      Adaptador de Tienda/Fuente      │
│   (scraper/adapters/<tienda>.mjs)    │
│  - Consulta fuente legítima          │
│  - Mapeo y matching estricto         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│      Observaciones Normalizadas      │
│         (Contrato Común)             │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          Pipeline Existente          │
│          (scraper/run.mjs)           │
│  - Validación (normalize.mjs)        │
│  - Consolidación (mediana)           │
└──────────────────┬───────────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
┌─────────────────┐ ┌──────────────────┐
│    Supabase     │ │ data/prices.json │
│   (Histórico)   │ │ (Estado vigente  │
│                 │ │    para PWA)     │
└─────────────────┘ └──────────────────┘
```

---

## 2. Arquitectura del proyecto

Para integrar código correctamente es indispensable conocer la función exacta de cada pieza del repositorio:

| Archivo / Directorio | Responsabilidad arquitectónica |
|---|---|
| `js/data.js` | **Fuente única de verdad del catálogo.** Define los 19 productos canónicos (`PRODUCTS_CATALOG`) con su EAN-13 oficial, nombre, marca, categoría y las 6 cadenas soportadas (`SUPERMARKETS`). |
| `data/prices.json` | **Snapshot de precios vigentes** precacheado por el Service Worker de la PWA. Permite que la aplicación web funcione sin conexión dentro del supermercado. |
| `scraper/adapters/` | Directorio de adaptadores independientes (`profeco.mjs`, `chedraui.mjs`, `csv-manual.mjs`, `walmart.mjs`). Cada adaptador interactúa con una fuente externa específica. |
| `scraper/mappings/` | Diccionarios estáticos explícitos aprobados por humanos (`profeco-queretaro.json`, `chedraui.json`, `walmart-items.json`) que relacionan EANs canónicos con IDs o términos de búsqueda de tiendas. |
| `scraper/run.mjs` | **Orquestador central.** Carga los adaptadores seleccionados, ejecuta la recolección, filtra mediante validación estricta, consolida observaciones repetidas y coordina los destinos de salida. |
| `scraper/lib/normalize.mjs` | Utilidades de normalización de cadenas (`normalizar`), validación del contrato (`validarObservacion`) y consolidación estadística por mediana (`consolidar`). |
| `scraper/lib/sinks.mjs` | Controladores de persistencia: `escribirPricesJson` (actualiza `data/prices.json` respetando datos de tiendas no tocadas) y `escribirSupabase` (inserta lotes en la tabla `price_observations`). |
| `test/` | Suites de pruebas unitarias y de integración (`optimizer`, `parser`, `checkout`, `chedraui`, `walmart`). |
| `test/runner.mjs` | Runner centralizado secuencial de Node.js que ejecuta todas las suites evitando condiciones de carrera de concurrencia en Windows. |
| `.github/workflows/` | Automatización CI/CD (`actualizar-precios.yml`), encargada de correr pruebas, ejecutar scrapers programados y commitear precios actualizados. |
| **Supabase** | Base de datos PostgreSQL externa que almacena el histórico inmutable de observaciones (`price_observations`) y auditoría de ejecuciones (`scrape_runs`). |

### Catálogo de productos vs Observaciones de precios
- **Catálogo de productos (`js/data.js`):** Lista estática canónica de bienes de consumo esenciales. Cada producto posee un identificador global único **EAN-13** (código de barras).
- **Observaciones de precios:** Mediciones puntuales de cuánto cuesta un producto en una tienda o sucursal en un instante de tiempo (`capturedAt`).
- **El EAN es el identificador canónico.** Las tiendas internas rara vez indexan sus APIs públicas por EAN directo; suelen utilizar códigos propietarios (`us_item_id`, SKUs, códigos de departamento, slugs de URL). El adaptador y su mapping son el puente entre el EAN canónico y el ID propietario de la tienda.

---

## 3. Investigación previa antes de programar

**REGLA FUNDAMENTAL:** Nunca comiences escribiendo código de scraping. La programación es el último paso; primero se debe investigar la viabilidad técnica, legal y económica de la fuente.

### Árbol de decisión para seleccionar una fuente

```text
                     ¿Existe API oficial o programa de afiliados?
                                       │
                      ┌────────────────┴────────────────┐
                     SÍ                                 NO
                      │                                 │
            Evaluar términos, API key,         ¿Existe feed de datos abiertos
             endpoints y documentación            o convenio institucional?
                      │                                 │
                      │                        ┌────────┴────────┐
                      │                       SÍ                 NO
                      │                        │                 │
                      │               Evaluar frescura,    ¿Existe proveedor o API
                      │                cobertura y formato  comercial intermediaria?
                      │                        │          (ej. SerpApi)
                      │                        │                 │
                      │                        │        ┌────────┴────────┐
                      │                        │       SÍ                 NO
                      │                        │        │                 │
                      │                        │   Evaluar costo,   ¿Acceso directo HTTP
                      │                        │   cuota y SLA       permitido y estable?
                      │                        │        │          (robots.txt, sin WAF)
                      │                        │        │                 │
                      │                        │        │        ┌────────┴────────┐
                      │                        │        │       SÍ                 NO
                      │                        │        │        │                 │
                      ▼                        ▼        ▼        ▼                 ▼
             ┌─────────────────────────────────────────────────────┐      Buscar otra fuente
             │        ¿Cumple con criterios de estabilidad,        │       o captura manual
             │           costo y legalidad a largo plazo?          │
             └─────────────────────────┬───────────────────────────┘
                                       │
                      ┌────────────────┴────────────────┐
                     SÍ                                 NO
                      │                                 │
                      ▼                                 ▼
             Proceder al diseño                Buscar fuente alterna
               del adaptador                     o captura manual
```

### Qué investigar obligatoriamente
1. **API oficial:** ¿Existe documentación para desarrolladores? ¿Requiere contrato B2B o aprobación manual?
2. **Feeds y datos abiertos:** ¿Existen programas gubernamentales (ej. PROFECO QQP) o catálogos abiertos?
3. **Endpoints públicos:** ¿La app móvil o web consulta endpoints JSON no protegidos que permitan consumo automatizado legítimo?
4. **Comportamiento HTML:** ¿El HTML se genera en servidor (SSR) o depende enteramente de JavaScript en el cliente (CSR / SPA)?
5. **Proveedores externos:** ¿Existen agregadores autorizados o APIs estructuradas de búsqueda?
6. **Límites de peticiones (Rate Limits) y cuotas:** ¿Cuántas peticiones gratuitas o por dólar permite? ¿Con qué frecuencia bloquearía la IP?
7. **Costos recurrentes:** ¿Es financieramente sostenible para el proyecto a lo largo de meses?
8. **Cobertura geográfica:** ¿Los datos corresponden a México y específicamente a Querétaro (`76000`), o son precios genéricos nacionales / de EE.UU.?
9. **Disponibilidad por sucursal:** ¿Identifica la sucursal física concreta (ej. Juriquilla, Plaza de Toros) o es el precio general de comercio electrónico nacional?

---

## 4. Documentar los intentos que hicimos

En el desarrollo de SuperPrecios QRO no adoptamos la solución final de inmediato. Se investigaron sistemáticamente múltiples vías y se documentaron los fallos. Cualquier colaborador debe conocer este historial para no repetir caminos estériles.

### HTML / HTTP directo
Se probó consultar directamente los servidores web de las principales cadenas mediante peticiones HTTP estándar (`fetch` / `node-fetch`). Los resultados reales obtenidos fueron:

| Cadena | Respuesta observada | Causa técnica |
|---|---|---|
| **Chedraui** | `400 Bad Request! Scripts are not allowed!` | Servidor configurado para rechazar User-Agents automatizados o peticiones sin cabeceras completas de navegador. |
| **Soriana** | `403 Forbidden` | Bloqueo perimetral por solución de protección anti-bot. |
| **HEB** | `404 Not Found` con script inyectado | Detección activa de clientes no interactivos y desvío de tráfico. |
| **La Comer** | `404 Not Found` | Endpoints internos privados, no expuestos públicamente. |
| **Walmart México** | `307 Temporary Redirect` → `/blocked` | Akamai Bot Manager intercepta la conexión y redirige a pantalla de bloqueo. |

### Diagnóstico con Playwright (Navegador real)
Para determinar si el bloqueo se debía únicamente a cabeceras HTTP faltantes o a análisis conductual y de huella digital (fingerprinting), se realizó una prueba de diagnóstico con Playwright (navegador Chromium real con renderizado de JavaScript) evaluando el producto `7501020513478` (Leche Lala Entera 1L):
- Búsqueda por EAN directo: bloqueada.
- Búsqueda por texto `"leche lala entera 1 litro"`: bloqueada.

**Resultado:** Walmart redirigió inmediatamente a una pantalla interactiva con el mensaje **"Verifica tu identidad"** (desafío Akamai Bot Manager).

**Conclusión técnica:** Playwright sirve como herramienta de *diagnóstico* para confirmar el tipo de protección que utiliza un sitio, pero **no debe utilizarse como scraper en producción** cuando el sitio exige interacción humana activa.

### Decisión de NO evadir anti-bot: "Qué NO hacer"

> [!CAUTION]
> **PROHIBICIÓN ARQUITECTÓNICA PERMANENTE**
> Está estrictamente prohibido en este proyecto implementar cualquier mecanismo destinado a burlar barreras tecnológicas de acceso:
> - ❌ Servicios de resolución de CAPTCHAs (2Captcha, Anti-Captcha, etc.).
> - ❌ Navegadores con parches de sigilo (*stealth browsers*, `puppeteer-extra-plugin-stealth`, etc.).
> - ❌ Suplantación de huella digital de navegador (*fingerprint spoofing*).
> - ❌ Redes de proxies residenciales o móviles rotativos para evadir bloqueos de IP.
> - ❌ Manipulación de cabeceras TLS/JA3 o técnicas de evasión de WAF / Akamai / Cloudflare / DataDome.
> - ❌ Ocultamiento deliberado de la naturaleza automatizada del cliente.

**Justificación:** Un sistema basado en evasión anti-bot:
1. Es frágil y se rompe ante cualquier actualización del proveedor de seguridad.
2. Incurre en costos elevados de mantenimiento y de proxies.
3. Viola los Términos de Servicio de los comercios y entra en zonas legalmente grises.
4. Genera una carga indebida en la infraestructura de las tiendas.

Cuando el acceso directo está protegido por un sistema anti-bot activo, **la respuesta correcta es detenerse y buscar una fuente legítima alternativa** (datos abiertos, APIs comerciales o captura manual colaborativa).

---

## 5. Caso de estudio: Walmart México

El proceso que llevó a integrar Walmart México es el modelo canónico del flujo de investigación:

```text
Intentar acceso HTTP directo a walmart.com.mx
                   │
                   ▼
  Bloqueado (HTTP 307 redirect a /blocked)
                   │
                   ▼
     Diagnóstico con Playwright Chromium
                   │
                   ▼
 Protección Akamai detectada ("Verifica tu identidad")
                   │
                   ▼
   Decisión firme: NO EVADIR PROTECCIONES
                   │
                   ▼
   Investigación de fuentes alternativas
     ├── PROFECO QQP (Válido pero retraso de meses; no apto para precio actual)
     └── SerpApi Walmart Search API (API estructurada de terceros)
                   │
                   ▼
  Selección de SerpApi como intermediario legítimo
                   │
                   ▼
    Integración consulta serpapi.com (no walmart.com.mx)
```

### Puntos clave del caso Walmart:
1. **El cliente nunca toca Walmart:** El adaptador hace peticiones HTTPS a `https://serpapi.com/search.json`. SerpApi gestiona el parsing y el acceso en su infraestructura.
2. **SerpApi es una solución específica para Walmart México:** No asumas que la siguiente tienda requerirá SerpApi. Si otra tienda (ej. Chedraui o Soriana) ofrece un catálogo abierto, una API para desarrolladores o un feed oficial de precios, esa debe ser la vía a implementar.

---

## 6. Cómo evaluar una fuente alternativa

Antes de comprometerte con un proveedor o fuente externa, evalúala usando la siguiente matriz de control:

| Criterio | Pregunta de validación | Estado deseado |
|---|---|---|
| **Legitimidad** | ¿El proveedor opera lícitamente bajo términos comerciales claros? | Términos de servicio públicos y transparentes. |
| **Estabilidad** | ¿La interfaz cambia frecuentemente o expone un contrato versionado? | JSON estructurado / API versionada (v1, v2). |
| **Cobertura geográfica** | ¿Permite consultar el dominio o código postal de México (`76000`)? | Parámetros específicos para México (`walmart.com.mx`, `gl=mx`). |
| **Frescura** | ¿Con qué frecuencia se actualizan los datos devueltos? | Datos del día o con menos de 48 horas de antigüedad. |
| **Identificación** | ¿Permite buscar por identificador único (EAN, SKU, Item ID)? | Búsqueda por ID directo sin ambigüedad. |
| **Sucursales** | ¿Ofrece granularidad por tienda física o es un precio online consolidado? | Identificado explícitamente en el contrato (`branch_id` o general). |
| **Costo / Cuota** | ¿El costo encaja dentro del presupuesto del proyecto en GitHub Actions? | Predecible y auditable antes de ejecutar. |
| **Rate Limits** | ¿Permite pausas razonables entre consultas sin bloqueos intempestivos? | Pausa controlada (ej. `1200ms`) sin saturación. |
| **Compatibilidad CI** | ¿Funciona en los contenedores Ubuntu de GitHub Actions? | Petición HTTPS estándar basada en Node.js nativo. |
| **Mantenibilidad** | ¿Si la tienda rediseña su sitio web, nuestro adaptador se rompe? | Aislado por el intermediario o por el formato estructurado. |

---

## 7. Costo y cuota

Toda fuente con límite de uso o costo por petición debe proyectarse matemáticamente antes de ser activada en producción.

### Fórmula de estimación mensual

$$\text{Peticiones por ejecución} \times \text{Ejecuciones por semana} \times \text{Semanas por mes} = \text{Peticiones mensuales}$$

### Ejemplo de cálculo: Walmart (SerpApi)
- Catálogo: 19 productos canónicos.
- En el mejor escenario (100% de productos con ID directo mapeado): $19 \text{ peticiones por corrida}$.
- Si 9 productos requieren fallback por nombre porque su ID falló o no existe: hasta $19 + 9 = 28 \text{ peticiones por corrida}$.

| Frecuencia | Peticiones semanales (19 directas) | Peticiones mensuales (~4.33 semanas) | Impacto de cuota |
|---|---|---|---|
| 1 vez por semana | 19 req/sem | ~82 req/mes | Entra en el plan gratuito típico (100 req/mes). |
| 3 veces por semana (L, M, V) | 57 req/sem | ~247 req/mes | **Supera el plan gratuito.** Requiere plan de pago. |

> [!IMPORTANT]
> **Verificación de precios vigentes:**
> No asumas precios fijos de suscripciones. Siempre consulta la documentación y tarifas oficiales vigentes del proveedor antes de alterar la frecuencia del cron.
> 
> Además, ten presente que los **fallbacks aumentan el consumo**: si una petición por ID falla y el sistema dispara una búsqueda por nombre para recuperar el producto, esa consulta cuenta como una petición adicional contra la cuota.

---

## 8. Identificación de productos

En el comercio minorista conviven múltiples identificadores. Comprender sus diferencias evita cruces de datos catastróficos:

```text
                     ┌────────────────────────────────────────┐
                     │          EAN-13 (Canónico)             │
                     │           7501020513478                │
                     │    Leche Lala Entera Pasteurizada 1L   │
                     └──────────────────┬─────────────────────┘
                                        │
                                        ▼ Mapeo estático verificado
                     ┌────────────────────────────────────────┐
                     │       Identificador de Tienda          │
                     │  Walmart us_item_id: "00750102056593"  │
                     │  Chedraui SKU:       "3021458"         │
                     │  Soriana Código:     "11223344"        │
                     └────────────────────────────────────────┘
```

- **EAN (European Article Number / GTIN-13):** Código de barras canónico impreso en el empaque del fabricante. Es el identificador universal del catálogo en `js/data.js`.
- **SKU (Stock Keeping Unit):** Código interno que cada minorista asigna a un artículo en su catálogo e inventario.
- **Product ID / Item ID (ej. `us_item_id` en Walmart):** Identificador utilizado por la plataforma web o API para localizar un producto. Puede variar con el tiempo o diferir entre presentaciones.
- **Offer ID:** Identificador de una oferta mercantil específica (un mismo producto puede tener ofertas de distintos vendedores en marketplace).
- **URL Slug:** Segmento legible por humanos en la dirección web del producto.
- **Nombre + Presentación:** Descripción textual completa (ej. `"Atún Dolores en Agua Aleta Amarilla 140g"`). Es la última línea de defensa cuando no se dispone de un ID estable.

---

## 9. Mappings

El directorio `scraper/mappings/` almacena la correspondencia explícita entre el catálogo general y los sistemas propietarios de cada tienda.

### ¿Por qué existe un archivo de mapping?
Porque consultar una API de tienda mediante texto libre en cada corrida genera respuestas ambiguas, variaciones de empaque y falsos positivos. Almacenar un identificador validado convierte la consulta en una operación determinista.

### Ejemplo conceptual (`scraper/mappings/walmart-items.json`):
```json
{
  "items": [
    {
      "ean": "7501020513478",
      "nombre": "Leche Lala Entera 1 Litro",
      "us_item_id": "00750102056593",
      "match_type": "name_verified",
      "notas": "Validado 2026-09-03. Consulta directa por ID confirmada."
    }
  ],
  "_sin_mapear": [
    {
      "ean": "7501020521015",
      "nombre": "Crema Ácida Lala 450ml",
      "motivo": "Solo se encontró presentación de 426ml en SerpApi durante matching."
    }
  ]
}
```

### Reglas obligatorias para mappings:
1. **Regla de oro:** Un ID descubierto automáticamente durante una corrida **NUNCA debe escribirse de forma automática en el archivo de mapping**. El adaptador debe emitir un log detallado para que un humano verifique el producto y actualice el mapping manualmente en un commit dedicado.
2. **Documentación de faltantes:** Todo producto del catálogo que no posea un ID confiable debe registrarse en la sección `_sin_mapear`, especificando con claridad el motivo (presentación incompatible, solo marketplace, producto no listado, etc.).
3. **Validación de campos:** El campo `match_type` debe registrar cómo se validó (`ean_match`, `name_verified`, `manual_audit`).

---

## 10. Matching estricto

> [!IMPORTANT]
> **PRINCIPIO CARDINAL DEL PROYECTO**
> **Es preferible un precio ausente a un precio incorrecto.**
> 
> Un precio ausente genera una advertencia honesta en la interfaz y el usuario sabe que debe comprobarlo en el pasillo. Un precio incorrecto aparenta ser válido y engaña al consumidor, haciéndolo desplazarse a una tienda lejana por un ahorro ficticio.

Cuando un adaptador no puede consultar por ID exacto y debe procesar resultados de búsqueda, debe aplicar un filtro implacable:

```text
Leche Entera        ≠   Leche Deslactosada / Light / Semidescremada
Arroz 900 g         ≠   Arroz 1 kg
Crema 450 ml        ≠   Crema 426 ml
Coca-Cola 2.5 L     ≠   Coca-Cola 3 L
Corona 6-pack latas ≠   Corona 1 botella individual o mega 940 ml
Huevo 30 piezas     ≠   Huevo 12 o 18 piezas
Café Clásico        ≠   Café Descafeinado
Atún en Agua        ≠   Atún en Aceite / Ensalada
```

### Variantes que deben ser rechazadas sistemáticamente si contradicen el catálogo:
- `light`
- `deslactosada`
- `descremada` / `semidescremada`
- `descafeinado` / `decaf`
- `sin azucar` / `zero` / `cero`
- `premium`
- `integral`
- `con aceite` vs `en agua`

### Reglas de rechazo de cantidades y multipacks:
- Si el catálogo solicita **pieza individual**, rechazar títulos que indiquen `pack`, `paquete`, `piezas`, `c/u`, `dupack`, `tripack`, `ahorro pack`.
- Si el título del resultado incluye un gramaje o volumen numérico distinto al del catálogo (ej. 426 ml vs 450 ml; 1 kg vs 900 g), **debe rechazarse inmediatamente**.

---

## 11. Productos no encontrados

No recibir un resultado de precio en una corrida puede deberse a diversas razones:
1. **Falta de inventario temporal:** El producto se agotó en bodega.
2. **Cambio de ID interno:** El minorista reemplazó el SKU por una nueva presentación.
3. **Modificación del título:** Cambiaron las palabras clave en la plataforma web.
4. **Falla temporal de red o cuota del proveedor.**
5. **Retiro real del mercado:** El fabricante descontinuó el producto.

> [!WARNING]
> **REGLA DE CONSERVACIÓN:**
> **Nunca interpretes "producto no encontrado" como "producto descontinuado".**
> 
> El adaptador jamás debe eliminar un producto de `js/data.js` ni borrar precios históricos de Supabase o de `data/prices.json`. El pipeline consolidará manteniendo la última observación válida o indicará que la tienda carece de dato vigente en esa corrida.

---

## 12. Rotación de IDs (Lección real de Walmart)

Durante la integración de Walmart se detectó un caso real:
- **Producto:** Pan Blanco Bimbo Grande 620g (EAN `7501000111204`).
- **ID anterior:** `00750100011120` (dejó de responder en la API).
- **ID nuevo:** `00750081002918`.

Para gestionar este fenómeno sin romper el sistema, el adaptador implementa el siguiente flujo:

```text
                  Consultar por us_item_id conocido del mapping
                                        │
                       ┌────────────────┴────────────────┐
                 Coincide y válido                  Inválido o 404
                       │                                 │
                       ▼                                 ▼
             Emitir observación                Disparar fallback
                                               por nombre de producto
                                                         │
                                                         ▼
                                               Aplicar matching estricto
                                               (marca + presentación exacta)
                                                         │
                                        ┌────────────────┴────────────────┐
                                   Match plausible                  Sin coincidencia
                                        │                                 │
                                        ▼                                 ▼
                               Extraer nuevo ID                  Registrar en sugerencias
                               y emitir precio                   como no encontrado
                                        │
                                        ▼
                             Imprimir log de auditoría:
                       "NUEVO ID ENCONTRADO: ... (revisión humana)"
                                        │
                                        ▼
                         Un humano valida en el navegador
                         y actualiza el mapping en un PR
```

---

## 13. Diseño de un adaptador

Todo adaptador nuevo debe residir en su propio módulo: `scraper/adapters/<tienda>.mjs`.

### Responsabilidades del adaptador:
- Cargar sus mappings específicos desde `scraper/mappings/`.
- Consultar la fuente externa autorizada (respetando pausas entre peticiones).
- Parsear y sanitizar la respuesta de la fuente.
- Realizar el matching estricto de productos.
- Devolver observaciones ajustadas al contrato general.
- Reportar sugerencias y telemetría de la ejecución.

### Qué NO debe hacer el adaptador:
- ❌ No alterar `js/data.js` ni `data/prices.json`.
- ❌ No conectarse a Supabase ni ejecutar consultas SQL.
- ❌ No escribir en disco ni modificar automáticamente archivos JSON de mapeo.
- ❌ No duplicar código de cálculo de medianas ni filtrado general (eso pertenece a `normalize.mjs`).
- ❌ No almacenar credenciales, API keys ni secretos en su código fuente.

---

## 14. Contrato de observaciones

Para que el orquestador (`scraper/run.mjs`) y los sinks (`scraper/lib/sinks.mjs`) procesen los datos sin errores, cada elemento del arreglo `observaciones` debe cumplir esta estructura exacta:

```javascript
{
  ean: '7501020513478',                     // string (13 dígitos): debe existir en js/data.js
  storeId: 'walmart',                       // string: debe ser una de las claves de SUPERMARKETS en js/data.js
  price: 29.50,                             // number: positivo, con decimales (0 < price <= 100000)
  capturedAt: '2026-09-03T12:00:00.000Z',    // string ISO 8601: timestamp lógico de captura
  source: 'serpapi-walmart',                // string: identificador de la fuente
  sourceUrl: 'https://www.walmart.com.mx/ip/...', // string o null: URL de auditoría de la fuente
  raw: {                                    // object: metadatos crudos para auditoría
    // Campos específicos de la fuente (ejemplo Walmart)
    us_item_id: '00750102056593',
    product_id: '3JFLM2Y98T1G',
    offer_id: '77CFAEB4001',
    seller: 'Walmart',
    matched_by: 'direct_id',
    serpapi_query: '00750102056593'
  }
}
```

### Significado del campo `raw`:
El objeto `raw` almacena los metadatos específicos del origen. Permite auditar en Supabase el vendedor del marketplace (`seller`), el identificador utilizado en la consulta (`serpapi_query`), y el método por el cual se asoció (`direct_id` o `name_fallback`). **Cada tienda tendrá propiedades distintas dentro de `raw`**, y eso es completamente válido.

---

## 15. Sucursales físicas vs Precios en línea

En SuperPrecios QRO existe el concepto de sucursales físicas (ej. Soriana Hiper Plaza del Parque, Walmart Bernardo Quintana).

> [!CAUTION]
> **REGLA SOBRE SUCURSALES:**
> **Nunca inventes una sucursal.**
> Si la fuente de datos proporciona precios generales de comercio electrónico o catálogo nacional (`walmart.com.mx`), **no debes asignar artificialmente un `branch_id` de Querétaro**. Deja el campo ausente u omitido.

| Tipo de precio | Cuándo aplica | Tratamiento en el contrato |
|---|---|---|
| **Precio por sucursal** | Fuentes como PROFECO QQP o tickets de compra donde un encuestador o cliente estuvo físicamente en una tienda específica. | Se incluye `branch_id` con el ID de la sucursal. |
| **Precio online general** | Tiendas en línea, marketplaces o catálogos web centralizados donde el precio aplica a envíos o recolección general. | Se omite `branch_id`. El sistema lo trata como precio de referencia de la cadena. |
| **Precio regional** | Catálogos web que solicitan código postal (`76000`) pero no discriminan entre sucursales locales. | Se omite `branch_id` y se documenta en notas o metadatos de la corrida. |

---

## 16. Consistencia de marcas temporales (Timestamp)

Todas las observaciones generadas dentro de una misma ejecución del adaptador deben compartir el mismo **timestamp lógico**:

```javascript
const ahora = new Date().toISOString();
```

**Razón técnica:** Una corrida puede tardar de 30 a 60 segundos debido a las pausas entre peticiones (`PAUSA_MS`). Si cada observación tomara `new Date()` al momento de recibir la respuesta, las 19 observaciones tendrían segundos diferentes. Al consolidar datos o auditar corridas en Supabase (`scrape_runs`), tener una estampa de tiempo idéntica permite agrupar la corrida con total exactitud.

---

## 17. Rate limiting y manejo de errores

Los adaptadores deben ser clientes HTTP responsables:
1. **Intervalo entre peticiones:** Incluir un retraso cortés entre consultas (ej. `const PAUSA_MS = 1200; await new Promise(r => setTimeout(r, PAUSA_MS));`).
2. **Timeouts explícitos:** Toda llamada HTTP debe tener un límite de tiempo razonable (ej. 15–30 segundos con `AbortController`).
3. **Manejo de códigos HTTP:**
   - Errores `401 Unauthorized` o `403 Forbidden`: fallar de inmediato con mensaje claro de credencial inválida.
   - Errores `429 Too Many Requests`: detener la ejecución o aplicar backoff exponencial breve; no continuar consumiendo cuota ciegamente.
   - Errores `5xx Server Error`: registrar el fallo del producto específico y continuar con el siguiente.
4. **Respuestas malformadas:** Si el servidor responde con HTML o JSON incompleto, capturar la excepción con `try/catch` y registrar el error en telemetría sin detener abruptamente el proceso completo.

---

## 18. Tests automatizados

Cada nuevo adaptador `scraper/adapters/<tienda>.mjs` debe acompañarse obligatoriamente de su archivo de pruebas unitarias `test/<tienda>.test.mjs`.

La suite debe cubrir los siguientes aspectos:

### 1. Contrato del adaptador
Verificar que exporte `id`, `nombre`, `automatizable`, `cadenas` y la función `obtenerPrecios`.

### 2. Matching estricto
Probar la lógica de plausibilidad con casos positivos y negativos:
```javascript
test('rechaza variantes no deseadas', () => {
  assert.equal(esResultadoPlausible('Leche Lala Deslactosada 1L', productoLalaEntera), false);
});
test('rechaza multipacks cuando el catálogo pide pieza unitaria', () => {
  assert.equal(esResultadoPlausible('Leche Lala 6 pack 1L', productoLalaEntera), false);
});
test('rechaza diferencias de volumen/peso', () => {
  assert.equal(esResultadoPlausible('Crema Lala 426ml', productoCrema450ml), false);
});
```

### 3. Validación de mappings
Comprobar que el archivo JSON de mapeo cargue correctamente, que todos sus EANs pertenezcan a `PRODUCTS_CATALOG` y que no contenga identificadores vacíos.

### 4. Normalización de respuestas
Probar con fixtures estáticos (objetos JSON mockeados) que la función de extracción interprete precios decimales, URLs, nombres y vendedores, y descarte precios negativos o nulos.

### 5. Validación del contrato de salida
Pasar una observación generada por la función `validarObservacion` de `scraper/lib/normalize.mjs` y comprobar que devuelva 0 problemas.

---

## 19. Tests offline vs Tests de integración

> [!IMPORTANT]
> **LOS TESTS UNITARIOS DEBEN SER 100% OFFLINE**
> Al ejecutar `npm test` en local o en CI, **ninguna prueba unitaria debe realizar peticiones a APIs externas ni consumir cuota**.

### El patrón de prueba de integración condicional:
Para pruebas reales contra la API de la tienda o proveedor, utiliza la ejecución condicional mediante la presencia de la variable de entorno:

```javascript
// test/<tienda>.test.mjs
const testIntegracion = process.env.SERPAPI_KEY ? test : test.skip;

testIntegracion('integración real con la API (solo cuando la llave está presente)', async () => {
  const res = await consultarApiReal('00750102056593', process.env.SERPAPI_KEY);
  assert.ok(res);
  assert.ok(res.precio > 0);
});
```

**Comportamiento resultante:**
- En entornos locales de desarrolladores sin la llave: la prueba se marca como `skip` automáticamente.
- En el paso `npm test` de GitHub Actions: la variable de entorno **no se inyecta intencionalmente** en ese paso, por lo que la suite ejecuta 63 pruebas unitarias y salta 1 prueba de integración, consumiendo **cero peticiones** de cuota.

---

## 20. Integración con `scraper/run.mjs`

Para registrar un nuevo adaptador en el orquestador general:

1. Importa el adaptador en `scraper/run.mjs`:
```javascript
import { adaptador as profeco } from './adapters/profeco.mjs';
import { adaptador as chedraui } from './adapters/chedraui.mjs';
import { adaptador as manual } from './adapters/csv-manual.mjs';
import { adaptador as walmart } from './adapters/walmart.mjs';
import { adaptador as nuevaTienda } from './adapters/nueva-tienda.mjs'; // NUEVO

const ADAPTADORES = [chedraui, profeco, manual, walmart, nuevaTienda];
```

2. El orquestador soporta automáticamente el argumento `--only <id>`. Al registrar `nuevaTienda` con `id: 'soriana'`, el comando:
```bash
node scraper/run.mjs --only soriana
```
ejecutará de manera aislada ese adaptador sin tocar las demás fuentes.

---

## 21. Runner centralizado de pruebas (`test/runner.mjs`)

El proyecto utiliza un script orquestador de pruebas:
```javascript
// test/runner.mjs
import './checkout.test.mjs';
import './chedraui.test.mjs';
import './optimizer.test.mjs';
import './parser.test.mjs';
import './walmart.test.mjs';
```
Y en `package.json`:
```json
"scripts": {
  "test": "node --test test/runner.mjs"
}
```

### ¿Por qué existe este runner?
En sistemas operativos Windows, ejecutar `node --test test/*.test.mjs` o invocar procesos paralelos de prueba suele provocar errores de concurrencia y bloqueos en el spawn de procesos secundarios. Importar los archivos de prueba en `test/runner.mjs` garantiza una **ejecución secuencial, determinista y perfectamente multiplataforma**.

Al agregar una nueva suite `test/<tienda>.test.mjs`, debes agregar su importación en `test/runner.mjs`.

---

## 22. Configuración en GitHub Actions

El flujo de trabajo automatizado vive en `.github/workflows/actualizar-precios.yml`.

### Aspectos que deben configurarse al agregar una fuente:
1. **Parámetro `workflow_dispatch`:** Actualizar la descripción para documentar el nuevo valor permitido en `solo`:
   ```yaml
   inputs:
     solo:
       description: 'Correr un único adaptador (profeco | walmart | manual | nueva_tienda)'
       required: false
       type: string
   ```
2. **Paso del scraper con inyección de credencial:** Inyectar el secreto de la API **únicamente en el paso de ejecución del scraper**:
   ```yaml
   - name: Correr el scraper
     env:
       SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
       SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
       NUEVA_TIENDA_KEY: ${{ secrets.NUEVA_TIENDA_KEY }}
     run: |
       if [ -n "${{ inputs.solo }}" ]; then
         node scraper/run.mjs --only "${{ inputs.solo }}"
       else
         node scraper/run.mjs
       fi
   ```
3. **Aislamiento de secretos en tests:**
   ```yaml
   - name: Correr las pruebas
     run: npm test # ¡NO declarar NUEVA_TIENDA_KEY aquí!
   ```
   Esto asegura que las pruebas de integración condicionales continúen haciendo `skip` y no gasten saldo ni cuota durante CI.

---

## 23. Gestión segura de secretos (GitHub Secrets)

> [!CAUTION]
> **SEGURIDAD DE CREDENCIALES**
> - Nunca guardes API keys ni tokens en archivos `.json`, `.js`, `.mjs` o `.env` subidos a Git.
> - Nunca imprimas (`console.log`) valores de secretos ni queries de URLs que contengan la API key en texto plano.
> - Agrega los secretos en GitHub en: **Settings → Secrets and variables → Actions → Repository secrets**.
> - En código, léelos siempre exclusivamente desde `process.env.NOMBRE_VARIABLE`.

---

## 24. Protocolo de prueba local

Antes de solicitar una revisión de código, ejecuta localmente los comandos oficiales del proyecto en este orden:

```bash
# 1. Ejecutar la suite completa de pruebas unitarias
npm test

# 2. Ejecutar simulación local sin alterar archivos ni base de datos
node scraper/run.mjs --only <tienda> --dry-run

# 3. Validar la integridad de los datos de precios existentes
npm run validate:prices
```

---

## 25. Primera prueba real de recolección

Cuando cuentes con las credenciales de desarrollo y vayas a realizar una prueba real de extracción con `node scraper/run.mjs --only <tienda>`, audita cuidadosamente la salida en terminal:

1. **Total de productos procesados:** ¿Se consultaron los 19 productos?
2. **Productos con precio exitoso:** ¿Cuántos devolvieron precio?
3. **Productos sin precio:** ¿Son los que esperabas según `_sin_mapear`?
4. **Peticiones consumidas:** ¿Coincide el número con el cálculo teórico?
5. **Fallbacks activados:** ¿Cuántos productos recurrieron a búsqueda alternativa?
6. **Nuevos IDs descubiertos:** ¿Se registraron en el log para revisión?
7. **Falsos positivos:** Inspecciona manualmente los nombres de los productos capturados. ¿Alguna leche deslactosada se coló como entera? ¿Algún paquete de 6 unidades se registró con precio unitario?
8. **Verificación de archivos:** Revisa `git diff data/prices.json`. Comprueba que los precios de las otras cadenas sigan intactos y que solo se agregaron/actualizaron los de la nueva tienda.

---

## 26. Flujo de Git y Pull Request (PR)

Nunca trabajes directamente sobre la rama principal (`main`).

```text
main
  │
  ├──► git checkout -b feature/<tienda>-scraper
  │      │
  │      ├── Desarrollo del adaptador
  │      ├── Mappings y tests
  │      ├── Verificación local (npm test)
  │      └── git commit -m "feat: integrar adaptador de <tienda>"
  │
  ├──► Push de la rama y apertura del Pull Request en GitHub
  │      │
  │      ├── Ejecución de CI en GitHub Actions
  │      └── Revisión técnica por pares
  │
  └──► Merge a main mediante Squash o Rebase
```

### Contenido obligatorio del Pull Request:
- Resumen técnico de la fuente utilizada.
- Justificación de la legitimidad y sostenibilidad de la fuente.
- Cobertura alcanzada (ej. 11 de 19 productos).
- Explicación de los productos no mapeados.
- Resultados de `npm test`.
- Confirmación de que no se modificaron archivos no autorizados.

---

## 27. Checklist antes del merge

Verifica cada punto antes de autorizar la fusión de la rama:

### Investigación
- [ ] Fuente legítima identificada y documentada.
- [ ] Matriz de viabilidad aprobada (sin scraping directo frágil).
- [ ] Proyección de costos y cuota mensual calculada.
- [ ] Cobertura geográfica confirmada para Querétaro (`76000`).

### Producto y Mapeo
- [ ] Archivo `scraper/mappings/<tienda>.json` creado.
- [ ] EANs validados contra `js/data.js`.
- [ ] Productos sin correspondencia exacta documentados en `_sin_mapear`.
- [ ] Criterio de matching estricto verificado (sin variantes ni multipacks erróneos).
- [ ] Regla de no auto-modificación de mappings respetada.

### Código y Contrato
- [ ] Adaptador encapsulado en `scraper/adapters/<tienda>.mjs`.
- [ ] Registrado en `scraper/run.mjs` bajo `ADAPTADORES`.
- [ ] Contrato de observación respetado estrictamente (`ean`, `storeId`, `price`, `capturedAt`, `source`, `sourceUrl`, `raw`).
- [ ] Timestamp de la corrida compartido en todas las observaciones de la tanda.
- [ ] `branch_id` no inventado si la fuente es en línea general.

### Seguridad y Ética
- [ ] Sin CAPTCHA solving.
- [ ] Sin stealth browser ni bypass de WAF.
- [ ] Sin proxies para evasión de bloqueos.
- [ ] Sin credenciales ni API keys en el código.
- [ ] Secretos gestionados exclusivamente en GitHub Repository Secrets.

### Pruebas y CI
- [ ] Suite unitaria `test/<tienda>.test.mjs` creada y agregada a `test/runner.mjs`.
- [ ] Tests unitarios 100% offline (sin llamadas a red externa).
- [ ] Prueba de integración condicionada a la existencia del secreto (`test.skip`).
- [ ] `npm test` pasa limpiamente en local.
- [ ] `.github/workflows/actualizar-precios.yml` configurado con el secreto en el paso del scraper pero no en el paso de tests.

---

## 28. Checklist post-merge

Una vez fusionada la rama en `main`:

1. Cambiar localmente a la rama `main` y hacer `git pull`.
2. Verificar que el secreto (`SECRET_KEY`) esté configurado en el repositorio de GitHub.
3. Ejecutar manualmente el workflow desde la pestaña **Actions** usando `workflow_dispatch` con el parámetro `solo: <tienda>`.
4. Monitorear los logs en vivo del job de GitHub Actions.
5. Verificar el número de observaciones exitosas y productos sin precio reportados.
6. Confirmar si se reportaron nuevos IDs en el log.
7. Verificar que el commit automático `chore: actualiza precios` se haya generado si hubo cambios en `data/prices.json`.
8. Si Supabase está enlazado, verificar que la tabla `price_observations` haya recibido las nuevas filas y que `scrape_runs` reporte estado `ok` o `partial`.
9. Comprobar que los precios de las otras cadenas en la PWA se mantengan íntegros.
10. Confirmar que la primera ejecución automática programada por cron concluya sin errores.

---

## 29. Tutorial: Reconstrucción del caso Walmart México

Para entender cómo se articula todo lo anterior en un caso real, a continuación se reconstruye paso a paso el camino seguido con Walmart:

```text
Fase 1: Diagnóstico inicial
  1. Intentamos consultar walmart.com.mx por HTTP directo con fetch.
  2. Akamai devolvió HTTP 307 redirigiendo a /blocked.
  3. Levantamos un script de prueba con Playwright para inspeccionar el navegador.
  4. La pantalla mostró el desafío interactivo "Verifica tu identidad".
  5. Acordamos la regla inquebrantable: NO implementar evasión anti-bot ni stealth.

Fase 2: Búsqueda de alternativa legítima
  6. Evaluamos PROFECO QQP: oficial y verificado, pero con meses de desfase temporal; útil solo como histórico.
  7. Investigamos proveedores estructurados y seleccionamos SerpApi (Walmart Search API).
  8. Verificamos que SerpApi soporta walmart_domain=walmart.com.mx y entrega JSON limpio.
  9. Confirmamos que la búsqueda por EAN de 13 dígitos en Walmart Search API arrojaba 0 resultados.
  10. Descubrimos que el identificador indexable de Walmart es us_item_id.

Fase 3: Mapeo y matching
  11. Realizamos búsquedas asistidas por nombre para los 19 productos canónicos.
  12. Aplicamos matching estricto: identificamos 10 productos exactos (Leche Lala entera, Frijol Negro Verde Valle 900g, Atún Dolores agua 140g, etc.).
  13. Documentamos los 9 restantes en _sin_mapear (ej. Crema Lala solo existía en 426ml vs 450ml del catálogo; Arroz Verde Valle solo en 1kg vs 900g).
  14. Registramos los 10 productos validados en scraper/mappings/walmart-items.json.

Fase 4: Implementación del adaptador
  15. Creamos scraper/adapters/walmart.mjs con consulta primaria por us_item_id y fallback por nombre.
  16. Implementamos esResultadoPlausible para rechazar deslactosadas, lights, descafeinados y multipacks.
  17. Configuramos el contrato de observación con storeId: 'walmart', source: 'serpapi-walmart' y los 6 campos de raw.
  18. Omitimos branch_id porque el precio corresponde a la tienda online, no a una sucursal física inventada.

Fase 5: Pruebas y orquestación
  19. Creamos test/walmart.test.mjs con pruebas unitarias offline (fixtures de normalización, matching y contrato).
  20. Añadimos una prueba de integración condicionada: process.env.SERPAPI_KEY ? test : test.skip.
  21. Registramos walmart en scraper/run.mjs y en test/runner.mjs.
  22. Ejecutamos npm test (63 passed, 1 skipped).

Fase 6: Puesta a punto y despliegue
  23. Probamos con node scraper/run.mjs --only walmart usando SERPAPI_KEY real: 10 precios obtenidos, Pan Bimbo reportó rotación de ID y se auditó.
  24. Incorporamos el mapping actualizado, configuramos el cron a lunes, miércoles y viernes en GitHub Actions inyectando SERPAPI_KEY únicamente en el paso del scraper, y creamos el Pull Request.
```

---

## 30. Lecciones aprendidas

1. **Un sitio web puede funcionar para un humano y bloquear a un script:** La presencia de Cloudflare, Akamai o DataDome significa que la vía directa web no es viable.
2. **Playwright no es una solución mágica:** El renderizado con navegador real no evade defensas conductuales y añade lentitud y consumo masivo de recursos.
3. **No construir pipelines sobre evasión:** Las técnicas de evasión fallan constantemente y no tienen cabida en un proyecto serio.
4. **Una API intermedia puede ser la solución más sostenible:** Delegar el acceso a un servicio estructurado transforma una tarea frágil en una llamada JSON confiable.
5. **Los identificadores internos rotan:** Las tiendas cambian sus IDs de producto; el sistema debe detectar la rotación y permitir actualizar el mapping mediante auditoría humana.
6. **El matching estricto es innegociable:** Mezclar presentaciones o sabores destruye la confianza del usuario final.
7. **"No encontrado" no significa "descontinuado":** La ausencia de datos en una corrida no debe provocar el borrado de registros.
8. **Los fallbacks deben ser auditables:** Si un producto se recupera mediante búsqueda textual, el log debe registrar qué término se utilizó y qué ID nuevo se encontró.
9. **Los mappings jamás deben auto-modificarse:** Un script nunca debe sobreescribir sus propios archivos de configuración sin intervención de una persona.
10. **La cobertura no debe conseguirse sacrificando exactitud:** Tener 8 productos con precio 100% verificado es infinitamente superior a tener 19 productos con 5 errores de presentación.

---

## 31. Qué NO copiar de Walmart

Al integrar la próxima tienda, ten claro qué partes fueron decisiones específicas de Walmart y no deben asumirse como requisitos para otras cadenas:

| Decisión específica de Walmart | Qué evaluar en la nueva tienda |
|---|---|
| **SerpApi como intermediario** | Si la nueva tienda cuenta con una API pública, catálogo abierto o feed sindicado, úsalo directamente. No asumas que necesitas SerpApi. |
| **Identificador `us_item_id`** | Otra tienda usará SKUs de 7 dígitos, códigos de barras directos o slugs de URL. Modela el mapping según la realidad de la tienda. |
| **Búsqueda por nombre como fallback** | Si la fuente admite consulta directa por EAN o SKU estricto, no implementes fallbacks difusos innecesarios. |
| **Campos de `raw`** | Campos como `us_item_id`, `product_id` u `offer_id` son propios de Walmart. Cada tienda debe guardar sus propios metadatos relevantes en `raw`. |
| **Frecuencia de 3 veces por semana** | Adapta la frecuencia al ritmo de actualización de la tienda y a los límites de la cuota disponible. |

Lo que **SÍ debe reutilizarse siempre** es el patrón arquitectónico:
$$\text{Fuente legítima} \longrightarrow \text{Identificación} \longrightarrow \text{Matching estricto} \longrightarrow \text{Contrato común} \longrightarrow \text{Tests offline} \longrightarrow \text{CI}$$

---

## 32. Criterio de aceptación

Una nueva tienda o fuente solo se considerará formalmente integrada y lista para producción cuando satisfaga la totalidad de este criterio:

- [x] **Fuente sostenible:** La recolección no depende de evasión anti-bot ni ingeniería inversa frágil.
- [x] **Identificación unívoca:** Existe correspondencia probada entre el EAN canónico y el ID de la tienda.
- [x] **Matching verificado:** Los productos capturados coinciden exactamente en marca, variante y presentación física.
- [x] **Contrato respetado:** Las observaciones producidas superan `validarObservacion` sin advertencias.
- [x] **Metadatos en `raw`:** Se guardan los datos originales para auditoría.
- [x] **Tests offline completos:** `npm test` corre y pasa sin requerir conexión a internet ni secretos.
- [x] **Prueba real validada:** Se ejecutó al menos una corrida real completa verificando que los precios son plausibles.
- [x] **Presupuesto y cuota verificados:** El consumo mensual proyectado se encuentra documentado y dentro de los límites del servicio.
- [x] **Secretos aislados:** Las API keys solo se exponen en el paso de ejecución de GitHub Actions.
- [x] **Revisión y merge:** El PR ha sido aprobado por un colaborador humano y fusionado a `main`.

---

## 33. Referencias del repositorio

Antes de iniciar cualquier desarrollo, todo colaborador debe consultar los siguientes archivos fuente existentes en el repositorio:

1. [`README.md`](../README.md) — Visión general del proyecto, catálogo canónico y comandos base.
2. [`CONTINUIDAD.md`](../CONTINUIDAD.md) — Historial detallado de decisiones de arquitectura, estado de la base de datos e investigación histórica.
3. [`AGENTS.md`](../AGENTS.md) — Directrices de ingeniería, reglas de scraping y principios inmutables del proyecto.
4. [`docs/scraping.md`](scraping.md) — Análisis original del bloqueo de cadenas directas y explicación del pipeline PROFECO.
5. [`js/data.js`](../js/data.js) — Catálogo canónico de los 19 productos (`PRODUCTS_CATALOG`) y supermercados (`SUPERMARKETS`).
6. [`scraper/run.mjs`](../scraper/run.mjs) — Orquestador central del scraper.
7. [`scraper/lib/normalize.mjs`](../scraper/lib/normalize.mjs) — Funciones `normalizar`, `validarObservacion` y `consolidar`.
8. [`scraper/lib/sinks.mjs`](../scraper/lib/sinks.mjs) — Lógica de escritura a `data/prices.json` y Supabase.
9. [`scraper/adapters/walmart.mjs`](../scraper/adapters/walmart.mjs) — Adaptador de referencia implementado con SerpApi.
10. [`scraper/mappings/walmart-items.json`](../scraper/mappings/walmart-items.json) — Estructura de mapeo con productos activos y `_sin_mapear`.
11. [`test/walmart.test.mjs`](../test/walmart.test.mjs) — Suite de pruebas de referencia para un adaptador.
12. [`test/runner.mjs`](../test/runner.mjs) — Runner secuencial multiplataforma de pruebas.
13. [`.github/workflows/actualizar-precios.yml`](../.github/workflows/actualizar-precios.yml) — Workflow de GitHub Actions que ejecuta el pipeline.
