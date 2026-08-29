# Codebase Conventions

**Analysis date:** 2026-08-29

## Language and module boundaries

- Write browser code as dependency-free, native ES modules. `index.html` loads only `js/app.js` with `type="module"`; that module imports the focused modules in `js/`.
- Use named exports for reusable behavior. Examples: `calculateOptimizations` in `js/optimizer.js`, `parseShoppingListText` in `js/parser.js`, and checkout helpers in `js/checkout.js`.
- Keep the concerns separated by file: static catalog/configuration in `js/data.js`, pure pricing calculations in `js/optimizer.js`, text-to-item conversion in `js/parser.js`, retailer-handoff/share helpers in `js/checkout.js`, PWA lifecycle in `js/pwa.js`, and DOM/state coordination in `js/app.js`.
- Use modern JavaScript (`const` by default, `let` only for reassignment, arrow functions for compact callbacks, template literals, optional chaining, `Object.entries`, `Number.isFinite`). Do not introduce a build step unless the project is deliberately migrated from a static host.

## Data model and identifiers

- Supermarkets are keyed by stable lowercase IDs in `SUPERMARKETS` in `js/data.js` (for example `walmart`, `heb`). Product price maps must use those IDs.
- Catalog products use kebab-case stable `id` values, EAN strings when available, Spanish display names, category IDs, a unit, aliases, and a `prices` object. Follow the shape in `PRODUCTS_CATALOG` in `js/data.js`.
- Shopping-list items follow the shape produced by `parseLine` in `js/parser.js`: `id`, `catalogId`, `name`, `category`, `unit`, `quantity`, `prices`, `rawInput`, and `isCustom`.
- Preserve a catalog product's `catalogId` when adding it to a cart. Merge quantities by `catalogId`, as done by `mergeItemsIntoList` in `js/app.js`; custom items intentionally have `catalogId: null`.
- Store client persistence under versioned localStorage keys. The current keys are `superprecios_qro_list_v1` and `superprecios_qro_checked_v1` in `js/app.js`. A changed persisted shape requires a migration or a new key.

## State and rendering

- Treat `AppState` in `js/app.js` as the sole client-side state container. Update it, call `saveState()` for persisted cart/checklist changes, then render affected views (or `renderAll()` when multiple views depend on it).
- Keep rendering functions scoped to a tab or component: `renderOptimizationResults`, `renderShoppingListEditor`, `renderSupermarketMode`, `renderCatalog`, and `renderCheckout` in `js/app.js`.
- Render dynamic markup with template literals assigned to `container.innerHTML`, then attach event listeners to elements inside that container immediately afterward. Use `data-*` attributes to associate controls with product/store IDs or indexes.
- Use `showToast` in `js/app.js` for non-blocking feedback. Existing destructive confirmation and unavailable-install feedback use browser dialogs; maintain behavior only when a native dialog is appropriate.
- Prefer explicit tab changes through `switchTab()` so button and pane active classes remain synchronized. Avoid additional inline event attributes; the existing `onclick` in `renderOptimizationResults` is legacy behavior.

## Safety at rendering boundaries

- Dynamic text must be escaped with `escapeHtml` in `js/app.js` before inclusion in HTML. `renderCheckoutStore` is the reference implementation for cart-derived item names and quantities.
- Values placed in URL query parameters must pass through `encodeURIComponent`, as the `searchUrl` functions in `js/data.js` do. External links must open with `target="_blank"` and `rel="noopener noreferrer"`, as in `renderCheckoutStore`.
- Do not claim an official retailer cart, inventory, fulfillment availability, or free delivery without a retailer-approved integration. The handoff boundary is represented by `js/checkout.js` and documented in `README.md`.

## Presentation and markup

- Keep user-facing copy and comments in Spanish. Function and data identifiers are English or concise domain terms.
- Use semantic page regions and buttons/links appropriate to the action, following `index.html`. Keep tab IDs aligned with their `data-tab` values: `tab-<tabId>`.
- Reuse CSS custom properties from `css/main.css` (`--bg-*`, `--text-*`, `--accent-*`, radius and shadow tokens) instead of introducing arbitrary values where a token exists.
- Put base/component styling in `css/main.css` and viewport overrides in `css/responsive.css`. The mobile breakpoint currently used is `768px`.
- The UI uses a dark, glass-like visual system, Spanish labels, emoji as supplemental icons, and store-specific colors sourced from `SUPERMARKETS` in `js/data.js`.

## Error handling and compatibility

- Wrap browser storage and shared-cart decoding in `try/catch`, as in `loadSavedState`, `saveState`, and `readSharedCart`.
- Guard DOM lookups before use when a feature can be absent, following `if (!container) return` throughout `js/app.js`.
- Keep graceful browser fallbacks for progressive features: `copyText` falls back from Clipboard API to a textarea in `js/checkout.js`, and `promptInstallApp` explains manual installation in `js/pwa.js`.

## No automated formatting rules

No `package.json`, ESLint, Prettier, Biome, or EditorConfig configuration is present. Preserve the existing two-space indentation, semicolons, single-quoted JavaScript strings, trailing commas only where already used, and descriptive section comments. Add a formatter/linter configuration before applying mechanical style changes across the project.
