import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_MANIFEST = path.resolve(ROOT, process.argv[2] || "public/team-banner-assets.shopify.json");
const EXACT_BACKUP_MANIFEST = path.resolve(process.argv[3] || "/tmp/team-banner-design-tool-blob-asset-backups.json");
const GENERATED_FALLBACK_MANIFEST = path.resolve(process.argv[4] || "/tmp/team-banner-generated-logo-fallback-map.json");
const OUTPUT_MANIFEST = path.resolve(ROOT, "public/team-banner-assets.owned.json");
const OUTPUT_MAP = path.resolve(ROOT, "public/team-banner-owned-asset-map.json");
const OUTPUT_DIR = path.resolve(ROOT, "public/owned-recreated-assets");
const TEMPLATE_DIR = path.resolve(ROOT, "public/svg-layer-templates");

const LEGACY_HOSTS = new Set([
  "lct-designs.s3.us-west-1.amazonaws.com",
  "svg-design.s3.us-west-1.amazonaws.com",
  "teambannersports.com",
  "www.teambannersports.com",
  "sv.lct.vn"
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function sourcePathKey(value) {
  const raw = String(value || "").trim().replace(/^\/\//, "https://");
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return decodeURIComponent(url.pathname);
  } catch {
    return "";
  }
}

function isLegacyUrl(value) {
  try {
    return LEGACY_HOSTS.has(new URL(String(value || "").replace(/^\/\//, "https://")).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  })[character]);
}

function displayName(value) {
  return String(value || "RECREATED ASSET")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b\d{10,}\b/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 42) || "RECREATED ASSET";
}

function paletteFor(value) {
  const palettes = [
    ["#0d3b66", "#f4d35e", "#faf0ca"],
    ["#143642", "#0f8b8d", "#ec9a29"],
    ["#3d0c11", "#d90429", "#f8f9fa"],
    ["#132a13", "#31572c", "#ffca3a"],
    ["#240046", "#7b2cbf", "#f72585"],
    ["#111827", "#2563eb", "#f8fafc"],
    ["#3f0d12", "#a71d31", "#f1c40f"],
    ["#003049", "#d62828", "#fcbf49"]
  ];
  const digest = crypto.createHash("sha256").update(String(value || "asset")).digest();
  return palettes[digest[0] % palettes.length];
}

function recreatedSvg(name, category, seed) {
  const label = displayName(name);
  const [dark, accent, light] = paletteFor(seed || label);
  const categoryText = escapeXml(category || "TEAM ASSET");
  const labelText = escapeXml(label);
  if (String(category).startsWith("BG ")) {
    const triangle = category === "BG Triangle";
    const homePlate = category === "BG Home Plate";
    const width = triangle || homePlate ? 900 : 1500;
    const height = category === "BG Pole Pocket" ? 1102 : 900;
    const labelSize = Math.max(28, Math.min(triangle || homePlate ? 62 : 88, Math.floor((width * 0.82) / Math.max(4, label.length) / 0.62)));
    const shape = triangle
      ? `<polygon points="36,54 864,54 450,858" fill="url(#bg)"/><polygon points="92,104 808,104 450,790" fill="none" stroke="${light}" stroke-width="10" opacity=".6"/>`
      : homePlate
        ? `<polygon points="42,42 858,42 858,520 450,858 42,520" fill="url(#bg)"/><polygon points="92,92 808,92 808,490 450,790 92,490" fill="none" stroke="${light}" stroke-width="10" opacity=".6"/>`
        : `<rect width="${width}" height="${height}" fill="url(#bg)"/><path d="M0 ${height * 0.2} L${width} ${height * 0.02} V${height * 0.26} L0 ${height * 0.44}Z" fill="${accent}" opacity=".62"/><path d="M0 ${height * 0.72} L${width} ${height * 0.48} V${height} H0Z" fill="${light}" opacity=".14"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-owned-source="recreated-vector"><title>${labelText}</title><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs>${shape}<g id="editable-label" data-name="Editable label"><text x="50%" y="48%" fill="${light}" stroke="${dark}" stroke-width="8" paint-order="stroke" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${labelSize}" font-weight="900">${labelText}</text><text x="50%" y="58%" fill="${light}" text-anchor="middle" font-family="Arial, sans-serif" font-size="28">${categoryText}</text></g></svg>`;
  }

  if (category === "Team name") {
    const labelSize = Math.max(26, Math.min(64, Math.floor(700 / Math.max(4, label.length) / 0.62)));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320" data-owned-source="recreated-vector"><title>${labelText}</title><g id="team-mark" data-name="Team mark"><path d="M90 160 170 42h560l80 118-80 118H170Z" fill="${dark}" stroke="${accent}" stroke-width="18"/><path d="M145 160 205 82h490l60 78-60 78H205Z" fill="${light}" opacity=".12"/><text x="450" y="183" fill="${light}" stroke="${accent}" stroke-width="4" paint-order="stroke" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${labelSize}" font-weight="900">${labelText}</text></g></svg>`;
  }

  const labelSize = Math.max(20, Math.min(38, Math.floor(500 / Math.max(4, label.length) / 0.62)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" data-owned-source="recreated-vector"><title>${labelText}</title><g id="badge" data-name="Badge"><path d="M300 32 462 92 554 238 526 410 394 538 206 538 74 410 46 238 138 92Z" fill="${dark}" stroke="${accent}" stroke-width="24"/><circle cx="300" cy="282" r="168" fill="${light}" opacity=".12"/><path d="m300 102 46 112 120 10-92 78 28 118-102-62-102 62 28-118-92-78 120-10Z" fill="${accent}"/><text x="300" y="500" fill="${light}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${labelSize}" font-weight="900">${labelText}</text></g></svg>`;
}

function localReplacement(record, fileName) {
  const outputPath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(outputPath, recreatedSvg(record.name, record.category, record.sourceId || fileName));
  return `/owned-recreated-assets/${fileName}`;
}

function generatedFallbackUrl(record, fallbackBySource) {
  if (record.category !== "Team name") return "";
  const fallback = fallbackBySource.get(sourcePathKey(record.url));
  return fallback?.generatedWordmarkUrl || fallback?.generatedLogoUrl || fallback?.recoveredTeamLogoCropUrl || "";
}

function sanitizedAsset(record, url, quality) {
  const next = { ...record };
  delete next.svgUrl;
  delete next.originalSourceUrl;
  next.url = url;
  next.sourceQuality = quality;
  next.ownedSource = true;
  if (quality !== "recovered-exact") next.recreated = true;
  return next;
}

const source = readJson(SOURCE_MANIFEST);
const exactBackups = readJson(EXACT_BACKUP_MANIFEST).assets || [];
const generatedFallbackData = readJson(GENERATED_FALLBACK_MANIFEST);
const exactBySource = new Map();
for (const record of exactBackups) {
  if (!record || record.status !== "ok") continue;
  const key = sourcePathKey(record.sourceUrl);
  const url = record.localUrl || record.blobUrl || "";
  if (key && url) exactBySource.set(key, url);
}

const fallbackBySource = new Map();
for (const [sourceUrl, record] of Object.entries(generatedFallbackData.oldSourceToFallbacks || {})) {
  const key = sourcePathKey(sourceUrl);
  if (key && record) fallbackBySource.set(key, record);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const mapByPath = {};
const ownedAssets = [];
let exactAssetCount = 0;
let recreatedAssetCount = 0;
let priorGeneratedCount = 0;
let localGeneratedCount = 0;

for (const record of source.assets || []) {
  const sourceKey = sourcePathKey(record.url);
  let url = exactBySource.get(sourceKey) || "";
  let quality = "recovered-exact";
  if (url) {
    exactAssetCount += 1;
  } else {
    quality = "recreated-vector";
    url = generatedFallbackUrl(record, fallbackBySource);
    if (url) priorGeneratedCount += 1;
    else {
      url = localReplacement(record, `asset-${record.sourceId || crypto.createHash("sha1").update(sourceKey).digest("hex").slice(0, 12)}.svg`);
      localGeneratedCount += 1;
    }
    recreatedAssetCount += 1;
  }

  ownedAssets.push(sanitizedAsset(record, url, quality));
  if (sourceKey) mapByPath[sourceKey] = { url, quality, sourceId: String(record.sourceId || "") };
  const sourceSvgKey = sourcePathKey(record.svgUrl);
  if (sourceSvgKey && !mapByPath[sourceSvgKey]) {
    mapByPath[sourceSvgKey] = { url, quality, sourceId: String(record.sourceId || "") };
  }
}

let templateImageReferenceCount = 0;
let templateLegacyPathCount = 0;
let extraTemplateReplacementCount = 0;
const templatePaths = new Set();
const imageHrefPattern = /<image\b[^>]*?(?:href|xlink:href)=(?:"([^"]+)"|'([^']+)')/gi;
for (const fileName of fs.readdirSync(TEMPLATE_DIR)) {
  if (!fileName.endsWith(".svg")) continue;
  const sourceText = fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf8");
  for (const match of sourceText.matchAll(imageHrefPattern)) {
    const href = String(match[1] || match[2] || "").replace(/&amp;/g, "&");
    if (!isLegacyUrl(href)) continue;
    templateImageReferenceCount += 1;
    const key = sourcePathKey(href);
    if (!key) continue;
    templatePaths.add(key);
    if (mapByPath[key]) continue;
    const fallback = fallbackBySource.get(key);
    let url = fallback?.generatedLogoUrl || fallback?.generatedWordmarkUrl || fallback?.recoveredTeamLogoCropUrl || "";
    if (!url) {
      const baseName = path.basename(key).replace(/\.[a-z0-9]+$/i, "");
      const digest = crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
      const category = /background|\bbg\b/i.test(baseName) ? "BG Hem & Grommets" : /logo|team-name|wordmark/i.test(baseName) ? "Team name" : "Clip art";
      url = localReplacement({ name: baseName, category, sourceId: digest }, `source-${digest}.svg`);
    }
    mapByPath[key] = { url, quality: "recreated-vector", sourceId: "template-only" };
    extraTemplateReplacementCount += 1;
  }
}

const generatedAt = new Date().toISOString();
writeJson(OUTPUT_MANIFEST, {
  generatedAt,
  source: "Team Sport Banners owned asset recovery",
  policy: "owned-sources-only",
  assetCount: ownedAssets.length,
  exactAssetCount,
  recreatedAssetCount,
  assets: ownedAssets
});
writeJson(OUTPUT_MAP, {
  generatedAt,
  policy: "owned-sources-only",
  exactAssetCount,
  recreatedAssetCount,
  priorGeneratedCount,
  localGeneratedCount,
  templateImageReferenceCount,
  templateLegacyPathCount: templatePaths.size,
  extraTemplateReplacementCount,
  assets: mapByPath
});

console.log(JSON.stringify({
  outputManifest: path.relative(ROOT, OUTPUT_MANIFEST),
  outputMap: path.relative(ROOT, OUTPUT_MAP),
  assetCount: ownedAssets.length,
  exactAssetCount,
  recreatedAssetCount,
  priorGeneratedCount,
  localGeneratedCount,
  templateImageReferenceCount,
  templateLegacyPathCount: templatePaths.size,
  extraTemplateReplacementCount,
  ownedMapCount: Object.keys(mapByPath).length
}, null, 2));
