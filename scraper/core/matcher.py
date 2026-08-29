"""
Matches a scraped product name (whatever a retailer's JSON-LD called it)
back to one of our catalog's curated products. Retailer SKU/gtin fields
are unreliable across sites (Chedraui and Soriana expose internal SKUs
under "gtin"/"sku", not real EAN-13s), so name-based matching is the
primary, trustworthy signal -- this mirrors the alias-matching approach
js/parser.js already uses for free-text shopping lists, just in Python.

v1 of this matcher scored a full alias *phrase* appearing verbatim in the
scraped name as an automatic 0.8-0.9, regardless of what else was in that
phrase. That broke on generic, brand-free aliases: "garrafon de agua"
(from Bonafont's aliases) matched "Garrafón de Agua Natural **Epura**"
at 0.9, and "crema acida" (from a Lala product) matched "Crema Ácida
**Alpura**" the same way -- neither alias phrase carries a brand word, so
matching it proves nothing about *which* brand.

The fix isn't "detect the brand" (there's no brand field, and even the
aliases are inconsistent about including one) -- it's the flip side:
score how much of the *scraped* name is explained by this catalog
product, not just how much of the catalog phrasing shows up in the
scraped name. A leftover, unexplained content word ("epura", "alpura")
after accounting for units/sizes/common descriptors is exactly what a
wrong brand looks like, and is penalized hard.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Optional

from core.catalog import CatalogProduct

MATCH_THRESHOLD = 0.5

# Spanish function words -- never brand-carrying, never penalized as
# "unexplained".
STOPWORDS = {
    "de", "del", "al", "el", "la", "los", "las", "un", "una", "unos", "unas",
    "y", "o", "en", "con", "sin", "para", "por", "a",
}

# Packaging/measurement and common variant-descriptor words. Also not
# brand-carrying: two products can legitimately differ only by size or by
# a word like "light"/"entera" and still be the same underlying product
# line, so these shouldn't count against a match the way an unexplained
# proper noun (a different brand) should.
DESCRIPTOR_WORDS = {
    "ml", "l", "lt", "lts", "kg", "g", "gr", "grs", "kilo", "kilos",
    "litro", "litros", "pz", "pza", "pzas", "pieza", "piezas",
    "pack", "pqte", "paquete", "paquetes", "unidad", "unidades",
    "caja", "bolsa", "botella", "lata", "latas", "six", "sixpack",
    "rollo", "rollos", "hoja", "hojas", "bulto", "barra", "rebanadas",
    "frasco", "sobre", "sobres", "cartera", "garrafon",
    "entera", "deslactosada", "light", "clasico", "clasica", "original",
    "natural", "grande", "chico", "chica", "mediano", "mediana",
    "extra", "super", "especial", "tradicional",
}

# "400g", "6l", "2kg" -- a size/quantity token glued together with no
# space. Excluded from the "unexplained word" penalty for the same reason
# as DESCRIPTOR_WORDS: sizes vary legitimately between listings of the
# same product.
SIZE_TOKEN_RE = re.compile(r"^\d+[a-z]*$|^[a-z]+\d+$")


def normalize(text: str) -> str:
    text = text.lower()
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class MatchResult:
    product: Optional[CatalogProduct]
    score: float


def _is_ignorable(token: str) -> bool:
    return (
        len(token) <= 2
        or token in STOPWORDS
        or token in DESCRIPTOR_WORDS
        or bool(SIZE_TOKEN_RE.match(token))
    )


def match_product(scraped_name: str, catalog: list[CatalogProduct]) -> MatchResult:
    norm_name = normalize(scraped_name)
    name_tokens = set(norm_name.split())
    if not name_tokens:
        return MatchResult(None, 0.0)

    best_product: Optional[CatalogProduct] = None
    best_score = 0.0

    for product in catalog:
        vocab: set[str] = set()
        for term in (product.name, *product.aliases):
            vocab |= set(normalize(term).split())
        if not vocab:
            continue

        overlap = name_tokens & vocab
        forward = len(overlap) / len(vocab)          # how much of the catalog phrasing is present
        reverse = len(overlap) / len(name_tokens)     # how much of the scraped name is explained
        score = 2 * forward * reverse / (forward + reverse) if (forward + reverse) else 0.0

        # A full alias *phrase* appearing verbatim is a real signal on top
        # of the base score -- but a bonus, not an override, so it can no
        # longer single-handedly paper over a weak/wrong match.
        for alias in product.aliases:
            norm_alias = normalize(alias)
            word_count = len(norm_alias.split())
            if word_count >= 2 and norm_alias in norm_name:
                score = min(score + 0.1 * word_count, 0.97)

        # Brand guard: content words in the scraped name that this
        # product's own name/aliases never mention at all. One stray word
        # ("Alpura") is already enough to flag a different brand; two
        # ("Natural Epura") is a confident reject.
        unexplained = {t for t in (name_tokens - vocab) if not _is_ignorable(t)}
        if unexplained:
            score -= 0.3 * min(len(unexplained), 2)

        score = max(0.0, min(score, 1.0))

        if score > best_score:
            best_product, best_score = product, score

    if best_score < MATCH_THRESHOLD:
        return MatchResult(None, best_score)
    return MatchResult(best_product, best_score)
