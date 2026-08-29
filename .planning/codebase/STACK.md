# Technology Stack

**Analysis date:** 2026-08-29

## Runtime and delivery

- The application is a static, client-side Progressive Web App. `index.html` loads the application as a browser ES module with `<script type="module" src="js/app.js">`; no server runtime is present.
- Use standards-based HTML, CSS, and modern browser JavaScript (ES modules). The JavaScript modules are in `js/` and communicate through explicit `import`/`export` statements, such as the imports in `js/app.js`.
- No `package.json`, lockfile, dependency manifest, build configuration, or transpiler configuration is present. Keep the current code directly runnable from a static HTTP server unless a planned migration deliberately adds a build system.
- `README.md` documents static local serving through `python -m http.server 8080` or `npx serve .`; the service worker requires an HTTP(S) origin rather than opening the file directly.
- Deployment automation is GitHub Actions + GitHub Pages in `.github/workflows/deploy-pages.yml`. It packages the repository root with `actions/upload-pages-artifact@v3` and deploys using `actions/deploy-pages@v4`. The workflow is manual-only (`workflow_dispatch`).

## Frontend composition

- `index.html` is the single application shell. It supplies the five tab panes and stable DOM IDs that `js/app.js` renders into.
- `css/main.css` contains the visual system and `css/responsive.css` carries responsive overrides. `css/main.css` imports the Outfit and Plus Jakarta Sans web fonts from Google Fonts.
- `js/app.js` is the UI controller and in-memory state owner. It orchestrates rendering, list editing, tab navigation, checkout handoff, and WhatsApp sharing.
- `js/data.js` is the in-repository catalogue/configuration source: supermarket metadata, Querétaro branch labels, product aliases, GTIN/EAN values, and price samples.
- `js/parser.js` converts free-text shopping lists to catalogued or custom list items. `js/optimizer.js` calculates the store allocation strategies from the local price data.
- `js/checkout.js` serializes a shared basket into the URL fragment, restores shared baskets, produces official retailer search links, and uses the Clipboard API with a `document.execCommand('copy')` fallback.

## PWA and browser platform

- `manifest.webmanifest` defines standalone display, app metadata, theme colors, and the SVG icon at `assets/icons/icon.svg`.
- `js/pwa.js` registers `sw.js`, handles the browser `beforeinstallprompt` flow, and reflects `navigator.onLine` status in the UI.
- `sw.js` implements the offline shell. It pre-caches static application assets under `CACHE_NAME = 'superprecios-qro-v4'`, clears older caches on activation, and uses network-first with cache fallback for fetches.
- Persisted customer state is browser-local only: `js/app.js` reads and writes the shopping list and checked items through `localStorage` keys `superprecios_qro_list_v1` and `superprecios_qro_checked_v1`.

## Data and services

- No database, API server, authentication provider, analytics SDK, payment provider, or direct retailer cart API is implemented.
- The product catalogue and prices are static JavaScript data in `js/data.js`; `LAST_VERIFICATION_DATE` is maintained there. Price optimization therefore works completely offline after the app shell is cached.
- `README.md` identifies Supabase/PostgreSQL and ticket OCR through Gemini Vision as future work only. Do not treat either as an installed dependency or configured integration.

## Developer guidance

- Add application behavior as native ES modules in `js/` and load them through imports from `js/app.js`; avoid introducing globals.
- When changing client assets, update the pre-cache list and cache version in `sw.js` so installed copies receive the new asset set.
- Any database, scraper, or API integration needs a separate backend or controlled provider layer: this static site cannot safely store service credentials.
