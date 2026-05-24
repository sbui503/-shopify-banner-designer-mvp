import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PRODUCTS_FILE = path.join(ROOT, "public/team-banner-products.json");
const SOURCE_MAP_FILE = path.join(ROOT, "public/team-banner-source-svg-map.json");
const TEMPLATES_FILE = path.join(ROOT, "public/svg-layer-templates.json");
const SVG_PUBLIC_DIR = path.join(ROOT, "public");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joined(values) {
  return cleanText(values.filter(Boolean).join(" "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function svgTextForUrl(url) {
  const relative = String(url || "").replace(/^https?:\/\/[^/]+\/?/, "").replace(/^\//, "");
  if (!relative) return "";
  const file = path.join(SVG_PUBLIC_DIR, relative);
  if (!file.startsWith(SVG_PUBLIC_DIR) || !fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

function dataInfoText(svg) {
  const match = String(svg || "").match(/\bdata-info=(["'])(.*?)\1/i);
  if (!match) return "";
  const decoded = decodeHtml(match[2]);
  try {
    const info = JSON.parse(decoded);
    return joined([
      info.type,
      info.name,
      info.information,
      info.back?.url,
      info.mask?.url,
      info.cover?.url
    ]);
  } catch {
    return cleanText(decoded);
  }
}

function isHomePlateHint(value) {
  const text = cleanText(value);
  return (
    /\btbd shape homeplatepennant\b/.test(text)
    || /\bhomeplate\b/.test(text)
    || /\bhome plate\b/.test(text)
    || /\bplate pennant\b/.test(text)
    || /\bhome pennant\b/.test(text)
    || /\bhome (baseball|softball|soccer) banners?\b/.test(text)
    || /\b(baseball|softball|soccer) home banners?\b/.test(text)
    || /\bhome base(ball)? banners?\b/.test(text)
  );
}

function isTriangleHint(value) {
  const text = cleanText(value);
  return /\btriangle\b/.test(text) || (/\bpennant\b/.test(text) && !isHomePlateHint(text));
}

function inferTemplateShape(template) {
  const svg = svgTextForUrl(template.url);
  const text = joined([
    template.name,
    template.title,
    template.type,
    template.sourceUrl,
    template.sourcePage,
    dataInfoText(svg),
    svg.slice(0, 4000)
  ]);
  if (/\bpole\b|\bpocket\b/.test(text)) return "polepocket";
  if (isHomePlateHint(text)) return "homeplatepennant";
  if (isTriangleHint(text)) return "triangle";
  return template.type || "rectangle";
}

function setHomePlateShape(entry) {
  let changed = false;
  if (entry.shape !== "homeplatepennant") {
    entry.shape = "homeplatepennant";
    changed = true;
  }
  if ("productShape" in entry && entry.productShape !== "homeplatepennant") {
    entry.productShape = "homeplatepennant";
    changed = true;
  }
  if ("sourceShape" in entry && entry.sourceShape !== "homeplatepennant") {
    entry.sourceShape = "homeplatepennant";
    changed = true;
  }
  if (entry.layerConfig && typeof entry.layerConfig === "object") {
    for (const key of ["shape", "productShape", "sourceShape"]) {
      if (key in entry.layerConfig && entry.layerConfig[key] !== "homeplatepennant") {
        entry.layerConfig[key] = "homeplatepennant";
        changed = true;
      }
    }
  }
  return changed;
}

const productsData = readJson(PRODUCTS_FILE);
const sourceMapData = readJson(SOURCE_MAP_FILE);
const templatesData = readJson(TEMPLATES_FILE);
const products = Array.isArray(productsData.products) ? productsData.products : [];
const maps = Array.isArray(sourceMapData.maps) ? sourceMapData.maps : [];
const templates = Array.isArray(templatesData.templates) ? templatesData.templates : [];

const templateShapeByUrl = new Map();
let templateFixes = 0;
for (const template of templates) {
  const shape = inferTemplateShape(template);
  templateShapeByUrl.set(template.url, shape);
  if (shape === "homeplatepennant" && template.type !== "homeplatepennant") {
    template.type = "homeplatepennant";
    templateFixes += 1;
  }
}

const homeplateHandles = new Set();
let productFixes = 0;
for (const product of products) {
  const text = joined([
    product.handle,
    product.title,
    product.type,
    product.tags,
    product.productCategory,
    product.shape,
    product.productShape,
    product.templateSvg,
    product.layerConfig?.layoutSvgUrl
  ]);
  if (isHomePlateHint(text)) {
    homeplateHandles.add(product.handle);
    if (setHomePlateShape(product)) productFixes += 1;
  }
}

let mapFixes = 0;
for (const row of maps) {
  const templateShape = templateShapeByUrl.get(row.templateSvg || row.layerConfig?.layoutSvgUrl || "");
  const text = joined([
    row.handle,
    row.productHandle,
    row.title,
    row.sourceTitle,
    row.sourceTemplatePage,
    row.sourceTemplateSvg,
    row.sourceUrl,
    row.shape,
    row.productShape,
    row.sourceShape,
    row.layerConfig?.layoutSvgUrl
  ]);
  if (homeplateHandles.has(row.handle) || templateShape === "homeplatepennant" || isHomePlateHint(text)) {
    if (setHomePlateShape(row)) mapFixes += 1;
  }
}

const timestamp = new Date().toISOString();
productsData.homeplateShapeCacheRepairedAt = timestamp;
productsData.homeplateShapeCacheProductFixes = productFixes;
sourceMapData.homeplateShapeCacheRepairedAt = timestamp;
sourceMapData.homeplateShapeCacheMapFixes = mapFixes;
templatesData.homeplateShapeCacheRepairedAt = timestamp;
templatesData.homeplateShapeCacheTemplateFixes = templateFixes;

writeJson(PRODUCTS_FILE, productsData);
writeJson(SOURCE_MAP_FILE, sourceMapData);
writeJson(TEMPLATES_FILE, templatesData);

console.log(JSON.stringify({
  productFixes,
  mapFixes,
  templateFixes,
  homeplateHandles: homeplateHandles.size
}, null, 2));
