# Project Structure

**Analysis date:** 2026-08-29

## Repository Layout

```text
superprecios-qro/
├── index.html                         # Static document shell and ES-module entry point
├── manifest.webmanifest               # PWA manifest
├── sw.js                              # Service worker and static cache policy
├── README.md                          # Product, local-run, deployment, and handoff documentation
├── NAPKIN.md                          # Project operating/product guardrails
├── css/
│   ├── main.css                       # Global design system and component styles
│   └── responsive.css                 # Mobile/tablet and desktop responsive overrides
├── js/
│   ├── app.js                         # App state, event listeners, and all view rendering
│   ├── data.js                        # Retailers, catalog, prices, branches, and sample baskets
│   ├── parser.js                      # Free-text shopping-list parsing and catalog matching
│   ├── optimizer.js                   # Basket price and store-route calculations
│   ├── checkout.js                    # Official-store handoff, copy, and share-cart helpers
│   └── pwa.js                         # Service-worker registration and install/connectivity UX
├── assets/
│   ├── icons/icon.svg                 # Manifest/favicon/apple-touch PWA icon
│   └── qr_code.png                    # Static QR asset, currently not loaded by `index.html`
├── .github/workflows/
│   └── deploy-pages.yml               # Manual GitHub Pages deployment workflow
└── .planning/codebase/                # GSD codebase maps
```

## Where New Code Belongs

| Need | Location | Guidance |
| --- | --- | --- |
| New screen/tab shell | `index.html` | Add a `.tab-btn` with `data-tab`, a matching `#tab-{id}.tab-pane`, then update navigation/render behavior in `js/app.js`. |
| New interactive UI behavior | `js/app.js` | Add state to `AppState`, a focused `render*` function, and listeners immediately after the function writes its container. |
| Catalog product, category, sample basket, branch, retailer URL | `js/data.js` | Keep IDs stable. Products must include the fields consumed by parser/optimizer/checkout; retailer keys must correspond to every product’s `prices` keys. |
| Free-text recognition rule | `js/parser.js` | Extend normalization/matching behavior while returning the established normalized shopping-item contract. |
| Route or price calculation | `js/optimizer.js` | Keep it DOM-free and return structured data for `js/app.js` to render. |
| Official retailer link, copied list, cart-share serialization | `js/checkout.js` | Keep retailer-specific handoff details here and preserve validation for inbound shared-cart data. |
| PWA lifecycle/install/network behavior | `js/pwa.js` and `sw.js` | Register UX/lifecycle handlers in `js/pwa.js`; change cache entries and fetch policy in `sw.js`. Bump `CACHE_NAME` when cache-invalidating asset changes require it. |
| Default styling or reusable component styling | `css/main.css` | Use existing CSS custom properties in `:root`, component-class selectors, and the dark visual system. |
| Breakpoint-specific styling | `css/responsive.css` | Keep narrow-screen changes inside the existing `max-width: 768px` block and desktop changes in the `min-width: 769px` block. |
| PWA metadata/icon | `manifest.webmanifest`, `assets/icons/` | Update the manifest and ensure any added icon is reachable from the static deployment root. |
| Static deployment automation | `.github/workflows/deploy-pages.yml` | The project has no build artifact; Pages uploads the repository root. Keep deployment configuration aligned with static hosting. |

## UI Composition

`index.html` contains five tabs, each rendered by a corresponding function in `js/app.js`:

- `#tab-optimizer` → `renderOptimizationResults()`
- `#tab-list` → `renderShoppingListEditor()` plus `renderSampleListButtons()`
- `#tab-supermarket` → `renderSupermarketMode()`
- `#tab-catalog` → `renderCatalog()`
- `#tab-checkout` → `renderCheckout()` and `renderCheckoutStore()`

Use `switchTab()` in `js/app.js` to make a tab active. It updates both `.tab-btn` and `.tab-pane` classes, then refreshes the destination view when necessary.

## Module Dependency Direction

```text
js/data.js       <- js/parser.js
js/data.js       <- js/optimizer.js
js/data.js       <- js/checkout.js
js/parser.js     <- js/app.js
js/optimizer.js  <- js/app.js
js/checkout.js   <- js/app.js
js/pwa.js        <- js/app.js
js/app.js        <- index.html
```

`js/data.js`, `js/parser.js`, `js/optimizer.js`, `js/checkout.js`, and `js/pwa.js` should remain independently importable utilities. `js/app.js` is the only module that should know concrete document IDs and manipulate the DOM.

## Key File Responsibilities

- `index.html`: semantic/static accessibility metadata, tab controls, mount points, PWA metadata links, and the `js/app.js` module tag.
- `js/app.js`: owns `AppState`, localStorage persistence, DOM event binding, all rendering, toast feedback, and WhatsApp sharing.
- `js/data.js`: owns retailer configuration and all bundled product/reference-price data; use it as the catalog schema reference.
- `js/parser.js`: turns a user’s text into shopping-item objects; custom unmatched items get estimated reference prices.
- `js/optimizer.js`: calculates all supported purchase strategies without touching browser APIs.
- `js/checkout.js`: protects official-store handoff boundaries and handles URL-safe cart sharing.
- `js/pwa.js`: is the browser capability adapter for PWA registration, installation, and connectivity indication.
- `sw.js`: owns offline cache versioning and runtime fetch interception.

## File Naming and Placement Rules

- Use lowercase kebab-free filenames for the existing JavaScript module style (for example, `checkout.js`, `optimizer.js`) and import them using relative `./name.js` paths from `js/app.js`.
- Keep application modules under `js/`, stylesheets under `css/`, and passive media under `assets/`.
- Do not add package-manager/build output folders for a static feature. This repository is designed to deploy its root unchanged.
- Do not place runtime state, generated data, credentials, or retailer-session data in the repository. Browser cart state belongs in local storage and retailer checkout belongs to the retailer site.
- Update `README.md` whenever a user-visible workflow, static-hosting requirement, or official-checkout boundary changes.
