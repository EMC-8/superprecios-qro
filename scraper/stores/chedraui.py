"""
Chedraui / Chedraui Selecto (chedraui.com.mx), VTEX platform.

robots.txt disallows /search and every department listing path (a long,
explicit list of category names) but not individual /<slug>-<id>/p product
pages -- and publishes clean per-type sitemaps (product-N.xml, small,
~100-200KB each), which is exactly how a bot is meant to discover their
catalog. JSON-LD (Product + AggregateOffer, real `price`, `gtin` -- though
that gtin is Chedraui's own internal SKU, not a real EAN-13) is injected
client-side, so product pages need the browser fetcher even though the
sitemap itself fetches fine over plain HTTP.
"""
from __future__ import annotations

import re

from core import jsonld
from core.catalog import CatalogProduct
from core.sitemap import discover_via_sitemaps, extract_locs

STORE_ID = "chedraui"
DOMAIN = "www.chedraui.com.mx"
BASE_URL = f"https://{DOMAIN}"
SITEMAP_INDEX_URL = f"{BASE_URL}/sitemap.xml"
PRODUCT_SITEMAP_RE = re.compile(r"/sitemap/product-\d+\.xml$")


def discover(static_fetcher, catalog: list[CatalogProduct], max_sitemap_files: int = 6) -> dict[str, list[str]]:
    index_text = static_fetcher.get(SITEMAP_INDEX_URL, DOMAIN)
    if not index_text:
        return {}
    all_locs = extract_locs(index_text)
    product_sitemaps = [u for u in all_locs if PRODUCT_SITEMAP_RE.search(u)]
    result = discover_via_sitemaps(
        static_fetcher, DOMAIN, product_sitemaps, catalog, max_files=max_sitemap_files
    )
    print(
        f"  [{STORE_ID}] sitemap scan: {result.files_scanned} files, "
        f"{result.bytes_scanned / 1e6:.1f}MB, {sum(len(v) for v in result.matches.values())} candidate URLs"
    )
    return {pid: urls for pid, urls in result.matches.items() if urls}


def fetch_product(browser_fetcher, url: str) -> str | None:
    return browser_fetcher.get(url, DOMAIN, wait_selector='script[type="application/ld+json"]')


def parse_product(html: str) -> dict:
    blocks = jsonld.extract_ldjson_blocks(html)
    products = jsonld.find_products(blocks)
    if not products:
        return {}
    product = products[0]
    offer = jsonld.extract_offer(product)
    return {
        "name": product.get("name"),
        "gtin": jsonld.extract_gtin(product),
        "sku": product.get("sku"),
        **offer,
    }
