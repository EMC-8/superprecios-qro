"""
Matches a scraped product name (whatever a retailer's JSON-LD called it)
back to one of our catalog's 18 curated products. Retailer SKU/gtin fields
are unreliable across sites (Chedraui and Soriana expose internal SKUs
under "gtin"/"sku", not real EAN-13s), so name-based matching is the
primary, trustworthy signal -- this mirrors the alias-matching approach
js/parser.js already uses for free-text shopping lists, just in Python.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

from core.catalog import CatalogProduct

MATCH_THRESHOLD = 0.5


def normalize(text: str) -> str:
    text = text.lower()
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class MatchResult:
    product: Optional[CatalogProduct]
    score: float


def match_product(scraped_name: str, catalog: list[CatalogProduct]) -> MatchResult:
    norm_name = normalize(scraped_name)
    name_tokens = set(norm_name.split())
    if not name_tokens:
        return MatchResult(None, 0.0)

    best_product: Optional[CatalogProduct] = None
    best_score = 0.0

    for product in catalog:
        alias_tokens: set[str] = set()
        for alias in product.search_terms:
            alias_tokens |= set(normalize(alias).split())
        if not alias_tokens:
            continue

        overlap = name_tokens & alias_tokens
        score = len(overlap) / len(alias_tokens)

        # A full alias *phrase* appearing verbatim in the scraped name is a
        # much stronger signal than loose token overlap -- but only for
        # multi-word aliases ("leche lala", "huevo san juan"). A single
        # generic word ("leche", "huevo") matching is not a meaningful
        # signal on its own: "Six Pack Leche Entera Valley Foods" contains
        # "leche" too, but it's a different brand and pack size entirely.
        for alias in product.aliases:
            norm_alias = normalize(alias)
            word_count = len(norm_alias.split())
            if word_count >= 2 and norm_alias in norm_name:
                score = max(score, min(0.6 + 0.1 * word_count, 0.95))

        if score > best_score:
            best_product, best_score = product, score

    if best_score < MATCH_THRESHOLD:
        return MatchResult(None, best_score)
    return MatchResult(best_product, best_score)
