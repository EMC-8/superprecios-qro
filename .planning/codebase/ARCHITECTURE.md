# Architecture

**Analysis date:** 2026-08-29

## System Overview

`superprecios-qro` is a dependency-free client-side Progressive Web App. `index.html` loads one ES-module entry point, `js/app.js`; all application behavior, catalog data, optimization, persistence, and retailer handoff run in the browser. There is no server, API route, database, build step, package manifest, or user authentication layer.

The browser owns the complete request flow:

```text
index.html
  -> js/app.js (state + UI orchestration)
       -> js/data.js (stores, catalog, reference prices, sample lists)
       -> js/parser.js (free-text list -> shopping items)
       -> js/optimizer.js (single/split/two-store routes)
       -> js/checkout.js (official retailer links, copied/shared carts)
       -> js/pwa.js (install prompt, connectivity, service-worker registration)
  -> localStorage (list and checklist persistence)
  -> sw.js (static asset/offline cache)
  -> official retailer websites (new-tab product searches and checkout)
```

## Runtime Entry Points

- `index.html` is the only document entry point. It defines the static five-tab shell and mounts dynamic content into named containers such as `#optimization-results`, `#shopping-list-items`, `#catalog-items-grid`, `#supermarket-mode-container`, and `#checkout-container`.
- `js/app.js` is the composition root. On `DOMContentLoaded`, it restores persisted state, optionally imports a `#cart=` shared-cart fragment, initializes PWA behavior, binds persistent DOM listeners, and calls `renderAll()`.
- `sw.js` is registered by `js/pwa.js` after `window.load`. It precaches the app shell and uses network-first fetching with a cache fallback.
- `.github/workflows/deploy-pages.yml` deploys the repository as static content to GitHub Pages only through `workflow_dispatch`.

## Application Layers

### State and presentation orchestration

`js/app.js` contains the in-memory `AppState` singleton and all DOM rendering/event binding. Its state fields drive the active view, optimizer strategy, cart, physical-store checkmarks, catalog search/category, selected store, and fulfillment preference.

- Persist the cart using `superprecios_qro_list_v1` and checklist using `superprecios_qro_checked_v1`, as defined in `js/app.js`.
- Keep domain calculations out of render functions when adding behavior; `js/app.js` delegates parsing to `js/parser.js`, calculations to `js/optimizer.js`, and external-link/share behavior to `js/checkout.js`.
- Rendering is imperative: each `render*` function replaces a container’s `innerHTML` and then rebinds listeners for elements it created. New UI features should follow that same render-then-bind convention or migrate the whole application deliberately.
- Dynamic user-derived values must be escaped through `escapeHtml()` in `js/app.js` before interpolation into HTML. Existing list and optimizer render paths contain legacy direct interpolation, so new paths should not copy that pattern.

### Static catalog and retailer configuration

`js/data.js` is the single source of truth for product and supermarket metadata:

- `SUPERMARKETS` contains IDs, display metadata, Querétaro branches, colors, and `searchUrl(query)` functions.
- `CATEGORIES` supplies catalog grouping.
- `PRODUCTS_CATALOG` stores catalog identity, aliases, EAN, external registry URL, unit, and per-store reference prices.
- `SAMPLE_LISTS` stores preset free-text baskets.

All consumers use supermarket IDs from `SUPERMARKETS`. Add a retailer or product by updating `js/data.js` first, then rely on the existing parser, optimizer, catalog, and checkout consumers rather than duplicating definitions in UI code.

### List normalization

`js/parser.js` transforms free text into normalized shopping-item objects. `parseLine()` detects initial quantity/unit, resolves a catalog product through exact, partial, and token overlap matching, and produces a fallback custom item if no catalog product matches. `parseShoppingListText()` parses multiline or comma-separated input and consolidates catalog items by `catalogId`.

The normalized item contract consumed by `js/app.js`, `js/optimizer.js`, and `js/checkout.js` is:

```js
{
  id, catalogId, name, category, unit, quantity,
  prices, rawInput, isCustom
}
```

Keep new item sources conformant to this shape. Catalog items should preserve their `catalogId`; custom items must include valid numeric `prices` for route calculation.

### Optimization domain logic

`js/optimizer.js` is pure calculation code. `calculateOptimizations(items)` produces:

- a total and annotated items for every supermarket;
- the lowest and highest single-store options;
- a split route that assigns each item to its lowest priced store;
- the lowest-cost combination of two stores;
- aggregate savings metrics.

Presentation code in `js/app.js` selects one of these result structures based on `AppState.strategy`. Preserve this boundary: add pricing or route rules in `js/optimizer.js`, then render its output in `js/app.js`.

### Official checkout handoff and sharing

`js/checkout.js` deliberately hands buyers to retailer-owned sites instead of trying to create remote carts. `getOfficialStoreUrl()` and `getOfficialProductUrl()` call the configured retailer URL builder; `formatStoreList()` creates a pasteable list; `buildShareUrl()` serializes up to 60 items into the URL hash; and `readSharedCart()` validates/deserializes it.

`renderCheckout()` and `renderCheckoutStore()` in `js/app.js` group the selected optimization route by retailer, expose preference-only delivery/pickup controls, provide store/search links, and copy text or a share link. The external retailer is the source of truth for availability, coverage, pickup, delivery fees, and final checkout.

### PWA and offline behavior

`manifest.webmanifest` declares install metadata and `assets/icons/icon.svg` as the application icon. `js/pwa.js` owns install-prompt state and online/offline badge updates. `sw.js` caches static first-party assets, deletes old caches at activation, and falls back to cache on network failure. The app’s catalog and cart can work offline because they live in JavaScript/localStorage; retailer handoffs require connectivity.

## Data and State Boundaries

- Durable browser data: cart and checklist only, in `localStorage` through `js/app.js`.
- Shareable browser data: cart-only hash payload through `js/checkout.js`; no server persistence or identity is involved.
- Static reference data: catalog, reference prices, and branches in `js/data.js`.
- External data: retailer product search/storefront pages opened by the user. The app does not fetch retailer inventory or modify a retailer cart.

## Styling and Assets

- `css/main.css` contains global resets, design tokens, desktop layout, component styles, and retailer-handoff styles.
- `css/responsive.css` overrides the layout below 768px and implements the fixed bottom tab navigation; it also contains desktop-only tab-icon adjustments at 769px and above.
- `assets/icons/icon.svg` is the PWA icon. `assets/qr_code.png` is a static supporting asset and is not referenced by the runtime entry document.

## Extension Boundaries

- For a backend or database, introduce a separate API/data-access layer rather than making render functions fetch data directly. Keep the shopping-item and optimizer-result contracts stable so UI code remains a consumer.
- For live prices, replace or hydrate the static price source behind `js/data.js`; do not treat reference data as retailer inventory.
- For an approved retailer cart integration, add a retailer-specific adapter under a dedicated integration layer. Retain `js/checkout.js` as the fallback official-handoff path for retailers without an approved API.
- For a framework migration, preserve the current seams: catalog/repository, parser, optimizer, checkout adapter, persistence, and UI. They are currently explicit ES-module boundaries even though `js/app.js` centralizes UI state.
