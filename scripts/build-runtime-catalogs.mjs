import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, fileName), "utf8"));
}

function writeCompactJson(fileName, value) {
  fs.writeFileSync(path.join(PUBLIC_DIR, fileName), `${JSON.stringify(value)}\n`);
}

const productLayerKeys = [
  "layerCount",
  "backgroundCount",
  "teamLogoCount",
  "clipartCount",
  "playerCount",
  "playerIconCount",
  "playerTextCount",
  "playerLabel",
  "textLayerCount",
  "headerTextCount",
  "coachNameCount",
  "teamMomNameCount",
  "yearTextCount",
  "logoTitle",
  "assetKey",
  "assetMatchStatus",
  "layoutSource",
  "layoutSvg",
  "layoutSvgUrl",
  "fullyEditable",
  "sourceEditable",
  "needsSourceSvg",
  "objectLayerMode",
  "sourceRoleSummary"
];

function compactLayerConfig(layerConfig = {}) {
  return Object.fromEntries(productLayerKeys
    .filter((key) => layerConfig[key] !== undefined)
    .map((key) => [
      key,
      key === "sourceRoleSummary" && Array.isArray(layerConfig[key])
        ? layerConfig[key].map((entry) => ({ index: entry.index, role: entry.role }))
        : layerConfig[key]
    ]));
}

const productSource = readJson("team-banner-products.json");
const products = (productSource.products || []).map((product) => ({
  ownedRuntime: true,
  handle: product.handle,
  title: product.title,
  titleSlug: product.titleSlug,
  type: product.type,
  price: product.price,
  image: product.image,
  url: product.url,
  path: product.path,
  status: product.status,
  shape: product.shape,
  templateSvg: product.templateSvg,
  layerConfig: compactLayerConfig(product.layerConfig)
}));

const assetSource = readJson("team-banner-assets.owned.json");
const assets = (assetSource.assets || []).map((asset) => ({
  name: asset.name,
  category: asset.category,
  url: asset.url
}));

const mapSource = readJson("team-banner-owned-asset-map.json");
const assetMap = Object.fromEntries(Object.entries(mapSource.assets || {}).map(([key, record]) => [
  key,
  typeof record === "string" ? record : record.url
]));

const templateSource = readJson("svg-layer-templates.json");
const templates = (templateSource.templates || []).map((template) => ({
  name: template.name,
  title: template.title,
  url: template.url,
  type: template.type,
  sport: template.sport,
  playerCount: template.playerCount
}));

writeCompactJson("team-banner-products.runtime.json", {
  policy: "owned-sources-only",
  count: products.length,
  products
});
writeCompactJson("team-banner-assets.runtime.json", {
  policy: "owned-sources-only",
  assetCount: assets.length,
  assets
});
writeCompactJson("team-banner-owned-asset-map.runtime.json", {
  policy: "owned-sources-only",
  assets: assetMap
});
writeCompactJson("svg-layer-templates.runtime.json", {
  policy: "owned-sources-only",
  count: templates.length,
  templates
});

console.log(JSON.stringify({
  products: products.length,
  assets: assets.length,
  assetMapKeys: Object.keys(assetMap).length,
  templates: templates.length
}, null, 2));
