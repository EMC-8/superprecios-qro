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

1. **⚖️ Comparación canónica y honesta**:
   - Las seis cadenas reciben exactamente la misma lista y cantidades.
   - Una referencia faltante se conserva como **No verificado / Buscar en tienda oficial**; nunca se convierte en $0.
   - Los totales son datos locales de demo estimados y solo se muestran como comparables cuando cubren toda la canasta.
2. **✍️ Parser Inteligente de Texto Libre**:
   - Permite escribir o pegar listas de compras en lenguaje natural (ej. `2kg pechuga de pollo, 1kg jitomate, 2 leche lala, 1 huevo san juan, 1 aceite nutrioli, 1 pan bimbo, 1 papel de bano`) reconociendo automáticamente cantidades, unidades y marcas.
3. **↗ Compra guiada en la tienda oficial**:
   - Un CTA por cadena abre un flujo local persistente con la canasta completa, progreso, copia del término legible, EAN válido cuando exista y búsqueda oficial por producto. La lista legible copiada incluye el EAN cuando existe.
   - Permite copiar o compartir la lista completa. No crea ni promete un carrito remoto precargado.
4. **📲 PWA Completa & Offline**:
   - Service Worker con caché de app shell y datos locales guardados en el navegador.
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

La sección **Comparar** muestra las seis tiendas con la misma canasta. Para cada supermercado permite:

- abrir un modo guiado y su sitio oficial;
- copiar la lista canónica completa, con EAN cuando exista;
- copiar el término de búsqueda recomendado o EAN válido y abrir la búsqueda oficial de cada producto;
- compartir la misma canasta por URL. La compra y el pago ocurren exclusivamente en la tienda oficial.

No se crea un carrito remoto automáticamente: las cadenas no ofrecen un formato universal. La disponibilidad, pickup, entrega, sustituciones y cargos dependen de la cuenta, sucursal e inventario del comprador. El inicio de sesión, dirección y pago ocurren exclusivamente con cada supermercado.

---

---

## 📄 Licencia
MIT License - Desarrollado para la comunidad de Querétaro.
