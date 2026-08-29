# Testing Guide

**Analysis date:** 2026-08-29

## Current test infrastructure

No automated test runner, test files, package manifest, lint configuration, formatting configuration, CI validation job, or browser test suite is detected. The only workflow, `.github/workflows/deploy-pages.yml`, manually deploys the static directory to GitHub Pages and does not validate the application.

## What can be tested now

The pure modules are the safest starting point for automated coverage because they do not require the DOM:

- `js/parser.js`: `parseLine`, `findBestMatch`, and `parseShoppingListText`.
- `js/optimizer.js`: `calculateOptimizations` and the output it produces from catalog-shaped items.
- `js/checkout.js`: `formatStoreList`; share URL helpers can be tested under a DOM-capable environment that supplies `window`, `btoa`, `atob`, and `crypto`.

`js/app.js` is a single DOM controller. Its render functions rely on `document`, browser storage, and event listeners, so behavior tests require a DOM environment and should verify visible user flows rather than private functions.

## Recommended automated-test baseline

Introduce a minimal browser-compatible JavaScript test runner before adding substantial behavior. Vitest with a jsdom environment is an appropriate fit for this ES-module static app; it can test pure modules without a bundler and use jsdom for DOM flows. Add the package manifest, test script, and a CI job before treating the demo as release-ready.

Place tests adjacent to the module or in a dedicated `tests/` directory using `*.test.js`; choose one convention and use it consistently. Keep fixtures small and shaped like entries from `PRODUCTS_CATALOG` in `js/data.js`.

### Parser cases

- `parseLine` in `js/parser.js` correctly recognizes quantities, decimal commas, `kg`, grams converted to kilograms, `pqte`, and an omitted quantity.
- Exact aliases, partial aliases, and token matching resolve the intended product from `PRODUCTS_CATALOG` in `js/data.js`.
- Unknown input returns a custom item with a positive quantity and defined reference prices.
- `parseShoppingListText` handles newline, comma-separated, empty, and duplicate catalog product input; duplicates must combine quantities.
- Malformed or blank lines must return no invalid cart item.

### Optimizer cases

- `calculateOptimizations` in `js/optimizer.js` returns `null` for an empty list.
- A known multi-store cart chooses the lowest positive price per item and groups the items by store.
- The one-store result uses all requested items, rounds currency totals to two decimals, and orders store totals from least to greatest.
- The two-store strategy evaluates a pair correctly and assigns every item once.
- Test missing, zero, non-numeric, and incomplete prices explicitly before relying on results in the UI; current behavior needs correction (see `.planning/codebase/CONCERNS.md`).

### Checkout and share cases

- `getOfficialProductUrl` in `js/checkout.js` URL-encodes product names for every store defined in `SUPERMARKETS` in `js/data.js`.
- `formatStoreList` includes the selected delivery/pickup preference and the retailer-confirmation caveat.
- `buildShareUrl` and `readSharedCart` round-trip a catalog item and a valid custom item, reject malformed encoding, reject more than 60 items, and reject invalid quantities/prices.
- Verify that generated external anchors in `renderCheckoutStore` in `js/app.js` retain `noopener noreferrer`.

### UI smoke flows

Run these against a local HTTP server, not by opening `index.html` directly, because ES modules and the service worker require HTTP(S):

1. Start the project with `python -m http.server 8080` from the repository root and open `http://localhost:8080`.
2. Load each sample list in the List tab; verify cart count, optimizer totals, shopping checklist, and checkout groups update.
3. Paste a recognized list and an unknown product; ensure quantities merge as expected and the unknown-item warning/estimate behavior is accurate.
4. Change between split, two-store, and single-store strategies; confirm the selected plan, totals, and checkout store groups agree.
5. Add, decrement, and remove catalog products; reload and verify persisted list/checklist state.
6. Toggle delivery and pickup in Comprar; test copying the list, copying a shared cart URL, opening an official store, and opening an official product search.
7. Open a shared cart URL in a fresh browser profile and verify it restores only valid cart data.
8. Test at desktop width and below 768px, including the fixed bottom navigation in `css/responsive.css`.
9. Use browser DevTools Application panel to verify service-worker installation, offline app-shell behavior, update activation, and cache cleanup.
10. Test keyboard navigation, focus visibility, link labels, contrast, and screen-reader names before public release.

## Manual data-validation gate

Prices, EANs, store links, branches, and fulfillment claims in `js/data.js` are business data, not merely UI fixtures. Before a release, verify each product/store price against the declared source, record collection time and Querétaro location, and manually open every retailer URL. Validate the header copy in `index.html` against the evidence; do not call static or estimated values “official verified” without a recorded source.

## Release gate

Until tooling exists, a release requires the local smoke flows above, a production-host smoke check under HTTPS, and a successful manual Pages deployment from `.github/workflows/deploy-pages.yml`. Once a test runner is added, block deploys on parser, optimizer, checkout, DOM smoke, lint, and static-host build checks.
