"""
HEB Mexico (heb.com.mx), VTEX platform.

robots.txt is permissive (Allow: /, only Disallow: /api/) -- unlike the
other VTEX stores here, HEB does NOT block /search, so their own search
box is a robots-compliant discovery mechanism (no sitemap juggling
needed). The catch is Incapsula: plain HTTP clients get a 403 on
virtually every path (confirmed on /, /sitemap.xml and a product page),
while an ordinary browser passes through cleanly -- so both discovery and
product fetches go through the browser fetcher.

JSON-LD ships as a Product node inside an @graph wrapper, with a genuine
gtin13 and a real numeric `price`.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from core import jsonld
from core.links import extract_links

STORE_ID = "heb"
DOMAIN = "www.heb.com.mx"
BASE_URL = f"https://{DOMAIN}"
PRODUCT_LINK_RE = re.compile(r"/p$")


def search_url(query: str) -> str:
    return f"{BASE_URL}/search?q={quote(query)}"


def discover_for_query(browser_fetcher, query: str, limit: int = 5) -> list[str]:
    # Search results render client-side after hydration (Next.js), so wait
    # for an actual product link rather than a fixed short delay.
    html = browser_fetcher.get(search_url(query), DOMAIN, wait_selector='a[href$="/p"]')
    if not html:
        return []
    return extract_links(html, PRODUCT_LINK_RE, BASE_URL, limit=limit)


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
