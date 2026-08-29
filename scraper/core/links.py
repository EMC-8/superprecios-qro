"""Extracts candidate product-detail-page links from a search results page."""
from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup


def extract_links(html: str, pattern: re.Pattern, base_url: str, limit: int = 5) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    seen: set[str] = set()
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not pattern.search(href):
            continue
        url = urljoin(base_url, href)
        if url in seen:
            continue
        seen.add(url)
        out.append(url)
        if len(out) >= limit:
            break
    return out
