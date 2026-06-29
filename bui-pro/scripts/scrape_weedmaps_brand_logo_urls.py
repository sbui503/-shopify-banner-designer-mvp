#!/usr/bin/env python3
"""Scrape public Weedmaps brand listing pages for logo URLs.

This keeps only metadata and image URLs. It does not download, cache, trace,
or rehost logo binaries.
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


START_PAGE = int(sys.argv[1]) if len(sys.argv) > 1 else 1
END_PAGE = int(sys.argv[2]) if len(sys.argv) > 2 else 100
RAW_OUTPUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("data/weedmaps-brand-logo-urls.json")
MANIFEST_OUTPUT = Path(sys.argv[4]) if len(sys.argv) > 4 else Path("data/brand-logo-manifest.generated.json")
DELAY_SECONDS = float(sys.argv[5]) if len(sys.argv) > 5 else 0.75

BASE_URL = "https://weedmaps.com/brands/all?page={page}"
LICENSE_STATUS = "verbal_approval_pending_written"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "brand"


def infer_format(url: str) -> str:
    path = urllib.parse.urlparse(url).path
    match = re.search(r"\.([a-z0-9]+)$", path, re.I)
    return match.group(1).lower() if match else "unknown"


def infer_text_style(name: str, logo_url: str) -> dict:
    clean_name = re.sub(r"\s+", " ", name).strip()
    upper = clean_name.upper()
    lower = clean_name.lower()
    logo_lower = logo_url.lower()

    if len(clean_name) <= 5 or upper == clean_name:
        font = "Archivo Black"
        shape = "badge"
        fill = "#f8fafc"
        stroke = "#020617"
    elif any(token in lower for token in ["garden", "farm", "raw", "flower", "natural"]):
        font = "Playfair Display"
        shape = "underline"
        fill = "#166534"
        stroke = "#ecfdf5"
    elif any(token in lower for token in ["med", "labs", "care", "clinic", "science"]):
        font = "Montserrat"
        shape = "compliance-tag"
        fill = "#0f172a"
        stroke = "#ffffff"
    elif any(token in lower for token in ["edible", "confection", "punch", "gummy", "kiva", "wyld"]):
        font = "Fredoka"
        shape = "capsule"
        fill = "#fb7185"
        stroke = "#4c0519"
    elif any(token in lower for token in ["coast", "cure", "chief", "woods", "plug", "play"]):
        font = "Bebas Neue"
        shape = "slab"
        fill = "#111827"
        stroke = "#ffffff"
    elif "script" in logo_lower or "sig" in logo_lower:
        font = "Pacifico"
        shape = "none"
        fill = "#facc15"
        stroke = "#3f2a05"
    else:
        font = "Montserrat"
        shape = "capsule"
        fill = "#f8fafc"
        stroke = "#020617"

    return {
        "text": clean_name,
        "editable": True,
        "fontFamily": font,
        "fontSize": 42 if len(clean_name) <= 12 else 30,
        "fontWeight": "900" if font in {"Inter", "Montserrat"} else "normal",
        "fill": fill,
        "stroke": stroke,
        "strokeWidth": 1 if len(clean_name) > 12 else 2,
        "shape": shape,
        "shapeFill": "rgba(15,23,42,0.92)",
        "shapeStroke": "#22c55e",
        "researchBasis": (
            "Editable brand-name text approximation from public brand name; "
            "not an exact trademark logo recreation."
        ),
    }


def fetch_html(page: int) -> str:
    request = urllib.request.Request(BASE_URL.format(page=page), headers=HEADERS)
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", "replace")


def next_data_from_html(source: str) -> dict:
    match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', source, re.S)
    if not match:
        raise ValueError("Missing __NEXT_DATA__")
    return json.loads(html.unescape(match.group(1)))


def collect_brand_rows(payload: dict) -> list[dict]:
    rows: list[dict] = []

    def walk(value):
        if isinstance(value, dict):
            if "avatarImage" in value and value.get("name") and value.get("slug"):
                rows.append(value)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(payload)

    seen = set()
    unique = []
    for row in rows:
        key = row.get("id") or row.get("slug") or row.get("name")
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique


def row_to_item(row: dict, page: int) -> dict | None:
    avatar = row.get("avatarImage") or {}
    logo_url = avatar.get("originalUrl") or avatar.get("largeUrl") or avatar.get("mediumUrl") or avatar.get("smallUrl")
    if not logo_url:
        return None

    name = str(row.get("name") or row.get("slug") or "Brand").strip()
    slug = slugify(str(row.get("slug") or name))
    image_format = infer_format(logo_url)
    transparent_hint = image_format in {"png", "webp", "svg"}

    return {
        "id": row.get("id"),
        "slug": slug,
        "name": name,
        "sourceUrl": f"https://weedmaps.com/brands/{slug}",
        "sourceListUrl": BASE_URL.format(page=page),
        "page": page,
        "licenseStatus": LICENSE_STATUS,
        "rating": row.get("rating"),
        "reviewsCount": row.get("reviewsCount"),
        "favoritesCount": row.get("favoritesCount"),
        "productsCount": row.get("productsCount"),
        "logo": {
            "url": logo_url,
            "format": image_format,
            "transparent": transparent_hint,
            "backgroundHint": "transparent_possible" if transparent_hint else "likely_flat_background",
            "alt": f"{name} brand logo from Weedmaps",
            "licenseStatus": LICENSE_STATUS,
        },
        "editableText": infer_text_style(name, logo_url),
    }


def load_existing() -> dict:
    if not RAW_OUTPUT.exists():
        return {
            "version": "1.0.0",
            "source": "Public Weedmaps brand listing HTML",
            "sourceRange": {"pageStart": START_PAGE, "pageEnd": END_PAGE},
            "licensePolicy": "URL-only references; written brand/Weedmaps permission required before production use.",
            "completedPages": [],
            "items": [],
        }
    return json.loads(RAW_OUTPUT.read_text())


def write_outputs(raw_payload: dict) -> None:
    RAW_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    raw_payload["generatedAt"] = datetime.now(timezone.utc).isoformat()
    raw_payload["sourceRange"] = {"pageStart": START_PAGE, "pageEnd": END_PAGE}
    RAW_OUTPUT.write_text(json.dumps(raw_payload, indent=2) + "\n")

    manifest = {
        "version": "1.0.0",
        "generatedAt": raw_payload["generatedAt"],
        "source": "Public Weedmaps brand listing HTML URL scrape",
        "sourceRange": raw_payload["sourceRange"],
        "licensePolicy": "Use only with written permission from the brand/rightsholder. URL-only scrape does not grant commercial rights.",
        "brands": raw_payload["items"],
    }
    MANIFEST_OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> int:
    raw = load_existing()
    completed = set(raw.get("completedPages") or [])
    seen = {item.get("slug") for item in raw.get("items", [])}

    for page in range(START_PAGE, END_PAGE + 1):
        if page in completed:
            print(f"Page {page}: already complete")
            continue
        try:
            payload = next_data_from_html(fetch_html(page))
            rows = collect_brand_rows(payload)
            new_items = []
            for row in rows:
                item = row_to_item(row, page)
                if not item or item["slug"] in seen:
                    continue
                seen.add(item["slug"])
                new_items.append(item)
            raw["items"].extend(new_items)
            raw.setdefault("completedPages", []).append(page)
            write_outputs(raw)
            print(f"Page {page}: {len(new_items)} new logos, {len(raw['items'])} total")
        except Exception as exc:
            write_outputs(raw)
            print(f"Page {page}: failed: {exc}", file=sys.stderr)
            return 1
        if page < END_PAGE and DELAY_SECONDS > 0:
            time.sleep(DELAY_SECONDS)

    write_outputs(raw)
    print(f"Wrote {len(raw['items'])} brand logo URLs to {RAW_OUTPUT}")
    print(f"Wrote manifest to {MANIFEST_OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
