import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = "/Users/si/Downloads/products_export_1_tbd_layer_tags_alt_text_team_logo_title_audited_player_counts.csv";
const DEFAULT_OUTPUT_DIR = "outputs/product-asset-matches-20260521-final-mvp";
const ASSET_MANIFEST = "public/team-banner-assets.shopify.json";
const SVG_DIR = "public/svg-layer-templates";
const MANUAL_LAYER_CORRECTIONS = {
  "super-heroes-soccer-banner": {
    layers: 25,
    players: 10,
    playerIcons: 10,
    playerTexts: 10,
    textLayers: 12
  }
};

const input = process.argv[2] || DEFAULT_INPUT;
const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
const outputCsv = path.join(outputDir, "products_export_1_tbd_layer_tags_asset_matches_final_mvp.csv");
const outputQa = path.join(outputDir, "team-banner-asset-match-qa-final-mvp.csv");
const outputAssetQa = path.join(outputDir, "team-banner-design-tool-assets-tagged-final-mvp.csv");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") quoted = true;
    else if (char === ",") {
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

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function stringifyCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n") + "\n";
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
}

function deburr(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeNumberWords(value) {
  return String(value || "").replace(/\b0+(\d+)\b/g, "$1");
}

function cleanText(value, options = {}) {
  let text = deburr(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
  text = normalizeNumberWords(text);
  if (options.stripTerms) {
    text = text
      .replace(/\b(softball|baseball|soccer|football|basketball|volleyball|cheer|hockey)\b/g, " ")
      .replace(/\b(homeplate|home|plate|triangle|pennant|banners|banner|hem|grommets|grommet|pole|pocket|sleeve|custom|team|picture|copy|bg)\b/g, " ");
  }
  return compact(text);
}

function slug(value) {
  return cleanText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferShape(product) {
  const context = [product.Title, product.Type, product.Tags, product["Product Category"], product.Handle]
    .join(" ")
    .toLowerCase();
  if (/pole[\s-]?pocket|pole[\s-]?sleeve|sleeve/.test(context)) return "polepocket";
  if (/home[\s-]?plate[\s-]?pennant|plate[\s-]?pennant/.test(context)) return "homeplatepennant";
  if (/home[\s-]?plate|homeplate/.test(context)) return "homeplate";
  if (/triangle|pennant/.test(context)) return "triangle";
  return "rectangle";
}

function backgroundCategoryForShape(shape) {
  if (shape === "polepocket") return "BG Pole Pocket";
  if (shape === "homeplate" || shape === "homeplatepennant") return "BG Home Plate";
  if (shape === "triangle") return "BG Triangle";
  return "BG Hem & Grommets";
}

function sportForProduct(product) {
  const text = [product.Title, product.Type, product.Tags, product.Handle].join(" ").toLowerCase();
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoftball\b/.test(text)) return "softball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  if (/\bfootball\b/.test(text)) return "football";
  if (/\bbasketball\b/.test(text)) return "basketball";
  return "";
}

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readTbdValue(tags, keys, fallback = "") {
  for (const key of keys) {
    const prefix = `${key}:`;
    const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
    if (match) return match.slice(prefix.length);
  }
  return fallback;
}

function setTags(existing, nextTags) {
  const removePrefixes = [
    "tbd:asset-key:",
    "tbd:asset-match:",
    "tbd:layout-source:",
    "tbd:layout-svg:",
    "tbd:bg-asset-id:",
    "tbd:bg-asset:",
    "tbd:bg-svg:",
    "tbd:team-logo-asset-id:",
    "tbd:team-logo-asset:",
    "tbd:team-logo-svg:",
    "tbd:clipart-asset-id:",
    "tbd:clipart-asset:",
    "tbd:clipart-svg:",
    "tbd:accessory-asset-id:",
    "tbd:accessory-asset:",
    "tbd:accessory-svg:"
  ];
  const kept = tagList(existing).filter((tag) => {
    const lower = tag.toLowerCase();
    return !removePrefixes.some((prefix) => lower.startsWith(prefix));
  });
  const seen = new Set();
  return [...kept, ...nextTags]
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function applyManualLayerCorrections(handle, tagsValue) {
  const correction = MANUAL_LAYER_CORRECTIONS[handle];
  if (!correction) return tagsValue;
  const removePrefixes = [
    "tbd:layers:",
    "tbd:players:",
    "tbd:player-icons:",
    "tbd:player-names:",
    "tbd:player-texts:",
    "tbd:player-text:",
    "tbd:text-layers:"
  ];
  const kept = tagList(tagsValue).filter((tag) => {
    const lower = tag.toLowerCase();
    return !removePrefixes.some((prefix) => lower.startsWith(prefix));
  });
  return [
    ...kept,
    `tbd:layers:${correction.layers}`,
    `tbd:players:${correction.players}`,
    `tbd:player-icons:${correction.playerIcons}`,
    `tbd:player-names:${correction.playerTexts}`,
    `tbd:player-texts:${correction.playerTexts}`,
    `tbd:text-layers:${correction.textLayers}`
  ].join(", ");
}

function svgId(url) {
  const file = String(url || "").split("?")[0].split("/").pop() || "";
  return file.replace(/\.svg$/i, "");
}

function canonicalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return text.split("#")[0].split("?")[0];
  }
}

function roleForCategory(category) {
  if (/^BG /.test(category)) return "background";
  if (category === "Team name") return "team-name-logo";
  if (category === "Clip art") return "clipart";
  if (category === "Accessory") return "accessory-player-icon";
  return "asset";
}

function sourceTypeForCategory(category) {
  if (category === "BG Hem & Grommets") return "bg_hem_grommets";
  if (category === "BG Pole Pocket") return "bg_pole_pocket";
  if (category === "BG Triangle") return "bg_triangle";
  if (category === "BG Home Plate") return "bg_home_plate";
  if (category === "Team name") return "teamname";
  if (category === "Clip art") return "clipart";
  if (category === "Accessory") return "accessory";
  return slug(category);
}

function assetMatchKey(asset) {
  return cleanText(asset.name, { stripTerms: true });
}

function productTeamName(product) {
  const tags = tagList(product.Tags);
  const fromTag = readTbdValue(tags, ["tbd:team-logo-title", "tbd:logo-title"], "");
  const base = fromTag
    || String(product.Title || product.Handle || "").split(/\s+-\s+/)[0]
    || product.Handle;
  return compact(base);
}

function productMatchKey(product) {
  return cleanText(productTeamName(product), { stripTerms: true })
    || cleanText(product.Handle, { stripTerms: true });
}

function numericTokens(value) {
  return new Set((cleanText(value).match(/\b\d+\b/g) || []).map(String));
}

function sportTokens(value) {
  const text = cleanText(value);
  return ["baseball", "softball", "soccer", "football", "basketball"].filter((sport) => new RegExp(`\\b${sport}\\b`).test(text));
}

function assetScore(asset, product) {
  const productKey = productMatchKey(product);
  const productRaw = cleanText(productTeamName(product));
  const assetKey = assetMatchKey(asset);
  const assetRaw = cleanText(asset.name);
  const sport = sportForProduct(product);
  const keys = [productKey, productRaw, cleanText(product.Handle, { stripTerms: true })].filter(Boolean);

  let score = 0;
  for (const key of keys) {
    if (!key) continue;
    if (assetKey === key) score = Math.max(score, 160);
    if (assetRaw === key) score = Math.max(score, 150);
    if (assetKey.startsWith(`${key} `) || key.startsWith(`${assetKey} `)) score = Math.max(score, 120);
    if (assetRaw.includes(key) || key.includes(assetKey)) score = Math.max(score, 96);

    const assetTokens = new Set(assetKey.split(" ").filter(Boolean));
    const keyTokens = key.split(" ").filter(Boolean);
    const overlap = keyTokens.filter((token) => assetTokens.has(token)).length;
    if (keyTokens.length && overlap / keyTokens.length >= 0.72) {
      score = Math.max(score, 60 + overlap * 8);
    }
  }

  const productNumbers = numericTokens(productKey);
  const assetNumbers = numericTokens(assetKey);
  if (productNumbers.size) {
    const matchesAll = [...productNumbers].every((num) => assetNumbers.has(num));
    score += matchesAll ? 24 : -70;
  } else if (assetNumbers.size && score < 150) {
    score -= 8;
  }

  const assetSports = sportTokens(asset.name);
  if (sport && assetSports.includes(sport)) score += 8;
  if (sport && assetSports.length && !assetSports.includes(sport)) score -= 22;
  if (asset.sourceId) score += 1;
  return score;
}

function bestAsset(assets, category, product, minimumScore = 72) {
  let best = null;
  let score = -Infinity;
  for (const asset of assets) {
    if (asset.category !== category) continue;
    const nextScore = assetScore(asset, product);
    if (nextScore > score) {
      best = asset;
      score = nextScore;
    }
  }
  if (best && score >= minimumScore) return { asset: best, score };
  return { asset: null, score: score === -Infinity ? 0 : score };
}

function bestBackgroundAsset(assets, category, product) {
  const preferred = bestAsset(assets, category, product, 72);
  if (preferred.asset) return preferred;
  let best = { asset: null, score: preferred.score || 0 };
  for (const fallbackCategory of ["BG Hem & Grommets", "BG Pole Pocket", "BG Triangle", "BG Home Plate"]) {
    const candidate = bestAsset(assets, fallbackCategory, product, 90);
    if (candidate.asset && candidate.score > best.score) best = candidate;
  }
  return best;
}

function exactSvgLayoutIndex() {
  const byBackgroundUrl = new Map();
  if (!fs.existsSync(SVG_DIR)) return byBackgroundUrl;
  for (const file of fs.readdirSync(SVG_DIR).filter((name) => name.endsWith(".svg"))) {
    const fullPath = path.join(SVG_DIR, file);
    const svg = fs.readFileSync(fullPath, "utf8");
    const imageTags = [...svg.matchAll(/<image\b[^>]*>/gi)].map((match) => match[0]);
    const background = imageTags.find((tag) => /\bbackground\b/i.test(tag) || /\blocked\b/i.test(tag)) || imageTags[0];
    if (!background) continue;
    const href = (background.match(/\b(?:xlink:href|href)=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    byBackgroundUrl.set(canonicalUrl(href), {
      id: file.replace(/\.svg$/i, ""),
      file,
      url: `/svg-layer-templates/${file}`
    });
  }
  return byBackgroundUrl;
}

function tagAsset(asset) {
  const category = asset.category || "";
  const type = asset.sourceType || sourceTypeForCategory(category);
  const key = assetMatchKey(asset);
  return {
    ...asset,
    role: roleForCategory(category),
    matchKey: key,
    assetTags: [
      "tbd:design-tool-asset",
      `tbd:asset-role:${roleForCategory(category)}`,
      `tbd:asset-category:${slug(category)}`,
      type ? `tbd:asset-source-type:${type}` : "",
      key ? `tbd:asset-key:${slug(key)}` : "",
      asset.sourceId ? `tbd:asset-id:${asset.sourceId}` : "",
      asset.svgUrl ? `tbd:asset-svg:${svgId(asset.svgUrl)}` : ""
    ].filter(Boolean)
  };
}

function matchedTags(match) {
  const tags = [
    `tbd:asset-key:${slug(match.teamName)}`,
    `tbd:asset-match:${match.status}`,
    `tbd:layout-source:${match.layout ? "svg-template" : "design-tool-assets"}`
  ];
  if (match.layout) tags.push(`tbd:layout-svg:${match.layout.id}`);
  [
    ["bg", match.background],
    ["team-logo", match.teamNameAsset],
    ["clipart", match.clipart],
    ["accessory", match.accessory]
  ].forEach(([prefix, result]) => {
    if (!result.asset) return;
    tags.push(`tbd:${prefix}-asset-id:${result.asset.sourceId || ""}`);
    tags.push(`tbd:${prefix}-asset:${slug(result.asset.name)}`);
    if (result.asset.svgUrl) tags.push(`tbd:${prefix}-svg:${svgId(result.asset.svgUrl)}`);
  });
  return tags.filter((tag) => !tag.endsWith(":"));
}

function matchProduct(product, assets, layoutByBackground) {
  const shape = inferShape(product);
  const teamName = productTeamName(product);
  const background = bestBackgroundAsset(assets, backgroundCategoryForShape(shape), product);
  const teamNameAsset = bestAsset(assets, "Team name", product);
  const clipart = bestAsset(assets, "Clip art", product);
  const accessory = bestAsset(assets, "Accessory", product, 62);
  const layout = background.asset ? layoutByBackground.get(canonicalUrl(background.asset.url)) || null : null;
  const required = [background.asset, teamNameAsset.asset, accessory.asset];
  const optional = clipart.asset;
  const status = required.every(Boolean) && optional
    ? "complete"
    : required.every(Boolean)
      ? "partial-no-clipart"
      : "partial";
  return {
    handle: product.Handle,
    title: product.Title,
    shape,
    teamName,
    sport: sportForProduct(product),
    background,
    teamNameAsset,
    clipart,
    accessory,
    layout,
    status
  };
}

function maybeAltText(product) {
  const current = String(product["Image Alt Text"] || "").trim();
  if (current) return current;
  const team = productTeamName(product);
  const sport = sportForProduct(product);
  const shape = inferShape(product);
  const type = shape === "triangle"
    ? "Triangle Pennant"
    : shape === "homeplate" || shape === "homeplatepennant"
      ? "Home Plate Banner"
      : shape === "polepocket"
        ? "Pole Pocket Banner"
        : "5x3 Banner";
  return [team, sport ? sport[0].toUpperCase() + sport.slice(1) : "", type].filter(Boolean).join(" - ");
}

const source = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(source).filter((row) => row.some((field) => field.trim()));
const headers = rows.shift();
const rowObjects = rows.map((row) => rowObject(headers, row));
const rawAssetManifest = JSON.parse(fs.readFileSync(ASSET_MANIFEST, "utf8"));
const taggedAssets = (Array.isArray(rawAssetManifest.assets) ? rawAssetManifest.assets : rawAssetManifest).map(tagAsset);
const layoutByBackground = exactSvgLayoutIndex();

const productsByHandle = new Map();
for (const row of rowObjects) {
  const handle = row.Handle;
  if (!handle) continue;
  const current = productsByHandle.get(handle);
  if (!current) {
    productsByHandle.set(handle, row);
    continue;
  }
  if (!current["Image Src"] && row["Image Src"]) current["Image Src"] = row["Image Src"];
  if (!current["Image Alt Text"] && row["Image Alt Text"]) current["Image Alt Text"] = row["Image Alt Text"];
}

const matchesByHandle = new Map();
for (const product of productsByHandle.values()) {
  matchesByHandle.set(product.Handle, matchProduct(product, taggedAssets, layoutByBackground));
}

for (const row of rowObjects) {
  const match = matchesByHandle.get(row.Handle);
  if (!match) continue;
  row.Tags = setTags(row.Tags, matchedTags(match));
  row.Tags = applyManualLayerCorrections(row.Handle, row.Tags);
  if ("Image Alt Text" in row) row["Image Alt Text"] = maybeAltText(row);
}

const assetQaRows = taggedAssets.map((asset) => ({
  "Source ID": asset.sourceId || "",
  Name: asset.name || "",
  Category: asset.category || "",
  Role: asset.role || "",
  "Match Key": asset.matchKey || "",
  URL: asset.url || "",
  "SVG URL": asset.svgUrl || "",
  Tags: (asset.assetTags || []).join(", ")
}));

const qaRows = [...matchesByHandle.values()].map((match) => ({
  Handle: match.handle,
  Title: match.title,
  Shape: match.shape,
  Sport: match.sport,
  "Team / Logo Title": match.teamName,
  "Match Status": match.status,
  "Layout SVG": match.layout ? match.layout.url : "",
  "BG Asset ID": match.background.asset?.sourceId || "",
  "BG Asset": match.background.asset?.name || "",
  "BG Score": Math.round(match.background.score || 0),
  "BG URL": match.background.asset?.url || "",
  "Team Logo Asset ID": match.teamNameAsset.asset?.sourceId || "",
  "Team Logo Asset": match.teamNameAsset.asset?.name || "",
  "Team Logo Score": Math.round(match.teamNameAsset.score || 0),
  "Team Logo URL": match.teamNameAsset.asset?.url || "",
  "Clipart Asset ID": match.clipart.asset?.sourceId || "",
  "Clipart Asset": match.clipart.asset?.name || "",
  "Clipart Score": Math.round(match.clipart.score || 0),
  "Clipart URL": match.clipart.asset?.url || "",
  "Accessory Asset ID": match.accessory.asset?.sourceId || "",
  "Accessory Asset": match.accessory.asset?.name || "",
  "Accessory Score": Math.round(match.accessory.score || 0),
  "Accessory URL": match.accessory.asset?.url || ""
}));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputCsv, stringifyCsv(headers, rowObjects));
fs.writeFileSync(outputQa, stringifyCsv(Object.keys(qaRows[0] || {}), qaRows));
fs.writeFileSync(outputAssetQa, stringifyCsv(Object.keys(assetQaRows[0] || {}), assetQaRows));

const nextAssetManifest = Array.isArray(rawAssetManifest.assets)
  ? { ...rawAssetManifest, taggedAt: new Date().toISOString(), assets: taggedAssets }
  : taggedAssets;
fs.writeFileSync(ASSET_MANIFEST, `${JSON.stringify(nextAssetManifest, null, 2)}\n`);

const stats = qaRows.reduce((acc, row) => {
  acc[row["Match Status"]] = (acc[row["Match Status"]] || 0) + 1;
  if (row["Layout SVG"]) acc.withLayout += 1;
  return acc;
}, { complete: 0, "partial-no-clipart": 0, partial: 0, withLayout: 0 });

console.log(`Tagged ${taggedAssets.length} design-tool assets.`);
console.log(`Matched ${qaRows.length} products: ${JSON.stringify(stats)}`);
console.log(`Wrote ${outputCsv}`);
console.log(`Wrote ${outputQa}`);
