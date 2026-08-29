# Price scraper

Refreshes reference prices for the app's product catalog (`js/data.js`)
by reading each retailer's own `<script type="application/ld+json">`
(schema.org `Product`/`Offer`) markup on their product pages. It never
touches `js/data.js` -- it writes a dated JSON report to `output/` for you
to review (or hand back to Claude) before merging anything into the app.

## Why it's built this way

Before writing any code, we fetched each store's `robots.txt` and a real
product page and checked what actually happens. Findings, store by store:

| Store | robots.txt | JSON-LD | Anti-bot | Discovery used |
|---|---|---|---|---|
| Walmart MX / Bodega Aurrera | `Disallow: /search` etc. Ships a product sitemap. | Server-rendered, has `gtin13`. | `/search` triggers an identity-verification challenge -- confirmed by hitting it, never attempted to solve it. | seed file, sitemap scan (capped) as fallback |
| Chedraui | `Disallow: /search` + every department listing path. Ships `product-N.xml` sitemaps (small). | Injected client-side (needs a real browser). | none seen on product pages | sitemap scan |
| HEB | `Allow: /`, only `Disallow: /api/`. | `Product` inside an `@graph`, real `gtin13`. | Incapsula blocks plain HTTP everywhere (even `robots.txt`/`sitemap.xml`), but passes an ordinary browser. | live search (`/search?q=`, robots-compliant) |
| Soriana | Permissive on product pages, blocks only account/checkout/wishlist paths. | Flat `Product` + `Offer`, real price. | Cloudflare blocks plain HTTP everywhere, but passes an ordinary browser. | live search (`/buscar?q=`, robots-compliant) |
| La Comer / Fresko | `Disallow: /` for every bot except a named allowlist (Googlebot, Bingbot...). | not checked | — | **not scraped** -- their policy explicitly excludes generic bots and that's respected here. |

Two fetch strategies follow directly from that table:

- **`StaticFetcher`** (`requests`) for Walmart/Aurrera and for fetching
  sitemap XML (Chedraui's sitemap.xml is plain-HTTP-friendly even though
  its product pages aren't).
- **`BrowserFetcher`** (Playwright/Chromium) for anywhere JSON-LD is
  client-rendered or a WAF blocks non-browser clients. This isn't evading
  anything -- it's the same page an ordinary visitor's browser gets: no
  CAPTCHA-solving, no fingerprint spoofing.

Both fetchers re-check `robots.txt` at runtime (`core/fetch.py:RobotsGuard`)
before every request, independent of the per-store notes above, and rate
limit sequentially per domain with jittered delays.

## Known limitation: HEB blocks scripted sessions after ~1 request

A single one-off HEB search/product fetch works fine. But testing showed
Incapsula blocks the *second* request in the same scripted browser
session with a challenge interstitial ("Request unsuccessful. Incapsula
incident ID...") -- even though it's the same ordinary-browser traffic
that passed for request #1. That's Incapsula's behavioral bot-management
doing exactly what it's for, and this project does not try to engineer
around active anti-bot measures (no retries-with-different-timing,
fingerprint changes, or proxies to dodge it).

`BrowserFetcher` detects the interstitial (`looks_like_block_page()`) and
trips a circuit breaker: once HEB blocks once, every further HEB request
in that run is skipped rather than hammering it, and it's reported
plainly in the output, not silently mistaken for "no results". In
practice this means **HEB is not reliable for batch runs** covering more
than a product or two per session -- treat matches from it as a bonus
when they land, not as something to depend on. Soriana (Cloudflare) is
comparatively more tolerant of a full run but is still the next most
fragile store.

## Setup

```bash
cd scraper
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m playwright install chromium
```

Requires Node.js on PATH too (`core/export_catalog.mjs` reads
`js/data.js` directly so the scraper and the app never carry two
diverging copies of the catalog).

## Running

```bash
.venv\Scripts\python -u run.py --store heb --store soriana
.venv\Scripts\python -u run.py --store chedraui --max-sitemap-files 8
.venv\Scripts\python -u run.py --all --limit 5
```

`-u` (unbuffered stdout) matters if you're piping output to a file or
watching it live -- otherwise Python only flushes progress logs once the
whole run finishes.

Output lands in `output/prices_<timestamp>.json`, one entry per scraped
offer:

```json
{
  "store_id": "heb",
  "product_id": "leche-lala-entera-1l",
  "match_score": 0.9,
  "scraped_name": "Leche Lala Entera 1 L",
  "price": 29.0,
  "currency": "MXN",
  "availability": "InStock",
  "source_url": "https://www.heb.com.mx/...",
  "scraped_at": "2026-08-29T18:04:11+00:00"
}
```

`product_id` is `null` when nothing in the catalog scored above the
match threshold (`core/matcher.py`) -- treat those as "found something,
but not confident it's the right product" rather than silently guessing.

## Seeding Walmart / Bodega Aurrera

Their `/search` is both `robots.txt`-disallowed and actively challenge-
walled, and their product sitemap is a huge, mostly-irrelevant general
marketplace catalog -- not worth crawling in bulk. Instead, browse
normally, copy a product URL, and add it to `seeds/aurrera.json` or
`seeds/walmart.json`:

```json
{
  "leche-lala-entera-1l": "https://www.walmart.com.mx/ip/leche-lala-entera-1l/00750102051347"
}
```

The scraper always tries seeds first; only unseeded products fall back to
a capped sitemap scan.

## Extending

Each store adapter in `stores/` exposes `discover*()` + `parse_product()`
and stays under ~60 lines by leaning on `core/jsonld.py` (shape-agnostic
Product/Offer extraction), `core/matcher.py` (name matching against
catalog aliases) and `core/links.py`. Adding a new store means writing one
new adapter file, not touching the core.
