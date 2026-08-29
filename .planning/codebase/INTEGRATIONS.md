# External Integrations

**Analysis date:** 2026-08-29

## Retailer handoff links

Retailer connectivity is outbound browser navigation only. `js/data.js` stores a `searchUrl(query)` function per retailer, while `js/checkout.js` derives official store and product-search URLs. The application does not authenticate with retailers, scrape them, query their catalog APIs, add items to remote carts, or determine service availability.

- **Bodega Aurrera:** `https://www.bodegaaurrera.com.mx/search?q=...` from `js/data.js`.
- **Chedraui:** `https://www.chedraui.com.mx/search?q=...` from `js/data.js`.
- **Walmart México:** `https://www.walmart.com.mx/search?q=...` from `js/data.js`.
- **Soriana:** `https://www.soriana.com/buscar?q=...` from `js/data.js`.
- **La Comer / Fresko:** `https://www.lacomer.com.mx/lacomer/` from `js/data.js`; it currently opens the store landing page rather than a query-specific search.
- **HEB México:** `https://www.heb.com.mx/catalogsearch/result/?q=...` from `js/data.js`.

`renderCheckoutStore` in `js/app.js` presents these handoffs in a new tab using `target="_blank" rel="noopener noreferrer"`. It also offers copyable lists. The delivery/pickup selector is a customer preference carried in generated text only; each retailer's official site is the authority for branch, stock, coverage, fulfillment method, and final charges.

## Product reference links

- Each catalogue item in `js/data.js` includes an `officialRegistryUrl` to its Open Food Facts product record at `https://world.openfoodfacts.org/product/<ean>`.
- These are reference URLs stored in local data. The app does not call the Open Food Facts API at runtime.

## Sharing and browser services

- `js/app.js` opens `https://api.whatsapp.com/send?text=...` to let the user share a purchase route or list through WhatsApp. This is a browser handoff, with no WhatsApp API credential, webhook, or server-side messaging integration.
- `js/checkout.js` creates shareable baskets by encoding selected item fields into `#cart=...` in the current URL. The fragment is interpreted locally by `readSharedCart()` and is not sent to a backend as part of a request.
- `js/checkout.js` uses `navigator.clipboard.writeText()` where available and falls back to `document.execCommand('copy')` for copying a retailer-specific list or share link.
- `js/pwa.js`, `manifest.webmanifest`, and `sw.js` integrate with native browser PWA APIs: Service Worker, Cache Storage, `beforeinstallprompt`, network status events, and app-install affordances.
- `js/app.js` persists customer state via `localStorage`; data stays in the current browser profile and is neither synchronized nor backed up by the application.

## Hosted assets and deployment

- `css/main.css` imports Google-hosted Outfit and Plus Jakarta Sans fonts from `https://fonts.googleapis.com`. Offline rendering falls back to local CSS font fallbacks after the application shell is cached.
- `.github/workflows/deploy-pages.yml` integrates with GitHub Actions and GitHub Pages. It requires repository Pages enablement and the permissions declared in that workflow; deployment is not triggered automatically on push.

## Integration boundaries for future work

- `README.md` proposes future Supabase/PostgreSQL history storage, retailer data collection with a Querétaro postal code, camera barcode scanning, and Gemini Vision ticket OCR. These are not implemented and have no configured endpoint, key, environment variable, or SDK in the repository.
- Any retailer-cart or price-ingestion work must use an approved retailer integration or a compliant backend. Do not claim zero-cost delivery/pickup or create a remote cart from this static client without retailer-supported APIs and fulfillment validation.
