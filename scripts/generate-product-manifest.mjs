import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const output = process.argv[3] || "public/team-banner-products.json";
const assetManifestPath = process.argv[4] || "public/team-banner-assets.shopify.json";
const publicAssetBase = process.argv[5] || "https://files-mentioned-by-the-user-shopify.vercel.app";

if (!input) {
  console.error("Usage: node scripts/generate-product-manifest.mjs <products.csv> [output.json]");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readAssetManifest(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(data.assets) ? data.assets : Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

const assetsById = new Map(
  readAssetManifest(assetManifestPath)
    .filter((asset) => asset && asset.sourceId)
    .map((asset) => [String(asset.sourceId), asset])
);

function svgId(url) {
  const file = String(url || "").split("?")[0].split("/").pop() || "";
  return file.replace(/\.svg$/i, "");
}

function publicUrl(filePath) {
  if (!filePath) return "";
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${publicAssetBase.replace(/\/$/, "")}/${String(filePath).replace(/^\/+/, "")}`;
}

function assetFromTag(tags, keys) {
  const id = readTbdValue(tags, keys, "");
  return id ? assetsById.get(String(id)) || null : null;
}

function inferShape(product) {
  const context = [
    product.title,
    product.type,
    product.tags,
    product.productCategory,
    product.handle
  ].join(" ").toLowerCase();

  if (/pole[\s-]?pocket|pole[\s-]?sleeve|sleeve/.test(context)) return "polepocket";
  if (/home[\s-]?plate[\s-]?pennant|plate[\s-]?pennant/.test(context)) return "homeplatepennant";
  if (/home[\s-]?plate|homeplate/.test(context)) return "homeplate";
  if (/triangle|pennant/.test(context)) return "triangle";
  return "rectangle";
}

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readTbdNumber(tags, keys, fallback = 0) {
  for (const key of keys) {
    const prefix = `${key}:`;
    const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
    if (!match) continue;
    const value = Number(match.slice(prefix.length));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function readTbdValue(tags, keys, fallback = "") {
  for (const key of keys) {
    const prefix = `${key}:`;
    const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
    if (match) return match.slice(prefix.length);
  }
  return fallback;
}

function defaultLayerConfig(product) {
  const shape = inferShape(product);
  if (shape === "rectangle" || shape === "polepocket") {
    return {
      layerCount: 29,
      backgroundCount: 1,
      teamLogoCount: 1,
      clipartCount: 1,
      playerCount: 12,
      playerIconCount: 12,
      playerTextCount: 12,
      playerLabel: "Player",
      textLayerCount: 14,
      headerTextCount: 2,
      coachNameCount: 1,
      teamMomNameCount: 1,
      yearTextCount: 0
    };
  }

  return {
    layerCount: 6,
    backgroundCount: 1,
    teamLogoCount: 1,
    clipartCount: 1,
    playerCount: 1,
    playerIconCount: 1,
    playerTextCount: 1,
    playerLabel: "Player",
    textLayerCount: 2,
    headerTextCount: 0,
    coachNameCount: 0,
    teamMomNameCount: 0,
    yearTextCount: 1
  };
}

function layerConfigFromTags(product) {
  const tags = tagList(product.tags);
  const defaults = defaultLayerConfig(product);
  const playerCount = readTbdNumber(tags, ["tbd:players"], defaults.playerCount);
  const playerTextCount = readTbdNumber(tags, ["tbd:player-names", "tbd:player-texts", "tbd:player-text"], defaults.playerTextCount || playerCount);
  const playerIconCount = readTbdNumber(tags, ["tbd:player-icons", "tbd:accessories"], defaults.playerIconCount || playerCount);
  const playerLabel = readTbdValue(tags, ["tbd:player-label"], defaults.playerLabel || "Player");
  const headerTextCount = readTbdNumber(tags, ["tbd:header-texts"], defaults.headerTextCount);
  const coachNameCount = readTbdNumber(tags, ["tbd:coach-name"], headerTextCount > 0 ? 1 : defaults.coachNameCount);
  const teamMomNameCount = readTbdNumber(tags, ["tbd:team-mom-name"], headerTextCount > 1 ? 1 : defaults.teamMomNameCount);
  const yearTextCount = readTbdNumber(tags, ["tbd:year-texts"], defaults.yearTextCount);
  const textLayerCount = readTbdNumber(tags, ["tbd:text-layers"], defaults.textLayerCount || playerTextCount + headerTextCount + yearTextCount);
  const backgroundCount = readTbdNumber(tags, ["tbd:background"], defaults.backgroundCount);
  const teamLogoCount = readTbdNumber(tags, ["tbd:team-logo", "tbd:logo"], defaults.teamLogoCount);
  const clipartCount = readTbdNumber(tags, ["tbd:clipart"], defaults.clipartCount);
  const layerCount = readTbdNumber(
    tags,
    ["tbd:layers"],
    backgroundCount + teamLogoCount + clipartCount + playerIconCount + textLayerCount
  );
  const logoTagUrl = readTbdValue(tags, ["tbd:logo-url", "tbd:team-logo-url"], "");
  const clipartTagUrl = readTbdValue(tags, ["tbd:clipart-url"], "");
  const logoTitle = readTbdValue(tags, ["tbd:team-logo-title", "tbd:logo-title"], "");
  const backgroundAsset = assetFromTag(tags, ["tbd:bg-asset-id", "tbd:background-asset-id"]);
  const logoAsset = assetFromTag(tags, ["tbd:team-logo-asset-id", "tbd:logo-asset-id"]);
  const clipartAsset = assetFromTag(tags, ["tbd:clipart-asset-id"]);
  const accessoryAsset = assetFromTag(tags, ["tbd:accessory-asset-id"]);
  const layoutSvg = readTbdValue(tags, ["tbd:layout-svg"], "");
  const layoutSource = readTbdValue(tags, ["tbd:layout-source"], "");
  const assetMatchStatus = readTbdValue(tags, ["tbd:asset-match"], "");
  const assetKey = readTbdValue(tags, ["tbd:asset-key"], "");

  return {
    ...defaults,
    layerCount,
    backgroundCount,
    teamLogoCount,
    clipartCount,
    playerCount,
    playerIconCount,
    playerTextCount,
    playerLabel,
    textLayerCount,
    headerTextCount,
    coachNameCount,
    teamMomNameCount,
    yearTextCount,
    backgroundAssetId: backgroundAsset ? String(backgroundAsset.sourceId) : "",
    backgroundAssetName: backgroundAsset ? backgroundAsset.name || "" : "",
    backgroundSvgUrl: backgroundAsset ? backgroundAsset.svgUrl || "" : "",
    backgroundSvgId: backgroundAsset ? svgId(backgroundAsset.svgUrl) : "",
    backgroundUrl: backgroundAsset ? backgroundAsset.url : product.image,
    backgroundSource: backgroundAsset ? "design-tool-asset" : readTbdValue(tags, ["tbd:background-url", "tbd:bg-url"], "product-image"),
    logoAssetId: logoAsset ? String(logoAsset.sourceId) : "",
    logoAssetName: logoAsset ? logoAsset.name || "" : "",
    logoSvgUrl: logoAsset ? logoAsset.svgUrl || "" : "",
    logoSvgId: logoAsset ? svgId(logoAsset.svgUrl) : "",
    logoUrl: logoAsset ? logoAsset.url : logoTagUrl && logoTagUrl !== "crop" ? logoTagUrl : product.image,
    logoTitle,
    logoSource: logoAsset ? "design-tool-asset" : logoTagUrl === "crop" ? "crop" : readTbdValue(tags, ["tbd:logo-source", "tbd:team-logo-source"], "crop"),
    clipartAssetId: clipartAsset ? String(clipartAsset.sourceId) : "",
    clipartAssetName: clipartAsset ? clipartAsset.name || "" : "",
    clipartSvgUrl: clipartAsset ? clipartAsset.svgUrl || "" : "",
    clipartSvgId: clipartAsset ? svgId(clipartAsset.svgUrl) : "",
    clipartUrl: clipartAsset ? clipartAsset.url : clipartTagUrl && clipartTagUrl !== "crop" ? clipartTagUrl : product.image,
    clipartSource: clipartAsset ? "design-tool-asset" : clipartTagUrl === "crop" ? "crop" : readTbdValue(tags, ["tbd:clipart-source"], "crop"),
    accessoryAssetId: accessoryAsset ? String(accessoryAsset.sourceId) : "",
    accessoryAssetName: accessoryAsset ? accessoryAsset.name || "" : "",
    accessorySvgUrl: accessoryAsset ? accessoryAsset.svgUrl || "" : "",
    accessorySvgId: accessoryAsset ? svgId(accessoryAsset.svgUrl) : "",
    accessoryUrl: accessoryAsset ? accessoryAsset.url : "",
    accessorySource: accessoryAsset ? "design-tool-asset" : "",
    assetKey,
    assetMatchStatus,
    layoutSource,
    layoutSvg,
    layoutSvgUrl: layoutSvg ? publicUrl(`/svg-layer-templates/${layoutSvg}.svg`) : ""
  };
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
}

const source = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(source).filter((row) => row.some((field) => field.trim()));
const headers = rows.shift();
const productsByHandle = new Map();

for (const values of rows) {
  const row = rowObject(headers, values);
  const handle = row.Handle || "";
  if (!handle) continue;

  const existing = productsByHandle.get(handle);
  const next = existing || {
    handle,
    title: row.Title || handle,
    titleSlug: slug(row.Title || handle),
    type: row.Type || "",
    tags: row.Tags || "",
    productCategory: row["Product Category"] || "",
    vendor: row.Vendor || "",
    sku: row["Variant SKU"] || "",
    price: row["Variant Price"] || "",
    compareAtPrice: row["Variant Compare At Price"] || "",
    image: "",
    imageAlt: "",
    url: `https://teamsportbanners.com/products/${handle}`,
    path: `/products/${handle}`,
    status: row.Status || ""
  };

  if (!next.image && row["Image Src"]) {
    next.image = row["Image Src"];
    next.imageAlt = row["Image Alt Text"] || row.Title || handle;
  }

  next.shape = inferShape(next);
  next.layerConfig = layerConfigFromTags(next);
  next.templateSvg = next.layerConfig.layoutSvgUrl || "";
  productsByHandle.set(handle, next);
}

const products = [...productsByHandle.values()]
  .filter((product) => product.image)
  .sort((a, b) => a.handle.localeCompare(b.handle));

const manifest = {
  generatedAt: new Date().toISOString(),
  source: path.basename(input),
  count: products.length,
  products
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${products.length} products to ${output}`);
