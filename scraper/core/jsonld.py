"""
Generic extraction of <script type="application/ld+json"> blocks and of
schema.org Product/Offer data from them. Deliberately store-agnostic: each
retailer shapes its JSON-LD a little differently (a flat Product, a
Product wrapped in an @graph, an AggregateOffer with nested Offers, an
Offer array...) and this module absorbs those differences so store
adapters stay tiny.
"""
from __future__ import annotations

import json
from typing import Any, Optional

from bs4 import BeautifulSoup


def extract_ldjson_blocks(html: str) -> list[dict]:
    """Parse every ld+json <script> tag on the page and flatten @graph
    wrappers and top-level arrays into one list of JSON-LD node dicts."""
    soup = BeautifulSoup(html, "lxml")
    blocks: list[dict] = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = tag.string or tag.get_text()
        if not raw or not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        _collect_nodes(data, blocks)
    return blocks


def _collect_nodes(data: Any, out: list[dict]) -> None:
    if isinstance(data, list):
        for item in data:
            _collect_nodes(item, out)
        return
    if not isinstance(data, dict):
        return
    if "@graph" in data and isinstance(data["@graph"], list):
        for item in data["@graph"]:
            _collect_nodes(item, out)
        # the wrapper itself rarely carries useful fields, but keep it too
        # in case a store puts Product fields alongside @graph.
    out.append(data)


def find_products(blocks: list[dict]) -> list[dict]:
    return [b for b in blocks if b.get("@type") == "Product"]


def extract_offer(product: dict) -> dict:
    """Returns {price, currency, availability, seller} pulled defensively
    out of whatever shape `offers` has (Offer, [Offer], AggregateOffer with
    nested offers[])."""
    offers = product.get("offers")
    offer = _first_offer(offers)
    if offer is None:
        return {"price": None, "currency": None, "availability": None, "seller": None}

    price = _to_float(offer.get("price"))
    if price is None:
        price = _to_float(offer.get("lowPrice"))

    availability = offer.get("availability")
    if availability:
        availability = availability.rsplit("/", 1)[-1]  # "https://schema.org/InStock" -> "InStock"

    seller = offer.get("seller", {})
    return {
        "price": price,
        "currency": offer.get("priceCurrency"),
        "availability": availability,
        "seller": seller.get("name") if isinstance(seller, dict) else None,
    }


def _first_offer(offers: Any) -> Optional[dict]:
    if offers is None:
        return None
    if isinstance(offers, list):
        return offers[0] if offers else None
    if isinstance(offers, dict):
        if offers.get("@type") == "AggregateOffer":
            nested = offers.get("offers")
            nested_first = _first_offer(nested)
            if nested_first is not None:
                return nested_first
            # AggregateOffer with no nested Offer list: synthesize one from
            # lowPrice so extract_offer() still finds a price.
            return offers
        return offers
    return None


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def extract_gtin(product: dict) -> Optional[str]:
    for field in ("gtin13", "gtin14", "gtin12", "gtin8", "gtin"):
        value = product.get(field)
        if value:
            return str(value)
    return None
