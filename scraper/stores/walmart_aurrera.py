"""
Walmart Supercenter (walmart.com.mx) and Bodega Aurrera (bodegaaurrera.com.mx).

Both run the same platform and mirror the same /ip/<slug>/<sku> product URL
structure on their own domains (confirmed by recon: bodegaaurrera.com.mx
serves its own PDP for the same SKU rather than redirecting to Walmart).
JSON-LD is server-rendered as a flat Product with an `offers` array and a
usable `gtin13`.

robots.txt on both domains disallows /search, /cart, /account, /checkout,
/wallet, /thankyou -- and hitting /search in practice triggers an identity
verification challenge, confirming that's a hard boundary, not just a
courtesy request. Their product sitemap is enormous (20+ files, ~20MB
each) and dominated by unrelated marketplace inventory (clothes, pet
supplies...), so full-catalog sitemap scanning is capped hard by default;
seeds.json is the practical way to pin exact URLs for our 18 products.
"""
from __future__ import annotations

import json
from pathlib import Path

from core import jsonld
from core.catalog import CatalogProduct
from core.sitemap import discover_via_sitemaps

SEEDS_FILE = Path(__file__).parent.parent / "seeds"


def make_config(store_id: str, domain: str, sitemap_index: str) -> dict:
    return {
        "store_id": store_id,
        "domain": domain,
        "fetcher_kind": "static",
        "base_url": f"https://{domain}",
        "sitemap_index_url": sitemap_index,
        "seeds_file": SEEDS_FILE / f"{store_id}.json",
    }


AURRERA = make_config(
    "aurrera", "www.bodegaaurrera.com.mx", "https://www.bodegaaurrera.com.mx/siteindex.xml"
)
WALMART = make_config(
    "walmart", "www.walmart.com.mx", "https://www.walmart.com.mx/siteindex.xml"
)


def load_seeds(config: dict) -> dict[str, str]:
    path = config["seeds_file"]
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def discover(config: dict, fetcher, catalog: list[CatalogProduct], max_sitemap_files: int = 3) -> dict[str, list[str]]:
    """product_id -> candidate URLs. Seeds first (exact, free); sitemap scan
    fills in the rest, capped, for products with no seed yet."""
    seeds = load_seeds(config)
    candidates: dict[str, list[str]] = {p.id: [] for p in catalog}
    for pid, url in seeds.items():
        if pid in candidates:
            candidates[pid].append(url)

    unseeded = [p for p in catalog if not candidates.get(p.id)]
    if unseeded and max_sitemap_files > 0:
        index_text = fetcher.get(config["sitemap_index_url"], config["domain"])
        if index_text:
            from core.sitemap import extract_locs

            sitemap_files = [u for u in extract_locs(index_text) if "productSitemap" in u or "product" in u.lower()]
            result = discover_via_sitemaps(
                fetcher, config["domain"], sitemap_files, unseeded, max_files=max_sitemap_files
            )
            for pid, urls in result.matches.items():
                candidates[pid].extend(urls)
            print(
                f"  [{config['store_id']}] sitemap scan: {result.files_scanned} files, "
                f"{result.bytes_scanned / 1e6:.1f}MB, {sum(len(v) for v in result.matches.values())} candidate URLs"
            )

    return {pid: urls for pid, urls in candidates.items() if urls}


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
