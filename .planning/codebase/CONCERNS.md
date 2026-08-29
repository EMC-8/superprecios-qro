# Technical Concerns

**Analysis date:** 2026-08-29

## Critical

### Unescaped cart and search input reaches `innerHTML`

**Locations:** `js/app.js:238-253`, `js/app.js:372-408`, `js/app.js:603-639`, `js/app.js:720-786`, and `js/app.js:714-724`.

`parseLine` in `js/parser.js` creates custom items from user text and `readSharedCart` in `js/checkout.js` accepts custom item names from a URL. Those values are inserted unescaped into several template literals in `js/app.js`. The catalog search query is also interpolated unescaped in the no-results markup. A crafted shopping-list entry or `#cart=` URL can execute markup/script in the app origin.

**Impact:** Cross-site scripting, including an attack link shared through the cart feature; any local cart data available to the app can be read or altered.

**Fix approach:** Make escaping mandatory at every HTML interpolation boundary (including `item.name`, units, quantities, search text, and text sourced from localStorage/shared carts), or build text nodes through DOM APIs. Use `escapeHtml` in `js/app.js` consistently; it is already used correctly by `renderCheckoutStore`.

## High

### Missing prices can produce false “best” totals

**Locations:** `js/optimizer.js:27`, `js/optimizer.js:67-84`, and `js/optimizer.js:164-177`.

Single-store totals interpret a missing price as `0`, making an unavailable product appear free. The split calculation ignores zero prices while still presents a price comparison containing zero. The two-store calculation converts missing prices to `Infinity`, potentially producing infinite totals and rendering failures if both selected stores lack the item.

**Impact:** The recommended store/strategy and stated savings can be materially wrong, particularly as the catalog grows or partial inventory data is introduced.

**Fix approach:** Define a single availability model: validate finite positive prices, mark stores incomplete when any requested item is unavailable, exclude incomplete routes from “all items” comparisons, and render an explicit unavailable state rather than a total. Add unit tests for all missing-price permutations.

### Price and fulfillment claims are not verifiable from the implementation

**Locations:** `index.html:32`, `js/data.js:9-350`, `js/parser.js:174-184`, and `README.md`.

The header says “Precios Oficiales Verificados,” but price values are static catalog data, custom products receive a synthetic price estimate, and no source URL, branch, ZIP code, capture time, or update process is stored per price. Delivery/pickup is a UI preference only. The README correctly states that retailers must confirm inventory, coverage, and charges, but this conflicts with the header-level verification claim.

**Impact:** Misleading savings/official-price claims can create consumer-trust, commercial, and regulatory exposure; recommendations quickly go stale.

**Fix approach:** Label current values as dated reference estimates until an auditable ingestion pipeline exists. Store per-price source, branch/ZIP, collection timestamp, and availability. Only surface “verified” when that evidence passes a freshness policy. Keep “free pickup/delivery” out of product claims unless confirmed by the retailer for the customer’s cart and location.

### Retailer handoff is not a remote cart integration

**Locations:** `js/checkout.js:3-17`, `js/app.js:490-539`, and `README.md`.

The app opens an official storefront or a per-product search query and lets the user copy a list. It cannot create a retailer cart, select a store, apply delivery/pickup, verify minimum order, or determine delivery fees. This is documented in the README but must remain an explicit product constraint.

**Impact:** A “checkout” label or marketing copy can create an expectation that the basket transfers intact when it does not.

**Fix approach:** Keep the handoff wording precise, show the number of manual additions remaining, and pursue retailer-approved APIs/deep-link contracts only after legal/partner approval. Do not emulate or scrape authenticated retailer checkout flows.

## Medium

### No automated quality gate

**Locations:** repository root; `.github/workflows/deploy-pages.yml`.

There is no package manifest, test runner, linting, formatting configuration, or CI test/build job. The existing workflow is manual and only deploys files.

**Impact:** Pricing, parser, share-link, and DOM regressions can reach the public demo undetected.

