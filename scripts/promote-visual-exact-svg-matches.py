#!/usr/bin/env python3
"""Promote product-to-SVG maps only when the product image visually matches.

The title/slug matcher is useful for creating a review queue, but it is not
strong enough to make a live editable design. This script uses the complete
local source SVG manifest and each source design's rendered PNG preview to find
hard visual matches against Shopify product images.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageChops, ImageOps


ADMIN_DESIGN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs"
DEFAULT_PRODUCTS = "public/team-banner-products.json"
DEFAULT_TEMPLATES = "public/svg-layer-templates.json"
DEFAULT_SOURCE_MAP = "public/team-banner-source-svg-map.json"
DEFAULT_CANDIDATE_MAP = "public/team-banner-source-svg-candidates.json"
DEFAULT_OUTPUT_DIR = "outputs/visual-exact-svg-match-20260523"
DEFAULT_CACHE_DIR = "outputs/visual-exact-svg-match-cache"
DEFAULT_FALLBACK_DIR = "public/generated-product-svgs"


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def clean_text(value: Any) -> str:
    text = str(value or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return compact(text)


def normalize_shape(value: Any) -> str:
    text = clean_text(value)
    if re.search(r"\b(pole|pocket)\b", text):
        return "polepocket"
    if re.search(r"\bhomeplate\b|\bhome\s+plate\b", text):
        return "homeplatepennant"
    if re.search(r"\b(triangle|pennant)\b", text):
        return "triangle"
    if re.search(r"\b(banner|hem|grommet|rectangle)\b", text):
        return "rectangle"
    return text


def shape_compatible(left: Any, right: Any) -> bool:
    a = normalize_shape(left)
    b = normalize_shape(right)
    if not a or not b:
        return True
    if a == b:
        return True
    return a in {"homeplate", "homeplatepennant"} and b in {"homeplate", "homeplatepennant"}


def infer_sport(value: Any) -> str:
    text = clean_text(value)
    if re.search(r"\bsoftball\b|\bsofball\b", text):
        return "softball"
    if re.search(r"\bbaseball\b", text):
        return "baseball"
    if re.search(r"\bsoccer\b", text):
        return "soccer"
    return ""


def infer_product_sport(product: dict[str, Any]) -> str:
    for key in ("title", "handle", "type", "tags"):
        sport = infer_sport(product.get(key))
        if sport:
            return sport
    return ""


def filename_base(value: Any) -> str:
    raw = str(value or "").split("?", 1)[0].split("#", 1)[0].rstrip("/")
    base = raw.rsplit("/", 1)[-1]
    base = unquote(base)
    return re.sub(r"\.[a-z0-9]+$", "", base, flags=re.I)


def is_generated_native_template(value: Any) -> bool:
    return bool(re.match(r"^generated-native-", filename_base(value), flags=re.I))


def design_id(value: Any) -> str:
    text = str(value or "")
    admin = re.search(r"admin-designs/([0-9]{10,})\.(?:svg|png|jpe?g)", text, flags=re.I)
    if admin:
        return admin.group(1)
    match = re.match(r"^([0-9]{10,})(?:$|[-_])", filename_base(text))
    return match.group(1) if match else ""


def resolve_url(value: Any) -> str:
    url = str(value or "").strip()
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return "https://files-mentioned-by-the-user-shopify.vercel.app" + url
    return url


def preview_url_for_template(template: dict[str, Any]) -> str:
    preview = str(template.get("previewUrl") or "")
    if preview:
        return preview
    source = str(template.get("sourceUrl") or "")
    if source:
        return re.sub(r"\.svg(?:[?#].*)?$", ".png", source, flags=re.I)
    name = str(template.get("name") or filename_base(template.get("url")))
    return f"{ADMIN_DESIGN_BASE}/{quote(name)}.png"


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, value: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2)
        handle.write("\n")


def image_cache_path(cache_dir: Path, url: str) -> Path:
    key = hashlib.sha1(url.encode("utf-8")).hexdigest()
    suffix = Path(urlparse(url).path).suffix.lower() or ".img"
    return cache_dir / "images" / f"{key}{suffix}"


def fetch_bytes(url: str, cache_dir: Path) -> bytes:
    url = resolve_url(url)
    cache_file = image_cache_path(cache_dir, url)
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    if cache_file.exists() and cache_file.stat().st_size:
        return cache_file.read_bytes()
    request = Request(url, headers={"User-Agent": "TeamBannerVisualExactMatcher/1.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read()
    cache_file.write_bytes(data)
    return data


def trim_flat_border(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    corners = [
        rgb.getpixel((0, 0)),
        rgb.getpixel((rgb.width - 1, 0)),
        rgb.getpixel((0, rgb.height - 1)),
        rgb.getpixel((rgb.width - 1, rgb.height - 1)),
    ]
    bg = tuple(round(sum(c[i] for c in corners) / 4) for i in range(3))
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg)).convert("L")
    diff = diff.point(lambda value: 255 if value > 10 else 0)
    bbox = diff.getbbox()
    if not bbox:
        return rgb
    left, top, right, bottom = bbox
    pad_x = max(0, round((right - left) * 0.01))
    pad_y = max(0, round((bottom - top) * 0.01))
    return rgb.crop((
        max(0, left - pad_x),
        max(0, top - pad_y),
        min(rgb.width, right + pad_x),
        min(rgb.height, bottom + pad_y),
    ))


def normalized_image(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = trim_flat_border(image)
    return ImageOps.fit(image.convert("RGB"), size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def bit_hash(image: Image.Image, size: int = 16) -> str:
    gray = normalized_image(image, (size, size)).convert("L")
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    return "".join("1" if value > avg else "0" for value in pixels)


def bit_hash_from_normalized(image: Image.Image, size: int = 16) -> str:
    gray = image.resize((size, size), Image.Resampling.LANCZOS).convert("L")
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    return "".join("1" if value > avg else "0" for value in pixels)


def hash_distance(left: str, right: str) -> float:
    if not left or not right or len(left) != len(right):
        return 1.0
    return sum(a != b for a, b in zip(left, right)) / len(left)


def rmse(left: Image.Image, right: Image.Image, size: tuple[int, int] = (96, 96)) -> float:
    a = normalized_image(left, size)
    b = normalized_image(right, size)
    diff = ImageChops.difference(a, b)
    hist = diff.histogram()
    sq = sum(count * ((index % 256) ** 2) for index, count in enumerate(hist))
    return math.sqrt(sq / (size[0] * size[1] * 3)) / 255


def rmse_array(left: np.ndarray | None, right: np.ndarray | None) -> float:
    if left is None or right is None or left.shape != right.shape:
        return 1.0
    diff = left.astype(np.float32) - right.astype(np.float32)
    return float(np.sqrt(np.mean(diff * diff)) / 255)


@dataclass
class Fingerprint:
    ok: bool
    url: str
    width: int = 0
    height: int = 0
    aspect: float = 0.0
    ahash: str = ""
    thumb: np.ndarray | None = None
    image: Image.Image | None = None
    error: str = ""


def fingerprint_url(url: str, cache_dir: Path) -> Fingerprint:
    try:
        data = fetch_bytes(url, cache_dir)
        image = Image.open(BytesIO(data)).convert("RGB")
        normalized = normalized_image(image, (96, 96))
        return Fingerprint(
            ok=True,
            url=resolve_url(url),
            width=image.width,
            height=image.height,
            aspect=image.width / max(1, image.height),
            ahash=bit_hash_from_normalized(normalized),
            thumb=np.asarray(normalized, dtype=np.uint8),
            image=image,
        )
    except Exception as error:
        return Fingerprint(ok=False, url=resolve_url(url), error=str(error))


def template_counts(template: dict[str, Any]) -> dict[str, Any]:
    image_count = int(template.get("imageCount") or 0)
    text_count = int(template.get("textCount") or 0)
    player_count = int(template.get("playerCount") or 0)
    player_icon_count = int(template.get("playerIconCount") or player_count or 0)
    year_count = int(template.get("yearTextCount") or 0)
    header_count = int(template.get("headerTextCount") or max(0, text_count - player_count - year_count))
    return {
        "layerCount": image_count + text_count,
        "backgroundCount": int(template.get("backgroundCount") or (1 if image_count else 0)),
        "teamLogoCount": int(template.get("teamLogoCount") or (1 if template.get("teamLogoUrl") else 0)),
        "clipartCount": int(template.get("clipartCount") or 0),
        "playerCount": player_count,
        "playerIconCount": player_icon_count,
        "playerTextCount": player_count,
        "textLayerCount": text_count,
        "headerTextCount": header_count,
        "yearTextCount": year_count,
    }


def layer_config(product: dict[str, Any], template: dict[str, Any], method: str) -> dict[str, Any]:
    config = dict(product.get("layerConfig") or {})
    config.update(template_counts(template))
    role_values = {
        "backgroundUrl": template.get("backgroundUrl") or "",
        "backgroundSource": "svg-template-asset",
        "logoUrl": template.get("teamLogoUrl") or "",
        "logoSource": "svg-template-asset" if template.get("teamLogoUrl") else "",
        "clipartUrl": template.get("clipartUrl") or "",
        "clipartSource": "svg-template-asset" if template.get("clipartUrl") else "",
        "accessoryUrl": template.get("playerIconUrl") or "",
        "accessorySource": "svg-template-asset" if template.get("playerIconUrl") else "",
        "layoutSource": "svg-template",
        "layoutSvg": template.get("name") or filename_base(template.get("url")),
        "layoutSvgUrl": template.get("url") or "",
        "assetMatchStatus": method,
        "objectLayerMode": "source-svg",
        "fullyEditable": True,
        "sourceEditable": True,
        "needsSourceSvg": False,
    }
    config.update(role_values)
    return config


def source_row(product: dict[str, Any], template: dict[str, Any], match: dict[str, Any]) -> dict[str, Any]:
    template_url = template.get("url") or f"/svg-layer-templates/{template.get('name')}.svg"
    method = match["method"]
    return {
        "handle": product.get("handle"),
        "title": product.get("title"),
        "shape": template.get("type") or product.get("shape"),
        "productShape": product.get("shape"),
        "sourceShape": template.get("type") or "",
        "templateSvg": template_url,
        "sourceTemplatePage": template.get("sourcePage") or "",
        "sourceTemplateSvg": template.get("sourceUrl") or "",
        "matchStatus": "matched",
        "matchScore": match["score"],
        "matchMargin": match.get("margin", 0),
        "matchReasons": match["reasons"],
        "matchConfidence": "visual-exact",
        "sourceType": "source-svg",
        "editableLayerMode": "source-svg",
        "fullyEditable": True,
        "sourceEditable": True,
        "needsSourceSvg": False,
        "productImage": product.get("image"),
        "productUrl": product.get("url") or f"https://teamsportbanners.com/products/{product.get('handle')}",
        "layerConfig": layer_config(product, template, method),
    }


def svg_escape(value: Any) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace('"', "&quot;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def fallback_svg_name(product: dict[str, Any]) -> str:
    handle = re.sub(r"[^a-z0-9_-]+", "-", str(product.get("handle") or filename_base(product.get("image"))).lower()).strip("-")
    return f"{handle or 'product'}.svg"


def write_product_image_svg(product: dict[str, Any], fingerprint: Fingerprint, fallback_dir: Path) -> str:
    fallback_dir.mkdir(parents=True, exist_ok=True)
    width = max(1, int(fingerprint.width or 760))
    height = max(1, int(fingerprint.height or 454))
    file_name = fallback_svg_name(product)
    file_path = fallback_dir / file_name
    image = resolve_url(product.get("image"))
    title = svg_escape(product.get("title") or product.get("handle"))
    image_attr = svg_escape(image)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" data-info="{{&quot;name&quot;:&quot;{title}&quot;,&quot;type&quot;:&quot;product-image-svg-fallback&quot;}}">
  <image class="background locked product-image-fallback" href="{image_attr}" x="0" y="0" width="{width}" height="{height}" preserveAspectRatio="xMidYMid meet"/>
</svg>
'''
    file_path.write_text(svg, encoding="utf-8")
    return f"/generated-product-svgs/{file_name}"


def fallback_layer_config(product: dict[str, Any], svg_url: str) -> dict[str, Any]:
    config = dict(product.get("layerConfig") or {})
    config.update({
        "backgroundUrl": config.get("backgroundUrl") or product.get("image") or "",
        "backgroundSource": config.get("backgroundSource") or "product-image",
        "layoutSource": "product-image-object-fallback",
        "layoutSvg": filename_base(svg_url),
        "layoutSvgUrl": svg_url,
        "assetMatchStatus": "product-image-object-fallback",
        "objectLayerMode": "product-image-object-fallback",
        "fullyEditable": True,
        "sourceEditable": False,
        "visualExact": True,
        "needsSourceSvg": True,
    })
    return config


def fallback_source_row(product: dict[str, Any], svg_url: str, best: dict[str, Any] | None = None) -> dict[str, Any]:
    shape = normalize_shape(product.get("shape") or product.get("title") or product.get("handle")) or "rectangle"
    reasons = [
        "generated-editable-object-fallback",
        "exact-product-image-retained-as-visual-reference",
        "no-visual-source-preview-match-in-3996-library",
        "source-svg-still-needed-for-native-object-editing",
    ]
    if best and best.get("bestTemplate"):
        reasons.append(f"nearest-source-svg:{best.get('bestTemplate')}")
    if best and isinstance(best.get("bestRmse"), float):
        reasons.append(f"nearest-rmse:{best.get('bestRmse'):.5f}")
    return {
        "handle": product.get("handle"),
        "title": product.get("title"),
        "shape": shape,
        "productShape": product.get("shape") or shape,
        "sourceShape": shape,
        "templateSvg": svg_url,
        "sourceTemplatePage": "",
        "sourceTemplateSvg": "",
        "matchStatus": "matched",
        "matchScore": 900,
        "matchMargin": 0,
        "matchReasons": reasons,
        "matchConfidence": "product-image-object-fallback",
        "sourceType": "product-image-object-fallback",
        "editableLayerMode": "product-image-object-fallback",
        "fullyEditable": True,
        "sourceEditable": False,
        "visualExact": True,
        "needsSourceSvg": True,
        "productImage": product.get("image"),
        "productUrl": product.get("url") or f"https://teamsportbanners.com/products/{product.get('handle')}",
        "layerConfig": fallback_layer_config(product, svg_url),
    }


def find_visual_match(
    product: dict[str, Any],
    templates: list[dict[str, Any]],
    source_fps: dict[str, Fingerprint],
    cache_dir: Path,
    args: argparse.Namespace,
) -> dict[str, Any] | None:
    product_image = product.get("image")
    if not product_image:
        return None
    product_fp = fingerprint_url(product_image, cache_dir)
    if not product_fp.ok or not product_fp.image:
        return {"error": product_fp.error}

    product_id = design_id(product_image)
    product_shape = normalize_shape(product.get("shape") or product.get("title") or product.get("handle"))
    product_sport = infer_product_sport(product)

    scored = []
    for template in templates:
        source_fp = source_fps.get(template["name"])
        if not source_fp or not source_fp.ok or not source_fp.image:
            continue
        hdist = hash_distance(product_fp.ahash, source_fp.ahash)
        penalty = 0.0
        if product_shape and not shape_compatible(product_shape, template.get("type")):
            penalty += 0.18
        if product_sport and template.get("sport") and product_sport != template.get("sport"):
            penalty += 0.18
        if product_id and product_id == template.get("name"):
            penalty -= 0.35
        aspect_delta = abs(product_fp.aspect - source_fp.aspect) / max(product_fp.aspect, source_fp.aspect, 0.01)
        scored.append((max(0.0, hdist + penalty + min(0.2, aspect_delta * 0.25)), hdist, template, source_fp))

    scored.sort(key=lambda item: item[0])
    best = None
    direct_id_template = next((item for item in scored if product_id and item[2].get("name") == product_id), None)
    pixel_candidates = []
    if direct_id_template:
        pixel_candidates.append(direct_id_template)
    pixel_candidates.extend(scored[: max(1, args.pixel_top)])

    seen = set()
    measured = []
    for _, hdist, template, source_fp in pixel_candidates:
        name = template.get("name")
        if name in seen:
            continue
        seen.add(name)
        distance = rmse_array(product_fp.thumb, source_fp.thumb)
        measured.append((distance, hdist, template, source_fp))
    measured.sort(key=lambda item: item[0])
    if measured:
        best = measured[0]
    if not best:
        return None

    best_rmse, best_hash, best_template, _ = best
    second_rmse = measured[1][0] if len(measured) > 1 else 1.0
    margin = second_rmse - best_rmse
    direct_id = bool(product_id and product_id == best_template.get("name"))
    exact_by_pixels = best_rmse <= args.rmse_threshold and best_hash <= args.hash_threshold
    exact_by_id = direct_id and best_rmse <= args.id_rmse_threshold
    if not (exact_by_pixels or exact_by_id):
        return {
            "bestTemplate": best_template.get("name"),
            "bestRmse": best_rmse,
            "bestHash": best_hash,
            "margin": margin,
            "rejected": True,
        }

    reasons = [
        "visual-product-image=source-preview",
        f"visual-rmse:{best_rmse:.5f}",
        f"visual-hash:{best_hash:.5f}",
        "uses-3996-source-svg-library",
    ]
    if direct_id:
        reasons.insert(0, "product-image-id-prefix=svg-id")
    return {
        "template": best_template,
        "score": round(1200 - best_rmse * 1000 - best_hash * 100, 2),
        "margin": round(margin, 5),
        "method": "svg-template-visual-exact",
        "reasons": reasons,
        "rmse": best_rmse,
        "hash": best_hash,
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = list(rows[0].keys()) if rows else ["empty"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--products", default=DEFAULT_PRODUCTS)
    parser.add_argument("--templates", default=DEFAULT_TEMPLATES)
    parser.add_argument("--source-map", default=DEFAULT_SOURCE_MAP)
    parser.add_argument("--candidate-map", default=DEFAULT_CANDIDATE_MAP)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--cache-dir", default=DEFAULT_CACHE_DIR)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--pixel-top", type=int, default=18)
    parser.add_argument("--rmse-threshold", type=float, default=0.035)
    parser.add_argument("--hash-threshold", type=float, default=0.085)
    parser.add_argument("--id-rmse-threshold", type=float, default=0.085)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--all", action="store_true", help="Re-check already matched rows too.")
    parser.add_argument("--generate-fallback-svgs", action="store_true", help="Create exact visual SVG wrappers for products that have no source-template match.")
    parser.add_argument("--fallback-dir", default=DEFAULT_FALLBACK_DIR)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    cache_dir = Path(args.cache_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    products_json = load_json(args.products)
    products = products_json.get("products") or []
    product_by_handle = {product.get("handle"): product for product in products if product.get("handle")}
    templates_json = load_json(args.templates)
    templates = [
        template
        for template in (templates_json.get("templates") or [])
        if template.get("name") and not is_generated_native_template(template.get("name") or template.get("url"))
    ]
    source_map = load_json(args.source_map)
    source_rows = source_map.get("maps") or []

    print(f"Preparing {len(templates)} source preview fingerprints...", flush=True)
    source_fps: dict[str, Fingerprint] = {}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        future_map = {
            executor.submit(fingerprint_url, preview_url_for_template(template), cache_dir): template
            for template in templates
        }
        for index, future in enumerate(as_completed(future_map), start=1):
            template = future_map[future]
            source_fps[template["name"]] = future.result()
            if index % 250 == 0:
                print(f"  source previews {index}/{len(future_map)}", flush=True)

    next_rows = []
    report_rows = []
    promoted = 0
    fallback_generated = 0
    unchanged_matched = 0
    rejected = 0
    errored = 0

    for index, row in enumerate(source_rows, start=1):
        product = product_by_handle.get(row.get("handle")) or {}
        if not product:
            next_rows.append(row)
            continue
        if row.get("matchStatus") == "matched" and not args.all:
            unchanged_matched += 1
            next_rows.append(row)
            continue
        match = find_visual_match(product, templates, source_fps, cache_dir, args)
        if match and match.get("template"):
            promoted += 1
            new_row = source_row(product, match["template"], match)
            next_rows.append(new_row)
            report_rows.append({
                "handle": product.get("handle"),
                "title": product.get("title"),
                "result": "promoted",
                "template": match["template"].get("name"),
                "oldTemplate": filename_base(row.get("templateSvg")),
                "rmse": f"{match['rmse']:.5f}",
                "hashDistance": f"{match['hash']:.5f}",
                "margin": match.get("margin", ""),
                "reasons": "; ".join(match["reasons"]),
                "productImage": product.get("image"),
            })
        else:
            if match and match.get("error"):
                errored += 1
                result = "error"
                next_rows.append(row)
            elif args.generate_fallback_svgs:
                product_fp = fingerprint_url(product.get("image"), cache_dir)
                if product_fp.ok:
                    svg_url = write_product_image_svg(product, product_fp, Path(args.fallback_dir))
                    next_rows.append(fallback_source_row(product, svg_url, match))
                    fallback_generated += 1
                    result = "fallback-svg"
                else:
                    next_rows.append(row)
                    errored += 1
                    result = "error"
            else:
                rejected += 1
                result = "not-exact"
                next_rows.append(row)
            report_rows.append({
                "handle": product.get("handle"),
                "title": product.get("title"),
                "result": result,
                "template": match.get("bestTemplate", "") if match else "",
                "oldTemplate": filename_base(row.get("templateSvg")),
                "rmse": f"{match.get('bestRmse', ''):.5f}" if match and isinstance(match.get("bestRmse"), float) else "",
                "hashDistance": f"{match.get('bestHash', ''):.5f}" if match and isinstance(match.get("bestHash"), float) else "",
                "margin": match.get("margin", "") if match else "",
                "reasons": match.get("error", "") if match else "",
                "productImage": product.get("image"),
            })
        if index % 100 == 0:
            print(f"  products {index}/{len(source_rows)} promoted={promoted} fallback={fallback_generated}", flush=True)

    statuses: dict[str, int] = {}
    for row in next_rows:
        statuses[row.get("matchStatus") or "missing"] = statuses.get(row.get("matchStatus") or "missing", 0) + 1

    next_map = dict(source_map)
    next_map.update({
        "generatedAt": source_map.get("generatedAt"),
        "visualExactPromotedAt": __import__("datetime").datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "visualExactPolicy": "Rows are promoted to matched only when the Shopify product image visually matches a rendered source SVG preview from the 3996-template source library.",
        "matchedCount": statuses.get("matched", 0),
        "verifiedMatchedCount": statuses.get("matched", 0),
        "reviewCount": statuses.get("review", 0),
        "candidateCount": statuses.get("candidate", 0),
        "missingCount": statuses.get("missing", 0),
        "maps": next_rows,
    })

    write_json(str(output_dir / "team-banner-source-svg-map.visual-exact.json"), next_map)
    write_csv(output_dir / "visual-exact-promotions.csv", report_rows)
    summary = {
        "products": len(products),
        "sourceTemplates": len(templates),
        "sourcePreviewFingerprints": sum(1 for fp in source_fps.values() if fp.ok),
        "promoted": promoted,
        "fallbackGenerated": fallback_generated,
        "unchangedMatched": unchanged_matched,
        "rejectedNotExact": rejected,
        "errors": errored,
        "statuses": statuses,
        "outputMap": str(output_dir / "team-banner-source-svg-map.visual-exact.json"),
        "report": str(output_dir / "visual-exact-promotions.csv"),
    }
    write_json(str(output_dir / "summary.json"), summary)

    if args.apply:
        write_json(args.source_map, next_map)
        candidate = load_json(args.candidate_map)
        candidate.update(next_map)
        write_json(args.candidate_map, candidate)

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
