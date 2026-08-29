# SuperPrecios QRO 🥑🛒

**SuperPrecios QRO** es una Progressive Web App (PWA) móvil y de escritorio diseñada para comparar y optimizar el costo de la canasta de compras entre las principales cadenas de supermercados en **Querétaro, México**:
- **Bodega Aurrera**
- **Chedraui / Chedraui Selecto**
- **Walmart Supercenter / Express**
- **Soriana Híper**
- **HEB Querétaro**
- **La Comer / Fresko**

---

## 🌟 Características Principales

1. **⚡ Motor de Optimización de Rutas de Compra**:
   - **🌟 Máximo Ahorro (Compra Dividida)**: Desglosa cada producto asignándolo a la tienda donde tiene el precio más bajo, calculando el ahorro total ($ y %).
   - **⚖️ Ruta Práctica (Máximo 2 Tiendas)**: Algoritmo combinatorio de pares que encuentra la combinación óptima de 2 supermercados para balancear ahorro y tiempo de traslado.
   - **🏪 Todo en 1 Sola Tienda**: Evalúa la canasta completa e identifica cuál es la tienda individual más económica.
2. **✍️ Parser Inteligente de Texto Libre**:
   - Permite escribir o pegar listas de compras en lenguaje natural (ej. `2 leche lala, 1 huevo san juan, 500g queso panela, 1 aceite nutrioli, 1 pan bimbo, 1 papel de bano`) reconociendo automáticamente cantidades, unidades y marcas.
   - Convierte medidas a presentaciones reales de venta: `500g queso panela` → **2 bloques de 400g**; `30 huevos` → **1 cartera de 30**. La conversión se muestra en la lista para que sea auditable.
3. **🛒 Modo Supermercado (Checklist Interactivo)**:
   - Lista interactiva filtrada por tienda con casillas para ir tachando productos en tiempo real en los pasillos físicos de la tienda.
4. **📲 PWA Completa & Offline**:
   - Service Worker con estrategia *Network First* y respaldo en caché. Funciona sin conexión a internet dentro del supermercado.
   - Instalable como app nativa en Android, iOS y Desktop.
   - Botón para compartir la ruta y desglose por WhatsApp.
5. **🏷️ Catálogo con Códigos de Barras Oficiales (EAN-13)**:
   - Productos estandarizados con sus códigos GTIN/EAN-13 registrados ante GS1 México y enlaces de verificación.

---

## ⚠️ Sobre los precios (léelo antes de confiar en el total)

Los precios viven en `js/data.js` y son **capturas manuales con fecha** (`LAST_VERIFICATION_DATE`), no una
consulta en vivo a las tiendas. Pueden variar por sucursal, promoción y temporada.

Los productos que **no** están en el catálogo (ej. frutas, verduras, carne) reciben un **precio estimado**
generado por `estimatePricesForUnknown()`. Se marcan con `≈` en la interfaz y **no deben tomarse como reales**:
sirven para que la lista no se rompa, no para decidir dónde comprar.

Antes de publicar la app a usuarios reales, conecta una fuente de precios de verdad (ver *Guía para el
siguiente desarrollador*).

---

## 📁 Estructura del Proyecto

```
superprecios-qro/
├── index.html              # Interfaz principal semántica y vistas PWA
├── manifest.webmanifest    # Manifiesto PWA para instalación móvil
├── sw.js                   # Service Worker para caché y funcionamiento offline
├── css/
│   ├── main.css            # Sistema de diseño, temas de cadenas y glassmorphism
│   └── responsive.css      # Adaptabilidad móvil y barra inferior de navegación
├── js/
│   ├── app.js              # Controlador principal y gestión de estado
│   ├── data.js             # Catálogo de productos, códigos EAN y precios por cadena
│   ├── optimizer.js        # Motor matemático de cálculo y optimización
│   ├── parser.js           # Parser de lenguaje natural para listas escritas
│   └── pwa.js              # Inicialización de Service Worker y banner de instalación
├── assets/
│   └── icons/
│       ├── icon.svg        # Ícono maestro (fuente de los PNG)
│       ├── icon-192.png    # Ícono PWA Android / precache
│       └── icon-512.png    # Ícono PWA splash / instalación
└── README.md
```

---

## 🚀 Cómo Ejecutar el Proyecto Localmente

No requiere instalación de dependencias pesadas. Puedes servirlo con cualquier servidor HTTP local:

### Con Python:
```bash
python -m http.server 8080
```
Abre en tu navegador: `http://localhost:8080`

### Con Node.js / npx (opcional):
```bash
npx serve .
```

---

## 🛠️ Guía para el Siguiente Desarrollador

### 1. Conexión de Scrapers / Actualización en Tiempo Real
Para alimentar `js/data.js` o una base de datos en **Supabase**:
- Al hacer peticiones a las APIs o webs de supermercados (Walmart, Aurrera, Chedraui, Soriana), **es indispensable enviar el código postal de Querétaro en las cookies o headers** (ej. `postalCode: 76000` o `76230`), de lo contrario los sitios devolverán el catálogo de *Marketplace* en lugar del inventario de *Despensa/Súper físico*.

### 2. Roadmap Recomendado
- [ ] Conectar **Supabase (PostgreSQL)** para almacenar el histórico de precios diario por sucursal.
- [ ] Implementar escáner de código de barras mediante la cámara usando `@zxing/library` o `html5-qrcode`.
- [ ] Agregar soporte para subida de fotos de tickets con OCR (usando la API de Gemini Vision para extraer precios de tickets de compra físicos).
- [ ] Desplegar en **Vercel** o **Cloudflare Pages** para CI/CD automático desde el repositorio de GitHub.

---

## 📄 Licencia
MIT License - Desarrollado para la comunidad de Querétaro.