**Fix approach:** Add a minimal ES-module test runner and jsdom UI smoke tests, lint/format scripts, and GitHub Actions checks that run before deployment. See `.planning/codebase/TESTING.md` for target coverage.

### Single 916-line controller mixes domain, state, rendering, and events

**Location:** `js/app.js`.

`js/app.js` owns global state, persistence, navigation, every tab renderer, event binding, serialization coordination, and UI utilities. Re-rendering replaces DOM frequently and requires repeated event attachment.

**Impact:** Changes to checkout, catalog, or list behavior have a large regression surface and are difficult to test in isolation.

**Fix approach:** Retain the static-module approach but extract state/persistence, escaped view builders, and tab-specific controllers into focused modules. Establish DOM tests first, then refactor incrementally without changing external behavior.

### Persisted state has no schema validation or recovery

**Locations:** `js/app.js:47-73` and `js/checkout.js:30-57`.

Shared-cart input has partial validation, but saved localStorage data is assigned directly after `JSON.parse`. Invalid, stale, or manually modified values can leave non-array cart data or malformed items in `AppState`, causing rendering or optimizer errors. Catching the exception logs an error but does not clear/repair bad values.

**Impact:** A corrupted browser cache can make the application unusable until the user manually clears storage.

**Fix approach:** Validate the complete item schema at the persistence boundary, discard/recover invalid entries, reset corrupted keys safely, and show a user-facing recovery toast. Version migrations must be tested.

### Service-worker strategy and offline claim do not match

**Locations:** `sw.js:7-68` and `README.md`.

The README calls the strategy “Stale-While-Revalidate,” while `sw.js` implements network-first. It intercepts every fetch, including cross-origin requests, caches only same-origin basic responses, and returns `undefined` when an uncached request fails offline. `cache.addAll` is caught as one unit, so one missing asset can prevent precaching the remainder. Google Fonts loaded in `css/main.css:1` are not part of the app-shell cache.

**Impact:** Offline behavior is less reliable than advertised and future deployment/path changes can break app-shell caching silently.

**Fix approach:** Choose and document a single strategy. Limit interception to same-origin GET requests, provide a navigation/app-shell fallback, pre-cache assets individually or fail visibly, and test updates/offline behavior on the deployed HTTPS origin.

### Share URLs can exceed practical length and expose shopping data

**Locations:** `js/checkout.js:19-40` and `js/app.js:526-529`.

The complete cart (including all price maps) is base64url encoded into the hash. The 60-item cap does not guarantee compatibility with messaging clients or browsers, and the shopping list remains visible in the URL fragment to anyone the user shares it with.

**Impact:** Large shares can fail or be truncated; recipients may receive more personal shopping information than intended.

**Fix approach:** Keep only stable product IDs/quantities in a compressed schema, calculate prices locally, display the share scope before copying, and introduce server-side opaque IDs only with a documented privacy/retention model.

## Low

### PWA install metadata is incomplete for broad platform support

**Locations:** `manifest.webmanifest` and `index.html:15-18`.

The manifest uses only an SVG icon and the Apple touch icon references that SVG. Some installation surfaces expect PNG icons at standard sizes and may not render the icon reliably.

**Fix approach:** Add generated maskable and regular PNG icons (at least 192px and 512px), reference them in the manifest, and test installation on Android, iOS, and desktop browsers.

### External font dependency weakens offline performance

**Location:** `css/main.css:1`.

The stylesheet imports Google Fonts at runtime. The service worker does not pre-cache those cross-origin resources.

**Fix approach:** Self-host approved fonts or define a deliberately acceptable system-font fallback and test the offline visual state.

### Dead/unclear code signals

**Locations:** `js/app.js:5`, `js/app.js:344-345`, `js/app.js:587-594`, and `js/app.js:914-916`.

`parseLine` is imported but unused; `isCurrent` and `hasItems` are computed but unused; `window.AppState.selectStoreMode` is exposed globally while the normal UI uses event listeners.

**Fix approach:** Remove unused imports/variables and either replace the legacy global/inline interaction with event-bound controls or document the public API. Add linting to prevent recurrence.
