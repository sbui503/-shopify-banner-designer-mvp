import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "public", "svg-layer-templates.json");
const DIMENSION_TOLERANCE_PX = 0.5;

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1];
}

function parseNumericAttribute(tag, name) {
  const raw = getAttribute(tag, name);
  if (raw === undefined) return { raw, value: NaN };
  return { raw, value: Number(raw) };
}

function parseViewBox(tag) {
  const raw = getAttribute(tag, "viewBox");
  if (raw === undefined) return { raw, values: [] };
  return {
    raw,
    values: raw.trim().split(/[\s,]+/).map(Number)
  };
}

function isPositiveFinite(value) {
  return Number.isFinite(value) && value > 0;
}

test("manifest-backed SVG templates expose intrinsic dimensions matching their viewBox", () => {
  const manifest = readManifest();
  const failures = [];
  const checkedTemplates = [];

  for (const template of manifest.templates) {
    if (template.name.startsWith("legacy-")) continue;

    const svgPath = path.join(ROOT, "public", template.url.replace(/^\//, ""));
    const svg = fs.readFileSync(svgPath, "utf8");
    const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0];

    checkedTemplates.push(template.name);

    if (!svgTag) {
      failures.push(`${template.name}: missing root <svg> tag`);
      continue;
    }

    const width = parseNumericAttribute(svgTag, "width");
    const height = parseNumericAttribute(svgTag, "height");
    const viewBox = parseViewBox(svgTag);

    if (!isPositiveFinite(width.value)) {
      failures.push(`${template.name}: width must be a positive numeric attribute, got ${String(width.raw)}`);
    }

    if (!isPositiveFinite(height.value)) {
      failures.push(`${template.name}: height must be a positive numeric attribute, got ${String(height.raw)}`);
    }

    if (viewBox.values.length !== 4 || viewBox.values.some((value) => !Number.isFinite(value))) {
      failures.push(`${template.name}: viewBox must contain four numeric values, got ${String(viewBox.raw)}`);
      continue;
    }

    const [, , viewBoxWidth, viewBoxHeight] = viewBox.values;
    if (!isPositiveFinite(viewBoxWidth) || !isPositiveFinite(viewBoxHeight)) {
      failures.push(`${template.name}: viewBox dimensions must be positive, got ${String(viewBox.raw)}`);
      continue;
    }

    const widthDelta = Math.abs(width.value - viewBoxWidth);
    const heightDelta = Math.abs(height.value - viewBoxHeight);
    if (widthDelta > DIMENSION_TOLERANCE_PX || heightDelta > DIMENSION_TOLERANCE_PX) {
      failures.push(
        `${template.name}: width/height ${width.raw}x${height.raw} must match viewBox ${viewBox.raw} within ${DIMENSION_TOLERANCE_PX}px`
      );
    }
  }

  assert.equal(checkedTemplates.length, 5468);
  assert.deepEqual(failures, []);
});
