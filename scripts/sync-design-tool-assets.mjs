import fs from "node:fs";
import path from "node:path";

const API_URL = "https://sv.lct.vn/crud/find";
const DB = "teamsportbanners";
const COLLECTION = "tool_assets";
const DEFAULT_OUTPUT = "public/team-banner-assets.shopify.json";
const DEFAULT_REPORT_DIR = "outputs/design-tool-asset-sync-20260523";
const PAGE_LIMIT = 500;

const outputPath = process.argv[2] || DEFAULT_OUTPUT;
const reportDir = process.argv[3] || DEFAULT_REPORT_DIR;

const TYPE_CATEGORY = new Map([
  ["bg_hem_grommets", "BG Hem & Grommets"],
  ["bg_pole_pocket", "BG Pole Pocket"],
  ["bg_triangle", "BG Triangle"],
  ["bg_home_plate", "BG Home Plate"],
  ["teamname", "Team name"],
  ["clipart", "Clip art"],
  ["accessory", "Accessory"]
]);

function deburr(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value) {
  return deburr(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return cleanText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows) {
  const keys = Object.keys(rows[0] || { Empty: "" });
  const lines = [
    keys.map(csvEscape).join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(","))
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function roleForCategory(category) {
  if (String(category || "").startsWith("BG ")) return "background";
  if (category === "Team name") return "team-name-logo";
  if (category === "Accessory") return "accessory-player-icon";
  return "clipart";
}

function sourceTypeForRawType(type) {
  return type || "uncategorized_clipart";
}

function categoryForRecord(record) {
  const rawType = String(record.type || "").trim();
  if (TYPE_CATEGORY.has(rawType)) return TYPE_CATEGORY.get(rawType);
  return "Clip art";
}

function matchKeyForRecord(record) {
  return cleanText([
    record.label,
    record.tags,
    record.alt,
    record.img_key
  ].filter(Boolean).join(" "));
}

function assetTagsForRecord(record, category, sourceType) {
  const role = roleForCategory(category);
  const assetKey = slug(record.label || record.tags || record.alt || record.img_key || record._id);
  const svgId = String(record.svg_url || "").match(/\/([^/.]+)\.svg(?:$|\?)/i)?.[1] || "";
  return [
    "tbd:design-tool-asset",
    `tbd:asset-role:${role}`,
    `tbd:asset-category:${slug(category)}`,
    `tbd:asset-source-type:${sourceType}`,
    `tbd:asset-key:${assetKey}`,
    `tbd:asset-id:${record._id}`,
    svgId ? `tbd:asset-svg:${svgId}` : ""
  ].filter(Boolean);
}

function normalizeRecord(record) {
  const rawType = String(record.type || "").trim();
  const category = categoryForRecord(record);
  const sourceType = sourceTypeForRawType(rawType);
  return {
    name: record.label || record.alt || record.tags || path.basename(record.img_key || record.img_url || ""),
    category,
    url: record.img_url || "",
    svgUrl: record.svg_url || "",
    sourceType,
    rawType,
    sourceId: record._id,
    role: roleForCategory(category),
    matchKey: matchKeyForRecord(record),
    assetTags: assetTagsForRecord(record, category, sourceType)
  };
}

async function fetchPage(skip) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      "user-agent": "TeamBannerDesignerAssetSync/1.0"
    },
    body: JSON.stringify({
      collection: COLLECTION,
      filter: {},
      options: { limit: PAGE_LIMIT, skip },
      db: DB
    })
  });

  if (!response.ok) {
    throw new Error(`Asset API failed ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function fetchAllAssets() {
  const first = await fetchPage(0);
  const docs = [...(first.docs || [])];
  const total = Number(first.total || docs.length);
  for (let skip = PAGE_LIMIT; skip < total; skip += PAGE_LIMIT) {
    const page = await fetchPage(skip);
    docs.push(...(page.docs || []));
  }
  return { total, docs };
}

const { total, docs } = await fetchAllAssets();
const seen = new Set();
const assets = docs
  .map(normalizeRecord)
  .filter((asset) => {
    const key = String(asset.sourceId || asset.url || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

const typeCounts = {};
for (const asset of assets) typeCounts[asset.sourceType] = (typeCounts[asset.sourceType] || 0) + 1;
const uncategorized = assets.filter((asset) => asset.rawType === "");

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "https://teambannersports.com/design-tool/?m=5 reference asset API",
  sourceApi: API_URL,
  db: DB,
  collection: COLLECTION,
  totalFromApi: total,
  assetCount: assets.length,
  typeCounts,
  uncategorizedCount: uncategorized.length,
  assets
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(reportDir, "asset-sync-summary.json"), `${JSON.stringify({
  generatedAt: manifest.generatedAt,
  source: manifest.source,
  totalFromApi: total,
  assetCount: assets.length,
  typeCounts,
  uncategorizedCount: uncategorized.length
}, null, 2)}\n`);
writeCsv(path.join(reportDir, "uncategorized-assets.csv"), uncategorized.map((asset) => ({
  SourceID: asset.sourceId,
  Name: asset.name,
  Category: asset.category,
  Role: asset.role,
  URL: asset.url,
  SVG: asset.svgUrl
})));

console.log(`Fetched ${docs.length}/${total} records from ${API_URL}.`);
console.log(`Wrote ${assets.length} design-tool assets to ${outputPath}.`);
console.log(`Uncategorized records preserved as Clip art: ${uncategorized.length}.`);
