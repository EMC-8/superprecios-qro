"""
Loads the app's own product catalog (js/data.js) as plain Python data,
via a small Node.js bridge script (export_catalog.mjs). This keeps the
scraper and the app sharing a single source of truth for product names,
aliases and EAN codes -- nothing is hand-duplicated in Python.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

CORE_DIR = Path(__file__).parent
EXPORT_SCRIPT = CORE_DIR / "export_catalog.mjs"


@dataclass
class CatalogProduct:
    id: str
    ean: str
    name: str
    category: str
    unit: str
    aliases: list[str] = field(default_factory=list)
    official_registry_url: Optional[str] = None
    reference_prices: dict[str, float] = field(default_factory=dict)

    @property
    def search_terms(self) -> list[str]:
        """Alias list plus the canonical name, used both for querying store
        search boxes and for scoring matches against scraped product names."""
        return [self.name, *self.aliases]


def load_catalog() -> list[CatalogProduct]:
    if shutil.which("node") is None:
        raise RuntimeError(
            "Node.js is required to read js/data.js (the app's catalog) but "
            "was not found on PATH. Install Node or point NODE_BIN at it."
        )
    result = subprocess.run(
        ["node", str(EXPORT_SCRIPT)],
        cwd=CORE_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"export_catalog.mjs failed:\n{result.stderr}")
    raw = json.loads(result.stdout)
    products = []
    for p in raw["products"]:
        products.append(
            CatalogProduct(
                id=p["id"],
                ean=p.get("ean", ""),
                name=p["name"],
                category=p.get("category", ""),
                unit=p.get("unit", ""),
                aliases=p.get("aliases", []),
                official_registry_url=p.get("officialRegistryUrl"),
                reference_prices=p.get("prices", {}),
            )
        )
    return products


if __name__ == "__main__":
    for product in load_catalog():
        print(f"{product.id:45s} EAN={product.ean:14s} {product.name}")
