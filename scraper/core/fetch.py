"""
Fetching layer. Two strategies, chosen per store based on recon findings
(see scraper/README.md):

- StaticFetcher: plain HTTP via `requests`. Works for stores whose JSON-LD
  is server-rendered and that don't run bot-management middleware on
  product pages (Walmart MX / Bodega Aurrera, Chedraui's sitemaps).
- BrowserFetcher: real Chromium via Playwright. Needed wherever JSON-LD is
  injected client-side (Chedraui product pages) or the site runs
  Incapsula/Cloudflare-style bot management that 403s plain HTTP clients
  but passes an ordinary browser (HEB, Soriana).

Both strategies:
- honor robots.txt for the domain being fetched (RobotsGuard), refusing to
  fetch disallowed paths rather than trying to route around them;
- rate-limit sequentially per domain, with jittered delays -- this is a
  personal reference-price tool, not a crawler, and these are third-party
  sites we don't own.
"""
from __future__ import annotations

import random
import time
import urllib.robotparser
from typing import Optional
from urllib.parse import urlparse

import requests

# Markers of a bot-management interstitial (Incapsula, Cloudflare) rather
# than real page content. When we see one, we stop and report it plainly
# instead of trying another delay/header/fingerprint to get past it, and
# instead of silently treating the block page as "no results found" --
# see scraper/README.md "Known limitations".
BLOCK_PAGE_MARKERS = (
    "Incapsula_Resource",
    "Request unsuccessful",
    "Attention Required! | Cloudflare",
    "cf-error-details",
)


def looks_like_block_page(html: str) -> bool:
    return len(html) < 20_000 and any(marker in html for marker in BLOCK_PAGE_MARKERS)


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
}


class RateLimiter:
    """Sequential, jittered delay per domain key. Not thread-safe (the
    scraper is intentionally single-threaded -- politeness over speed)."""

    def __init__(self, min_delay: float = 1.5, max_delay: float = 3.0):
        self.min_delay = min_delay
        self.max_delay = max_delay
        self._last: dict[str, float] = {}

    def wait(self, key: str) -> None:
        now = time.monotonic()
        last = self._last.get(key)
        delay = random.uniform(self.min_delay, self.max_delay)
        if last is not None:
            elapsed = now - last
            if elapsed < delay:
                time.sleep(delay - elapsed)
        self._last[key] = time.monotonic()


class RobotsGuard:
    """Fetches and caches robots.txt per domain and answers can_fetch().
    Falls back to "allow" only if robots.txt itself is unreachable through
    every available fetch strategy (e.g. genuinely offline), never on a
    real disallow rule."""

    def __init__(self):
        self._parsers: dict[str, urllib.robotparser.RobotFileParser] = {}

    def _get_parser(self, origin: str, robots_text: Optional[str]) -> urllib.robotparser.RobotFileParser:
        if origin not in self._parsers:
            parser = urllib.robotparser.RobotFileParser()
            if robots_text is not None:
                parser.parse(robots_text.splitlines())
            else:
                parser.disallow_all = False
            self._parsers[origin] = parser
        return self._parsers[origin]

    def can_fetch(self, url: str, robots_text: Optional[str]) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        parser = self._get_parser(origin, robots_text)
        return parser.can_fetch(USER_AGENT, url)


class StaticFetcher:
    kind = "static"

    def __init__(self, rate_limiter: RateLimiter, robots: RobotsGuard, timeout: int = 15):
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.rate_limiter = rate_limiter
        self.robots = robots
        self.timeout = timeout

    def _fetch_robots(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        try:
            resp = self.session.get(robots_url, timeout=self.timeout)
            return resp.text if resp.status_code == 200 else None
        except requests.RequestException:
            return None

    def get(self, url: str, domain_key: str) -> Optional[str]:
        robots_text = self._fetch_robots(url)
        if not self.robots.can_fetch(url, robots_text):
            print(f"  x robots.txt disallows {url} -- skipping")
            return None
        self.rate_limiter.wait(domain_key)
        try:
            resp = self.session.get(url, timeout=self.timeout)
        except requests.RequestException as exc:
            print(f"  ! fetch error {url}: {exc}")
            return None
        if resp.status_code != 200:
            print(f"  ! HTTP {resp.status_code} for {url}")
            return None
        return resp.text

    def close(self) -> None:
        self.session.close()


class BrowserFetcher:
    """Real Chromium via Playwright. Imports playwright lazily so stores
    that only need StaticFetcher don't require the extra dependency."""

    kind = "browser"

    def __init__(self, rate_limiter: RateLimiter, robots: RobotsGuard, headless: bool = True):
        from playwright.sync_api import sync_playwright

        self.rate_limiter = rate_limiter
        self.robots = robots
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(headless=headless)
        self.context = self.browser.new_context(user_agent=USER_AGENT, locale="es-MX")
        self._robots_cache: dict[str, Optional[str]] = {}
        self._blocked_domains: set[str] = set()

    def _fetch_robots(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in self._robots_cache:
            return self._robots_cache[origin]
        page = self.context.new_page()
        text: Optional[str] = None
        try:
            resp = page.goto(f"{origin}/robots.txt", timeout=20000)
            if resp is not None and resp.ok:
                text = page.content()
                # page.content() wraps plain text in <html><body><pre>...
                # unwrap it back to raw robots.txt lines.
                text = _unwrap_pre(text)
        except Exception:
            text = None
        finally:
            page.close()
        self._robots_cache[origin] = text
        return text

    def get(self, url: str, domain_key: str, wait_selector: Optional[str] = None) -> Optional[str]:
        if domain_key in self._blocked_domains:
            print(f"  x {domain_key} already blocked this run -- not retrying {url}")
            return None
        robots_text = self._fetch_robots(url)
        if not self.robots.can_fetch(url, robots_text):
            print(f"  x robots.txt disallows {url} -- skipping")
            return None
        self.rate_limiter.wait(domain_key)
        page = self.context.new_page()
        try:
            try:
                page.goto(url, timeout=30000, wait_until="domcontentloaded")
            except Exception as exc:
                print(f"  ! navigation warning for {url}: {exc} (using whatever loaded)")
            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=15000)
                except Exception:
                    pass
            else:
                # give client-rendered content (React/VTEX hydration, search
                # result lists) a moment to settle without demanding full
                # network idle, which some sites never reach (analytics
                # beacons, polling).
                page.wait_for_timeout(2500)
            content = page.content()
            if looks_like_block_page(content):
                print(f"  x bot-management interstitial for {url} -- backing off {domain_key} for the rest of this run")
                self._blocked_domains.add(domain_key)
                return None
            return content
        except Exception as exc:
            print(f"  ! browser fetch error {url}: {exc}")
            return None
        finally:
            page.close()

    def close(self) -> None:
        self.browser.close()
        self._pw.stop()


def _unwrap_pre(html: str) -> str:
    soup_text = html
    start = soup_text.find("<pre")
    if start == -1:
        return html
    start = soup_text.find(">", start) + 1
    end = soup_text.find("</pre>", start)
    if end == -1:
        return html
    import html as htmllib

    return htmllib.unescape(soup_text[start:end])
