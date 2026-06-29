#!/usr/bin/env python3
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

START_PAGE = int(sys.argv[1]) if len(sys.argv) > 1 else 1
END_PAGE = int(sys.argv[2]) if len(sys.argv) > 2 else 588
RAW_OUTPUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("data/weedmaps-public-strain-image-urls.json")
MANIFEST_OUTPUT = Path(sys.argv[4]) if len(sys.argv) > 4 else Path("data/strain-hero-manifest.generated.json")
DELAY_SECONDS = float(sys.argv[5]) if len(sys.argv) > 5 else float(__import__("os").environ.get("WEEDMAPS_PUBLIC_SCRAPE_DELAY", "0.75"))
LICENSE_STATUS = __import__("os").environ.get("WEEDMAPS_PUBLIC_LICENSE_STATUS", "verbal_approval_pending_written")
USER_AGENT = __import__("os").environ.get(
    "WEEDMAPS_PUBLIC_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
)


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def slugify(value):
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", str(value or "strain").lower()))


def fetch_html(page):
    url = f"https://weedmaps.com/strains?page={page}"
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return url, response.read().decode("utf-8", "ignore")


def extract_next_data(document):
    match = re.search(r'<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)</script>', document, re.S)
    if not match:
        return {}
    return json.loads(html.unescape(match.group(1)))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def high_res_url(url):
    parsed = urllib.parse.urlsplit(url)
    if "images.weedmaps.com" not in parsed.netloc and "weedmaps.com" not in parsed.netloc:
        return url
    query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
    query.update({"fit": "crop", "auto": "format", "w": "1280", "h": "560", "dpr": "2"})
    query.pop("blur", None)
    query.pop("q", None)
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(query), ""))


def extract_strains(page, page_url, document):
    data = extract_next_data(document)
    rows = []
    seen_keys = set()
    for node in walk(data):
        if node.get("type") not in {"strains", "strain"}:
            continue
        attrs = node.get("attributes") or {}
        image_url = attrs.get("heroImageUrl") or attrs.get("avatarImageUrl")
        name = attrs.get("name")
        if not image_url or not name:
            continue
        slug = attrs.get("slug") or slugify(name)
        key = (slug, image_url)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        rows.append(
            {
                "slug": slug,
                "name": name,
                "type": attrs.get("strainType") or attrs.get("species") or "unknown",
                "page": page,
                "pageUrl": page_url,
                "sourceUrl": f"https://weedmaps.com/strains/{slug}",
                "imageUrl": image_url,
                "normalizedImageUrl": high_res_url(image_url),
                "alt": f"{name} strain hero image from Weedmaps",
                "licenseStatus": LICENSE_STATUS,
                "permissionNote": "URL-only scrape requested by user; written asset license still recommended before production use.",
                "attribution": "Weedmaps",
            }
        )
    return rows


def load_existing(path):
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    return payload.get("items", [])


def write_outputs(items, completed_pages):
    RAW_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    items = sorted(items, key=lambda item: (item["page"], item["name"].lower(), item["imageUrl"]))
    RAW_OUTPUT.write_text(
        json.dumps(
            {
                "version": "1.0.0",
                "generatedAt": utc_now(),
                "source": "Public Weedmaps strain pages, URL-only extraction",
                "sourceRange": {"pageStart": START_PAGE, "pageEnd": END_PAGE, "pageSize": 20},
                "completedPages": sorted(completed_pages),
                "licensePolicy": "URLs only. Do not download, rehost, or use commercially without written license or Weedmaps/brand approval.",
                "items": items,
            },
            indent=2,
        )
        + "\n"
    )
    MANIFEST_OUTPUT.write_text(
        json.dumps(
            {
                "version": "1.0.0",
                "generatedAt": utc_now(),
                "source": "Public Weedmaps strain pages, URL-only extraction",
                "sourceRange": {"pageStart": START_PAGE, "pageEnd": END_PAGE, "pageSize": 20},
                "licensePolicy": "Only import image URLs that are owned, licensed, partner-provided, or explicitly approved for BUI Pro.",
                "strainHeroImages": [
                    {
                        "slug": item["slug"],
                        "name": item["name"],
                        "type": item["type"],
                        "sourceUrl": item["sourceUrl"],
                        "page": item["page"],
                        "licenseStatus": item["licenseStatus"],
                        "heroImage": {
                            "url": item["normalizedImageUrl"],
                            "width": 1280,
                            "height": 560,
                            "alt": item["alt"],
                            "dominantColors": [],
                            "licenseStatus": item["licenseStatus"],
                        },
                    }
                    for item in items
                ],
            },
            indent=2,
        )
        + "\n"
    )


items = load_existing(RAW_OUTPUT)
completed_pages = {int(item["page"]) for item in items if str(item.get("page", "")).isdigit()}
seen = {(item.get("slug"), item.get("imageUrl")) for item in items}

for page in range(START_PAGE, END_PAGE + 1):
    if page in completed_pages:
        print(f"Skip page {page}: already captured")
        continue
    try:
        page_url, document = fetch_html(page)
        rows = extract_strains(page, page_url, document)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"Stop at page {page}: {exc}", file=sys.stderr)
        break
    if not rows:
        print(f"Stop at page {page}: no strain image URLs found")
        break
    new_rows = []
    for row in rows:
        key = (row["slug"], row["imageUrl"])
        if key in seen:
            continue
        seen.add(key)
        new_rows.append(row)
    items.extend(new_rows)
    completed_pages.add(page)
    write_outputs(items, completed_pages)
    print(f"Page {page}: {len(new_rows)} new URLs, {len(items)} total")
    if page < END_PAGE and DELAY_SECONDS > 0:
        time.sleep(DELAY_SECONDS)

write_outputs(items, completed_pages)
print(f"Wrote {len(items)} URLs to {RAW_OUTPUT}")
print(f"Wrote manifest to {MANIFEST_OUTPUT}")
