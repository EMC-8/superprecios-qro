"""
Sitemap-based product discovery, used where a store's own search endpoint
is off-limits (robots.txt Disallow: /search) but it publishes a product
sitemap instead -- which is precisely what sitemaps are for. Bounded by
max_files/max_bytes so a run never silently downloads an entire multi-GB
catalog (Bodega Aurrera alone ships 20+ files at ~20MB each).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from core.catalog import CatalogProduct
from core.matcher import normalize

LOC_RE = re.compile(r"<loc>([^<]+)</loc>")


def extract_locs(xml_text: str) -> list[str]:
    return LOC_RE.findall(xml_text)


@dataclass
class SitemapDiscoveryResult:
    matches: dict[str, list[str]]  # product_id -> candidate URLs
    files_scanned: int
    bytes_scanned: int


def discover_via_sitemaps(
    fetcher,
    domain_key: str,
    sitemap_urls: list[str],
    catalog: list[CatalogProduct],
    max_files: int = 4,
    max_bytes: int = 80_000_000,
) -> SitemapDiscoveryResult:
    keyword_sets: dict[str, set[str]] = {}
    for product in catalog:
        aliases = [normalize(a) for a in product.search_terms]
        aliases = [a for a in aliases if a and not a.isdigit()]
        # URL slugs hyphenate spaces, so a multi-word alias becomes one
        # highly specific substring ("leche-lala-entera"), which is what
        # we match on when we have one. A lone generic word ("leche",
        # "agua") is a terrible signal against a huge, unrelated general
        # marketplace catalog -- it matches incidental mentions ("taza de
        # te y cafe *con leche*") far more often than the actual product
        # -- so it's only used as a last resort when a product has no
        # multi-word alias at all.
        phrases = {a.replace(" ", "-") for a in aliases if " " in a}
        keyword_sets[product.id] = phrases or {a for a in aliases if len(a) > 4}

    matches: dict[str, list[str]] = {pid: [] for pid in keyword_sets}
    files_scanned = 0
    bytes_scanned = 0

    for sitemap_url in sitemap_urls:
        if files_scanned >= max_files or bytes_scanned >= max_bytes:
            break
        print(f"  scanning sitemap: {sitemap_url}")
        text = fetcher.get(sitemap_url, domain_key)
        if text is None:
            continue
        files_scanned += 1
        bytes_scanned += len(text)
        for loc in extract_locs(text):
            slug = normalize(loc)
            for pid, tokens in keyword_sets.items():
                if any(tok in slug for tok in tokens):
                    matches[pid].append(loc)
        if bytes_scanned >= max_bytes:
            break

    return SitemapDiscoveryResult(matches=matches, files_scanned=files_scanned, bytes_scanned=bytes_scanned)
