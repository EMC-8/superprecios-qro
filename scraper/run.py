"""
CLI entrypoint. Orchestrates discovery + fetch + JSON-LD parse + matching
for one or more stores and writes a dated JSON report to output/. Never
touches js/data.js directly -- review the report and merge prices by hand
(or ask Claude to do it) once you trust a run.

Examples:
    python run.py --store aurrera --store walmart
    python run.py --store chedraui --max-sitemap-files 8
    python run.py --all --limit 5
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from core.catalog import load_catalog
from core.fetch import BrowserFetcher, RateLimiter, RobotsGuard, StaticFetcher
from core.matcher import match_product
from core.models import ScrapedOffer
from stores import chedraui, heb, soriana, walmart_aurrera

OUTPUT_DIR = Path(__file__).parent / "output"
ALL_STORES = ["aurrera", "walmart", "chedraui", "heb", "soriana"]


def scrape_walmart_family(config: dict, catalog, static_fetcher, max_sitemap_files: int) -> list[ScrapedOffer]:
    offers: list[ScrapedOffer] = []
    candidates = walmart_aurrera.discover(config, static_fetcher, catalog, max_sitemap_files=max_sitemap_files)
    if not candidates:
        print(f"  [{config['store_id']}] no candidate URLs (seed the store's seeds/*.json to fix this)")
        return offers
    catalog_by_id = {p.id: p for p in catalog}
    for product_id, urls in candidates.items():
        for url in urls[:2]:
            html = static_fetcher.get(url, config["domain"])
            if not html:
                continue
            parsed = walmart_aurrera.parse_product(html)
            if not parsed or not parsed.get("name"):
                continue
            result = match_product(parsed["name"], [catalog_by_id[product_id]])
            offers.append(
                ScrapedOffer(
                    store_id=config["store_id"],
                    product_id=product_id if result.product else None,
                    match_score=result.score,
                    scraped_name=parsed["name"],
                    price=parsed.get("price"),
                    currency=parsed.get("currency"),
                    availability=parsed.get("availability"),
                    source_url=url,
                )
            )
    return offers


def scrape_chedraui(catalog, static_fetcher, browser_fetcher, max_sitemap_files: int) -> list[ScrapedOffer]:
    offers: list[ScrapedOffer] = []
    candidates = chedraui.discover(static_fetcher, catalog, max_sitemap_files=max_sitemap_files)
    if not candidates:
        print("  [chedraui] no candidate URLs found via sitemap scan")
        return offers
    catalog_by_id = {p.id: p for p in catalog}
    for product_id, urls in candidates.items():
        for url in urls[:2]:
            html = chedraui.fetch_product(browser_fetcher, url)
            if not html:
                continue
            parsed = chedraui.parse_product(html)
            if not parsed or not parsed.get("name"):
                continue
            result = match_product(parsed["name"], [catalog_by_id[product_id]])
            offers.append(
                ScrapedOffer(
                    store_id=chedraui.STORE_ID,
                    product_id=product_id if result.product else None,
                    match_score=result.score,
                    scraped_name=parsed["name"],
                    price=parsed.get("price"),
                    currency=parsed.get("currency"),
                    availability=parsed.get("availability"),
                    source_url=url,
                )
            )
    return offers


def scrape_via_search(store_module, catalog, browser_fetcher, limit_products: int, results_per_query: int) -> list[ScrapedOffer]:
    offers: list[ScrapedOffer] = []
    for product in catalog[:limit_products] if limit_products else catalog:
        # Try queries most-specific-first ("leche lala 1l" narrows a
        # store's search far better than the generic "leche" that's
        # usually aliases[0], and generic queries are exactly what
        # produced wrong-brand false matches during testing) but fall back
        # to shorter ones -- some stores' search is strict enough that an
        # exact "brand + size" phrase returns nothing where "leche lala"
        # alone would have. Capped at 3 tries to stay polite.
        named_aliases = [a for a in product.aliases if not a.isdigit()]
        by_specificity = sorted(set(named_aliases), key=lambda a: len(a.split()), reverse=True)
        most_generic = min(named_aliases, key=lambda a: len(a.split())) if named_aliases else product.name
        # two most specific phrases first (best precision), but always end
        # with the most generic alias and the full product name so a
        # store with strict/literal search still turns up *something* to
        # run the name-matcher against.
        queries = list(dict.fromkeys([*by_specificity[:2], most_generic, product.name]))[:4]
        urls: list[str] = []
        used_query = None
        for query in queries:
            urls = store_module.discover_for_query(browser_fetcher, query, limit=results_per_query)
            if urls:
                used_query = query
                break
        if not urls:
            print(f"  [{store_module.STORE_ID}] no results for {queries}")
            continue
        query = used_query
        for url in urls:
            html = store_module.fetch_product(browser_fetcher, url)
            if not html:
                continue
            parsed = store_module.parse_product(html)
            if not parsed or not parsed.get("name"):
                continue
            result = match_product(parsed["name"], [product])
            offers.append(
                ScrapedOffer(
                    store_id=store_module.STORE_ID,
                    product_id=product.id if result.product else None,
                    match_score=result.score,
                    scraped_name=parsed["name"],
                    price=parsed.get("price"),
                    currency=parsed.get("currency"),
                    availability=parsed.get("availability"),
                    source_url=url,
                )
            )
    return offers


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--store", action="append", choices=ALL_STORES, dest="stores", help="repeatable")
    parser.add_argument("--all", action="store_true", help="scrape every supported store")
    parser.add_argument("--limit", type=int, default=None, help="cap how many catalog products to look up (search-based stores)")
    parser.add_argument("--results-per-query", type=int, default=3)
    parser.add_argument("--max-sitemap-files", type=int, default=3, help="cap per-store sitemap files scanned")
    parser.add_argument("--headless", action="store_true", default=True)
    parser.add_argument("--show-browser", dest="headless", action="store_false", help="watch Playwright work")
    args = parser.parse_args()

    stores = args.stores or (ALL_STORES if args.all else [])
    if not stores:
        parser.error("pass --store <name> (repeatable) or --all")

    catalog = load_catalog()
    print(f"Loaded {len(catalog)} catalog products from js/data.js\n")

    rate_limiter = RateLimiter()
    robots = RobotsGuard()
    static_fetcher = StaticFetcher(rate_limiter, robots)
    browser_fetcher = None
    needs_browser = any(s in stores for s in ("chedraui", "heb", "soriana"))
    if needs_browser:
        browser_fetcher = BrowserFetcher(rate_limiter, robots, headless=args.headless)

    all_offers: list[ScrapedOffer] = []
    try:
        for store_id in stores:
            print(f"=== {store_id} ===")
            if store_id == "aurrera":
                all_offers += scrape_walmart_family(walmart_aurrera.AURRERA, catalog, static_fetcher, args.max_sitemap_files)
            elif store_id == "walmart":
                all_offers += scrape_walmart_family(walmart_aurrera.WALMART, catalog, static_fetcher, args.max_sitemap_files)
            elif store_id == "chedraui":
                all_offers += scrape_chedraui(catalog, static_fetcher, browser_fetcher, args.max_sitemap_files)
            elif store_id == "heb":
                all_offers += scrape_via_search(heb, catalog, browser_fetcher, args.limit, args.results_per_query)
            elif store_id == "soriana":
                all_offers += scrape_via_search(soriana, catalog, browser_fetcher, args.limit, args.results_per_query)
            print()
    finally:
        static_fetcher.close()
        if browser_fetcher:
            browser_fetcher.close()

    OUTPUT_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_path = OUTPUT_DIR / f"prices_{timestamp}.json"
    out_path.write_text(
        json.dumps([o.to_dict() for o in all_offers], ensure_ascii=False, indent=2), encoding="utf-8"
    )

    matched = [o for o in all_offers if o.product_id]
    print(f"--- {len(all_offers)} offers scraped, {len(matched)} matched to a catalog product ---")
    print(f"Report written to {out_path.relative_to(Path.cwd()) if out_path.is_relative_to(Path.cwd()) else out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
