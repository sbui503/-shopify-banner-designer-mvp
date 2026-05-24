import fs from "node:fs";
import path from "node:path";

const DEFAULT_LOCAL_DIR = "public/missing-assets";
const DEFAULT_BASE_MANIFEST = "public/team-banner-assets.shopify.json";
const DEFAULT_OUTPUT = "public/team-banner-assets.with-local.json";

const localDir = process.argv[2] || DEFAULT_LOCAL_DIR;
const baseManifestPath = process.argv[3] || DEFAULT_BASE_MANIFEST;
const outputPath = process.argv[4] || DEFAULT_OUTPUT;

function deburr(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value) {
  return deburr(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return cleanText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function assetCategoryFromPath(filePath) {
  const text = cleanText(filePath);
  if (/bg|background|hem|grommet/.test(text) && !/pole|triangle|home/.test(text)) return "BG Hem & Grommets";
  if (/pole|pocket|sleeve/.test(text)) return "BG Pole Pocket";
  if (/home\s*plate|homeplate/.test(text)) return "BG Home Plate";
  if (/triangle|pennant/.test(text)) return "BG Triangle";
  if (/team\s*name|teamname|team\s*logo|logo/.test(text)) return "Team name";
  if (/clip\s*art|clipart|mascot|art/.test(text)) return "Clip art";
  if (/accessory|access|player\s*icon|playericon|ball|star|sport/.test(text)) return "Accessory";
  return "Clip art";
}

function roleForCategory(category) {
  if (String(category || "").startsWith("BG ")) return "background";
  if (category === "Team name") return "team-name-logo";
  if (category === "Accessory") return "accessory-player-icon";
  return "clipart";
}

function sourceTypeForCategory(category) {
  if (category === "BG Hem & Grommets") return "local_bg_hem_grommets";
  if (category === "BG Pole Pocket") return "local_bg_pole_pocket";
  if (category === "BG Triangle") return "local_bg_triangle";
  if (category === "BG Home Plate") return "local_bg_home_plate";
  if (category === "Team name") return "local_teamname";
  if (category === "Accessory") return "local_accessory";
  return "local_clipart";
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (!/\.(png|jpe?g|webp|svg)$/i.test(entry.name)) return [];
    return [fullPath];
  });
}

function publicUrlForFile(filePath) {
  const publicRoot = path.resolve("public");
  const resolved = path.resolve(filePath);
  const relative = path.relative(publicRoot, resolved);
  if (relative.startsWith("..")) {
    throw new Error(`Local asset must be inside public/: ${filePath}`);
  }
  return `/${relative.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function matchingSvgUrl(filePath, url) {
  if (/\.svg$/i.test(filePath)) return url;
  const svgPath = filePath.replace(/\.[a-z0-9]+$/i, ".svg");
  return fs.existsSync(svgPath) ? publicUrlForFile(svgPath) : "";
}

function localAsset(filePath) {
  const category = assetCategoryFromPath(filePath);
  const url = publicUrlForFile(filePath);
  const name = path.basename(filePath).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
  const id = `local-${slug(category)}-${slug(name)}`;
  return {
    name,
    category,
    url,
    svgUrl: matchingSvgUrl(filePath, url),
    sourceType: sourceTypeForCategory(category),
    sourceId: id,
    role: roleForCategory(category),
    matchKey: cleanText(name),
    assetTags: [
      "tbd:design-tool-asset",
      "tbd:local-missing-asset",
      `tbd:asset-role:${roleForCategory(category)}`,
      `tbd:asset-category:${slug(category)}`,
      `tbd:asset-source-type:${sourceTypeForCategory(category)}`,
      `tbd:asset-key:${slug(name)}`,
      `tbd:asset-id:${id}`
    ]
  };
}

const base = fs.existsSync(baseManifestPath)
  ? JSON.parse(fs.readFileSync(baseManifestPath, "utf8"))
  : { assets: [] };
const baseAssets = Array.isArray(base.assets) ? base.assets : Array.isArray(base) ? base : [];
const files = listFiles(localDir);
const localAssets = files.map(localAsset);
const seen = new Set();
const assets = [...baseAssets, ...localAssets].filter((asset) => {
  const key = String(asset.sourceId || asset.url || "");
  if (!key || seen.has(key)) return false;
  seen.add(key);
  return true;
});

const output = Array.isArray(base.assets)
  ? { ...base, localAssetsAddedAt: new Date().toISOString(), localAssetCount: localAssets.length, assets }
  : assets;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Found ${localAssets.length} local assets in ${localDir}.`);
console.log(`Wrote ${assets.length} total assets to ${outputPath}.`);
