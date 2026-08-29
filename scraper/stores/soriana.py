"""
Soriana Hiper (soriana.com), Salesforce Commerce Cloud.

robots.txt (only fetchable through a real browser -- even robots.txt
itself 403s plain curl) disallows account/checkout/wishlist paths but not
/buscar, so their search is fair game. Cloudflare bot management blocks
plain HTTP clients everywhere else too, so both discovery and product
fetches use the browser fetcher -- of everything scraped here this is the
most fragile store, since Cloudflare's heuristics can tighten at any time.

JSON-LD is a clean, server-rendered-by-the-time-the-browser-settles flat
Product + Offer with a real numeric `price`. sku/mpn are Soriana's own
internal codes, not EAN-13s -- interestingly the product image filename
often embeds the real EAN (e.g. ..._7501020565997_A.jpg) but that's a
brittle, undocumented convention so it's not relied on here.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from core import jsonld
from core.links import extract_links

STORE_ID = "soriana"
DOMAIN = "www.soriana.com"
BASE_URL = f"https://{DOMAIN}"
PRODUCT_LINK_RE = re.compile(r"/[a-z0-9\-]+/\d+\.html$", re.I)


def search_url(query: str) -> str:
    return f"{BASE_URL}/buscar?q={quote(query)}"


def discover_for_query(browser_fetcher, query: str, limit: int = 5) -> list[str]:
    html = browser_fetcher.get(search_url(query), DOMAIN, wait_selector='a[href*=".html"]')
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
