import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "public/team-banner-products.json";
const DEFAULT_PRODUCTS_CSV = "outputs/product-asset-matches-20260521-final-mvp/products_export_1_tbd_layer_tags_asset_matches_final_mvp.csv";
const DEFAULT_ASSETS = "public/team-banner-assets.shopify.json";
const DEFAULT_OUTPUT_DIR = "outputs/design-tool-asset-repair-20260523";
const SVG_DIR = "public/svg-layer-templates";

const manifestPath = process.argv[2] || DEFAULT_MANIFEST;
const productCsvPath = process.argv[3] || DEFAULT_PRODUCTS_CSV;
const assetManifestPath = process.argv[4] || DEFAULT_ASSETS;
const outputDir = process.argv[5] || DEFAULT_OUTPUT_DIR;

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

  return rows.filter((cells) => cells.some((cell) => String(cell || "").trim()));
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

function expandCompactWords(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return compact(
    deburr(expandCompactWords(value))
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/['’]/g, "")
      .replace(/\b0+(\d+)\b/g, "$1")
      .replace(/[^a-z0-9]+/g, " ")
  );
}

function stripLayerTerms(value) {
  return compact(
    cleanText(value)
      .replace(/\b(softball|baseball|soccer|football|basketball|volleyball|hockey|cheer)\b/g, " ")
      .replace(/\b(homeplate|home|plate|triangle|pennant|banners|banner|hem|grommets|grommet|pole|pocket|sleeve|custom|team|picture|copy|backgrounds|background|images|image|art|clip|access|accessory|bg)\b/g, " ")
  );
}

function slug(value) {
  return cleanText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filenameBase(url) {
  const raw = String(url || "").split("?")[0].split("#")[0].split("/").pop() || "";
  return raw.replace(/\.[a-z0-9]+$/i, "");
}

function imageAliasesFromUrl(url) {
  const base = filenameBase(url);
  if (!base) return [];
  const withoutTrailingDesignNumber = base.replace(/(?:[-_\s]+0?1)$/i, "");
  const withoutTimestamp = withoutTrailingDesignNumber.replace(/[-_\s]+1[0-9]{9,}$/g, "");
  return [base, withoutTrailingDesignNumber, withoutTimestamp];
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
    "tbd:accessory-svg:",
    "tbd:asset-repair:",
    "tbd:asset-repair-applied:",
    "tbd:asset-repair-review:",
    "tbd:missing-asset-roles:",
    "tbd:qa-"
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

function svgId(url) {
  const file = filenameBase(url);
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

function backgroundCategoryForShape(shape) {
  if (shape === "polepocket") return "BG Pole Pocket";
  if (shape === "homeplate" || shape === "homeplatepennant") return "BG Home Plate";
  if (shape === "triangle") return "BG Triangle";
  return "BG Hem & Grommets";
}

function sportForProduct(product) {
  const text = cleanText([
    product.title,
    product.type,
    product.tags,
    product.handle
  ].join(" "));
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoftball\b/.test(text)) return "softball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  if (/\bfootball\b/.test(text)) return "football";
  if (/\bbasketball\b/.test(text)) return "basketball";
  return "";
}

function roleSpecs(product) {
  const config = product.layerConfig || {};
  return [
    {
      role: "background",
      label: "Background",
      prefix: "bg",
      key: "background",
      category: backgroundCategoryForShape(product.shape),
      required: Number(config.backgroundCount || 0) > 0,
      currentId: config.backgroundAssetId || "",
      currentUrl: config.backgroundUrl || ""
    },
    {
      role: "team-logo",
      label: "Team name / logo",
      prefix: "team-logo",
      key: "logo",
      category: "Team name",
      required: Number(config.teamLogoCount || 0) > 0,
      currentId: config.logoAssetId || "",
      currentUrl: config.logoUrl || ""
    },
    {
      role: "clipart",
      label: "Clip art",
      prefix: "clipart",
      key: "clipart",
      category: "Clip art",
      required: Number(config.clipartCount || 0) > 0,
      currentId: config.clipartAssetId || "",
      currentUrl: config.clipartUrl || ""
    },
    {
      role: "accessory-player-icon",
      label: "Accessory / Player icon",
      prefix: "accessory",
      key: "accessory",
      category: "Accessory",
      required: Number(config.playerIconCount || 0) > 0,
      currentId: config.accessoryAssetId || "",
      currentUrl: config.accessoryUrl || ""
    }
  ];
}

function productTeamName(product) {
  const config = product.layerConfig || {};
  const fromConfig = config.logoTitle || "";
  const fromTitle = String(product.title || product.handle || "").split(/\s+-\s+/)[0];
  return compact(fromConfig || fromTitle || product.handle || "");
}

function productAliases(product) {
  const title = product.title || "";
  const team = productTeamName(product);
  const handleBase = String(product.handle || "")
    .replace(/-(soccer|baseball|softball|football|basketball|homeplate|home-plate|home|triangle|banner|banners|pennant).*$/i, "");
  const values = [
    team,
    title,
    String(title).split(/\s+-\s+/)[0],
    product.handle,
    handleBase,
    ...(imageAliasesFromUrl(product.image || "")),
    ...(imageAliasesFromUrl((product.layerConfig || {}).backgroundUrl || ""))
  ];
  const aliases = [];
  values.forEach((value) => {
    const raw = cleanText(value);
    const stripped = stripLayerTerms(value);
    [raw, stripped].forEach((alias) => {
      if (alias.length >= 3) aliases.push(alias);
      const noTrailingNumber = alias.replace(/\s+\d+$/g, "").trim();
      if (noTrailingNumber.length >= 3) aliases.push(noTrailingNumber);
    });
  });
  return [...new Set(aliases)].filter(Boolean);
}

function numericTokens(value) {
  return new Set((cleanText(value).match(/\b\d+\b/g) || []).map(String));
}

function assetSearchTexts(asset) {
  if (asset._searchTexts) return asset._searchTexts;
  return [
    cleanText(asset.name),
    stripLayerTerms(asset.name),
    cleanText(filenameBase(asset.url)),
    stripLayerTerms(filenameBase(asset.url)),
    asset.matchKey ? cleanText(asset.matchKey) : "",
    asset.matchKey ? stripLayerTerms(asset.matchKey) : ""
  ].filter(Boolean);
}

function searchTokens(values) {
  const ignored = new Set([
    "and",
    "the",
    "banner",
    "banners",
    "pennant",
    "home",
    "plate",
    "triangle",
    "hem",
    "grommets",
    "pole",
    "pocket",
    "soccer",
    "baseball",
    "softball",
    "football",
    "basketball"
  ]);
  return [...new Set(
    values
      .flatMap((value) => cleanText(value).split(" "))
      .filter((token) => token.length >= 2 && !ignored.has(token))
  )];
}

function indexedAssetsByCategory(assets) {
  const byCategory = new Map();
  assets.forEach((asset) => {
    const indexed = {
      ...asset,
      _searchTexts: [
        cleanText(asset.name),
        stripLayerTerms(asset.name),
        cleanText(filenameBase(asset.url)),
        stripLayerTerms(filenameBase(asset.url)),
        asset.matchKey ? cleanText(asset.matchKey) : "",
        asset.matchKey ? stripLayerTerms(asset.matchKey) : ""
      ].filter(Boolean)
    };
    if (!byCategory.has(indexed.category)) byCategory.set(indexed.category, { assets: [], byToken: new Map() });
    const categoryIndex = byCategory.get(indexed.category);
    categoryIndex.assets.push(indexed);
    searchTokens(indexed._searchTexts).forEach((token) => {
      if (!categoryIndex.byToken.has(token)) categoryIndex.byToken.set(token, []);
      categoryIndex.byToken.get(token).push(indexed);
    });
  });
  return byCategory;
}

function scoreAsset(asset, product, aliases) {
  const assetTexts = assetSearchTexts(asset);
  const sport = sportForProduct(product);
  const productNumberSets = aliases.map(numericTokens).filter((set) => set.size);
  let best = 0;
  let reason = "";

  for (const alias of aliases) {
    const aliasNumbers = numericTokens(alias);
    for (const assetText of assetTexts) {
      if (!assetText) continue;
      let score = 0;
      let nextReason = "";

      if (assetText === alias) {
        score = 220;
        nextReason = "exact-name";
      } else if (assetText.startsWith(`${alias} `) || alias.startsWith(`${assetText} `)) {
        score = 150;
        nextReason = "starts-with";
      } else if (assetText.includes(alias) || alias.includes(assetText)) {
        score = 118;
        nextReason = "contains";
      } else {
        const assetTokens = new Set(assetText.split(" ").filter(Boolean));
        const aliasTokens = alias.split(" ").filter(Boolean);
        const overlap = aliasTokens.filter((token) => assetTokens.has(token)).length;
        if (aliasTokens.length && overlap / aliasTokens.length >= 0.75) {
          score = 72 + overlap * 8;
          nextReason = "token-overlap";
        }
      }

      if (!score) continue;

      const assetNumbers = numericTokens(assetText);
      if (aliasNumbers.size) {
        const matchesAll = [...aliasNumbers].every((num) => assetNumbers.has(num));
        score += matchesAll ? 28 : -48;
      } else if (assetNumbers.size && productNumberSets.length && score < 200) {
        score -= 12;
      }

      if (sport && cleanText([asset.name, asset.url, asset.category].join(" ")).includes(sport)) score += 10;
      if (asset.sourceId) score += 1;

      if (score > best) {
        best = score;
        reason = nextReason;
      }
    }
  }

  return { score: best, reason };
}

function confidenceFor(score, reason) {
  if (score >= 190) return "exact";
  if (score >= 130) return "strong";
  if (score >= 95) return reason === "token-overlap" ? "suggested" : "family";
  if (score >= 72) return "weak";
  return "none";
}

function bestCandidates(assetsByCategory, product, roleSpec) {
  const aliases = productAliases(product);
  const categoryIndex = assetsByCategory.get(roleSpec.category) || { assets: [], byToken: new Map() };
  const candidates = new Set();
  searchTokens(aliases).forEach((token) => {
    (categoryIndex.byToken.get(token) || []).forEach((asset) => candidates.add(asset));
  });
  const scopedAssets = candidates.size ? [...candidates] : categoryIndex.assets;
  return scopedAssets
    .map((asset) => {
      const scored = scoreAsset(asset, product, aliases);
      return {
        asset,
        score: scored.score,
        reason: scored.reason,
        confidence: confidenceFor(scored.score, scored.reason)
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function canApply(candidate, mode) {
  if (!candidate || !candidate.asset) return false;
  if (mode === "safe") return ["exact", "strong"].includes(candidate.confidence);
  if (mode === "aggressive") return ["exact", "strong", "family"].includes(candidate.confidence);
  return false;
}

function assetTags(prefix, candidate) {
  const asset = candidate && candidate.asset;
  if (!asset) return [];
  return [
    `tbd:${prefix}-asset-id:${asset.sourceId || ""}`,
    `tbd:${prefix}-asset:${slug(asset.name || "")}`,
    asset.svgUrl ? `tbd:${prefix}-svg:${svgId(asset.svgUrl)}` : ""
  ].filter((tag) => !tag.endsWith(":"));
}

function existingAssetTags(spec, config) {
  if (!spec.currentId) return [];
  const name = config[`${spec.key}AssetName`] || "";
  const svg = config[`${spec.key}SvgId`] || svgId(config[`${spec.key}SvgUrl`] || "");
  return [
    `tbd:${spec.prefix}-asset-id:${spec.currentId}`,
    name ? `tbd:${spec.prefix}-asset:${slug(name)}` : "",
    svg ? `tbd:${spec.prefix}-svg:${svg}` : ""
  ].filter(Boolean);
}

function productAssetStatus(specs, appliedByRole) {
  const missing = specs
    .filter((spec) => spec.required && !(spec.currentId || appliedByRole.get(spec.role)))
    .map((spec) => spec.role);
  const requiredWithoutClipartMissing = specs
    .filter((spec) => spec.required && spec.role !== "clipart")
    .every((spec) => spec.currentId || appliedByRole.get(spec.role));
  if (!missing.length) return { status: "complete", missing };
  if (missing.length === 1 && missing[0] === "clipart" && requiredWithoutClipartMissing) {
    return { status: "partial-no-clipart", missing };
  }
  return { status: "partial", missing };
}

function applyRepairTags(row, product, mode, productPlan) {
  const config = product.layerConfig || {};
  const specs = roleSpecs(product);
  const appliedByRole = new Map();
  const tags = [
    `tbd:asset-key:${slug(config.assetKey || productTeamName(product))}`
  ];
  const layoutByBackground = productPlan.layoutByBackground;
  let layout = null;
  const reviewRoles = [];
  const appliedRoles = [];

  specs.forEach((spec) => {
    if (!spec.required) return;
    if (spec.currentId) {
      tags.push(...existingAssetTags(spec, config));
      return;
    }
    const candidate = productPlan.bestByRole.get(spec.role);
    if (!canApply(candidate, mode)) return;
    appliedByRole.set(spec.role, candidate);
    appliedRoles.push(`${spec.role}:${candidate.confidence}`);
    if (candidate.confidence === "family") reviewRoles.push(spec.role);
    tags.push(...assetTags(spec.prefix, candidate));
    if (spec.role === "background") {
      layout = layoutByBackground.get(canonicalUrl(candidate.asset.url)) || null;
    }
  });

  if (!layout && config.layoutSvg) {
    tags.push(`tbd:layout-svg:${config.layoutSvg}`);
    tags.push(`tbd:layout-source:${config.layoutSource || "svg-template"}`);
  } else if (layout) {
    tags.push(`tbd:layout-svg:${layout.id}`);
    tags.push("tbd:layout-source:svg-template");
  } else {
    tags.push(`tbd:layout-source:${config.layoutSource || "design-tool-assets"}`);
  }

  const status = productAssetStatus(specs, appliedByRole);
  tags.push(`tbd:asset-match:${status.status}`);
  tags.push(`tbd:asset-repair:${mode}`);
  if (appliedRoles.length) tags.push(`tbd:asset-repair-applied:${appliedRoles.join("+")}`);
  if (reviewRoles.length) tags.push(`tbd:asset-repair-review:${reviewRoles.join("+")}`);
  if (status.missing.length) tags.push(`tbd:missing-asset-roles:${status.missing.join("+")}`);

  return setTags(row.Tags, tags);
}

function loadProducts(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(manifest) ? manifest : manifest.products || [];
}

function loadAssets(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(manifest.assets) ? manifest.assets : Array.isArray(manifest) ? manifest : [];
}

function activeDesignProduct(product) {
  return product.status === "active" && product.type !== "easify_addon_product";
}

fs.mkdirSync(outputDir, { recursive: true });

const products = loadProducts(manifestPath);
const assets = loadAssets(assetManifestPath);
const assetsByCategory = indexedAssetsByCategory(assets);
const csvRows = parseCsv(fs.readFileSync(productCsvPath, "utf8").replace(/^\uFEFF/, ""));
const headers = csvRows.shift();
const rows = csvRows.map((row) => rowObject(headers, row));
const rowsByHandle = new Map();
rows.forEach((row) => {
  if (!row.Handle) return;
  if (!rowsByHandle.has(row.Handle)) rowsByHandle.set(row.Handle, []);
  rowsByHandle.get(row.Handle).push(row);
});

const layoutByBackground = exactSvgLayoutIndex();
const plans = [];
const planByHandle = new Map();
const stillMissing = [];
const stillMissingAggressive = [];

for (const product of products.filter(activeDesignProduct)) {
  const specs = roleSpecs(product);
  const bestByRole = new Map();
  const missingSpecs = specs.filter((spec) => spec.required && !spec.currentId);
  for (const spec of missingSpecs) {
    const candidates = bestCandidates(assetsByCategory, product, spec);
    const best = candidates[0] || null;
    bestByRole.set(spec.role, best);
    const row = {
      Handle: product.handle,
      Title: product.title,
      Shape: product.shape || "",
      Sport: sportForProduct(product),
      Role: spec.role,
      "Needed Category": spec.category,
      "Current Source": spec.currentUrl || "",
      "Best Asset ID": best?.asset?.sourceId || "",
      "Best Asset": best?.asset?.name || "",
      "Best Score": best ? Math.round(best.score) : 0,
      Confidence: best?.confidence || "none",
      Reason: best?.reason || "",
      "Best URL": best?.asset?.url || "",
      "Top Alternatives": candidates
        .slice(1, 4)
        .map((candidate) => `${candidate.asset.sourceId}:${candidate.asset.name}:${Math.round(candidate.score)}:${candidate.confidence}`)
        .join(" | "),
      "Safe Applies": canApply(best, "safe") ? "yes" : "no",
      "Aggressive Applies": canApply(best, "aggressive") ? "yes" : "no",
      "Upload Needed": canApply(best, "safe") ? "no" : "yes"
    };
    plans.push(row);
    if (!canApply(best, "safe")) stillMissing.push(row);
    if (!canApply(best, "aggressive")) stillMissingAggressive.push(row);
  }
  planByHandle.set(product.handle, { bestByRole, layoutByBackground });
}

function cloneRows() {
  return rows.map((row) => ({ ...row }));
}

function writeMode(mode) {
  const nextRows = cloneRows();
  const byHandle = new Map();
  nextRows.forEach((row) => {
    if (!row.Handle) return;
    if (!byHandle.has(row.Handle)) byHandle.set(row.Handle, []);
    byHandle.get(row.Handle).push(row);
  });
  for (const product of products.filter(activeDesignProduct)) {
    const productRows = byHandle.get(product.handle);
    const productPlan = planByHandle.get(product.handle);
    if (!productRows || !productPlan) continue;
    productRows.forEach((row) => {
      row.Tags = applyRepairTags(row, product, mode, productPlan);
    });
  }
  const file = path.join(outputDir, `products_export_tbd_asset_repair_${mode}.csv`);
  fs.writeFileSync(file, stringifyCsv(headers, nextRows));
  return file;
}

const safeCsv = writeMode("safe");
const aggressiveCsv = writeMode("aggressive");

const planHeaders = Object.keys(plans[0] || {
  Handle: "",
  Title: "",
  Shape: "",
  Sport: "",
  Role: "",
  "Needed Category": "",
  "Current Source": "",
  "Best Asset ID": "",
  "Best Asset": "",
  "Best Score": "",
  Confidence: "",
  Reason: "",
  "Best URL": "",
  "Top Alternatives": "",
  "Safe Applies": "",
  "Aggressive Applies": "",
  "Upload Needed": ""
});
const planCsv = path.join(outputDir, "asset-repair-plan.csv");
const missingCsv = path.join(outputDir, "missing-assets-to-upload.csv");
const missingAggressiveCsv = path.join(outputDir, "missing-assets-after-aggressive.csv");
fs.writeFileSync(planCsv, stringifyCsv(planHeaders, plans));
fs.writeFileSync(missingCsv, stringifyCsv(planHeaders, stillMissing));
fs.writeFileSync(missingAggressiveCsv, stringifyCsv(planHeaders, stillMissingAggressive));

const summary = {
  generatedAt: new Date().toISOString(),
  manifestPath,
  productCsvPath,
  assetManifestPath,
  outputDir,
  activeDesignProducts: products.filter(activeDesignProduct).length,
  totalMissingRoleRows: plans.length,
  safeRepairRows: plans.filter((row) => row["Safe Applies"] === "yes").length,
  aggressiveRepairRows: plans.filter((row) => row["Aggressive Applies"] === "yes").length,
  uploadNeededRowsAfterSafe: stillMissing.length,
  uploadNeededRowsAfterAggressive: stillMissingAggressive.length,
  byRole: plans.reduce((acc, row) => {
    const role = row.Role || "unknown";
    acc[role] = acc[role] || { total: 0, safe: 0, aggressive: 0, uploadNeededAfterSafe: 0 };
    acc[role].total += 1;
    if (row["Safe Applies"] === "yes") acc[role].safe += 1;
    if (row["Aggressive Applies"] === "yes") acc[role].aggressive += 1;
    if (row["Upload Needed"] === "yes") acc[role].uploadNeededAfterSafe += 1;
    return acc;
  }, {}),
  outputs: {
    safeCsv,
    aggressiveCsv,
    planCsv,
    missingCsv,
    missingAggressiveCsv
  }
};
const summaryPath = path.join(outputDir, "asset-repair-summary.json");
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(`Analyzed ${summary.activeDesignProducts} active design products.`);
console.log(`Missing role rows: ${summary.totalMissingRoleRows}`);
console.log(`Safe repairs: ${summary.safeRepairRows}`);
console.log(`Aggressive repairs: ${summary.aggressiveRepairRows}`);
console.log(`Still needing upload/review after safe mode: ${summary.uploadNeededRowsAfterSafe}`);
console.log(`Still needing upload/review after aggressive mode: ${summary.uploadNeededRowsAfterAggressive}`);
console.log(`Wrote ${safeCsv}`);
console.log(`Wrote ${aggressiveCsv}`);
console.log(`Wrote ${planCsv}`);
console.log(`Wrote ${missingCsv}`);
console.log(`Wrote ${missingAggressiveCsv}`);
console.log(`Wrote ${summaryPath}`);
