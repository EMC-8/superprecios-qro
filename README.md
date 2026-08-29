# SuperPrecios QRO 🥑🛒

**SuperPrecios QRO** es una PWA para preparar una canasta y comparar referencias locales entre supermercados de **Querétaro, México**. No es una tienda ni procesa pedidos.

> Importante: los precios son referencias locales de ejemplo, no precios ni inventario en tiempo real. Los importes, disponibilidad, sucursal, sustituciones y total final pueden cambiar. Confirma y completa cualquier compra exclusivamente en el dominio oficial de cada supermercado.
- **Bodega Aurrera**
- **Chedraui / Chedraui Selecto**
- **Walmart Supercenter / Express**
- **Soriana Híper**
- **HEB Querétaro**
- **La Comer / Fresko**

---

## 🌟 Características Principales

1. **⚡ Motor de Optimización de Rutas de Compra**:
   - **🌟 Menor total estimado (Compra Dividida)**: Desglosa productos según las referencias locales disponibles.
   - **⚖️ Ruta Práctica (Máximo 2 Tiendas)**: Calcula una combinación estimada para reducir visitas.
   - **🏪 1 Sola Tienda**: Compara el total estimado de la canasta en cada cadena.
2. **✍️ Parser Inteligente de Texto Libre**:
   - Permite escribir o pegar listas de compras en lenguaje natural (ej. `2kg pechuga de pollo, 1kg jitomate, 2 leche lala, 1 huevo san juan, 1 aceite nutrioli, 1 pan bimbo, 1 papel de bano`) reconociendo automáticamente cantidades, unidades y marcas.
3. **🛒 Modo Supermercado (Checklist Interactivo)**:
   - Lista interactiva filtrada por tienda con casillas para ir tachando productos en tiempo real en los pasillos físicos de la tienda.
4. **📲 PWA Completa & Offline**:
   - Service Worker con estrategia de caché *Stale-While-Revalidate*. Funciona sin conexión a internet dentro del supermercado.
   - Instalable como app nativa en Android, iOS y Desktop.
   - Botón para compartir la ruta y desglose por WhatsApp.
5. **↗ Compra en canales oficiales**:
   - Genera una lista por supermercado, enlaces oficiales de búsqueda por producto y un enlace compartible de la canasta.
   - El usuario final confirma en el sitio del supermercado la cobertura, inventario, entrega o pickup y cualquier cargo aplicable.
6. **🔒 Privacidad local**:
   - Guarda en el navegador únicamente la canasta, checklist y preferencia Entrega/Pickup.
   - Nunca solicita, captura, transmite ni almacena contraseñas, tarjetas, CVV, dirección completa o datos de pago.
7. **🏷️ Catálogo de referencia**:
   - Incluye identificadores EAN/GTIN y enlaces de consulta de producto cuando están disponibles.

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
│   └── checkout.js          # Enlaces oficiales, lista copiable y canasta compartible
├── .github/workflows/
│   └── deploy-pages.yml     # Demo estática automática en GitHub Pages
├── assets/
│   └── icons/
│       └── icon.svg        # Ícono SVG PWA
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

## GitHub Pages

El repositorio incluye un workflow que publica desde la rama `main` mediante GitHub Actions, además de permitir una ejecución manual. Pages debe estar habilitado para el repositorio sin cambiar su visibilidad. Si GitHub no permite publicar Pages para un repositorio privado con el plan actual, no se debe volver público el repositorio sin autorización explícita.

## Flujo de compra oficial

La pestaña **Comprar** separa la canasta según la estrategia elegida. Para cada supermercado permite:

- abrir su sitio oficial;
- copiar la lista asignada;
- abrir la búsqueda oficial de cada producto;
- compartir la misma canasta por URL.

No se crea un carrito remoto automáticamente: la app ofrece una lista preparada, un enlace a cada tienda y búsquedas oficiales por producto. La disponibilidad, pickup, entrega, sustituciones y cargos dependen de la cuenta, sucursal e inventario del comprador. El inicio de sesión, dirección y pago ocurren exclusivamente con cada supermercado.

---

---

## 📄 Licencia
MIT License - Desarrollado para la comunidad de Querétaro.
