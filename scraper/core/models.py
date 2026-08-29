from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class ScrapedOffer:
    store_id: str
    product_id: Optional[str]
    match_score: float
    scraped_name: str
    price: Optional[float]
    currency: Optional[str]
    availability: Optional[str]
    source_url: str
    scraped_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return {
            "store_id": self.store_id,
            "product_id": self.product_id,
            "match_score": round(self.match_score, 3),
            "scraped_name": self.scraped_name,
            "price": self.price,
            "currency": self.currency,
            "availability": self.availability,
            "source_url": self.source_url,
            "scraped_at": self.scraped_at,
        }
