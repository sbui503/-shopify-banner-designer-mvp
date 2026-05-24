import fs from "node:fs";
import path from "node:path";

const DEFAULT_MANIFEST = "public/team-banner-products.json";
const DEFAULT_PRODUCT_CSV = "outputs/product-asset-matches-20260521-final-mvp/products_export_1_tbd_layer_tags_asset_matches_final_mvp.csv";
const DEFAULT_OUTPUT_DIR = "outputs/design-tool-layout-validation-20260523";
const TARGET_PASS_RATE = 99;

const manifestPath = process.argv[2] || DEFAULT_MANIFEST;
const productCsvPath = process.argv[3] || (fs.existsSync(DEFAULT_PRODUCT_CSV) ? DEFAULT_PRODUCT_CSV : "");
const outputDir = process.argv[4] || DEFAULT_OUTPUT_DIR;
const renderSamplePath = process.argv[5] || path.join(outputDir, "browser-render-sample-results.json");

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

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function cleanQaTags(tags) {
  return tagList(tags).filter((tag) => !/^tbd:qa-/i.test(tag));
}

function setProductQaTags(existing, qaTags) {
  const seen = new Set();
  return [...cleanQaTags(existing), ...qaTags]
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ");
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

function num(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

function expectedLayers(config) {
  return num(config.backgroundCount)
    + num(config.teamLogoCount)
    + num(config.clipartCount)
    + num(config.playerIconCount)
    + num(config.playerTextCount)
    + num(config.headerTextCount)
    + num(config.yearTextCount);
}

function expectedTextLayers(config) {
  return num(config.playerTextCount) + num(config.headerTextCount) + num(config.yearTextCount);
}

function designUrl(product) {
  const url = new URL("https://files-mentioned-by-the-user-shopify.vercel.app/");
  const params = {
    productHandle: product.handle,
    productTitle: product.title,
    productImage: product.image,
    productId: product.id || "",
    variantId: product.variantId || "",
    price: product.price || "",
    image: product.image,
    product_title: product.title,
    product_id: product.id || "",
    variant_id: product.variantId || "",
    autoLoadProduct: "1",
    autoLayer: "png"
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value || ""));
  return url.toString();
}

function supportedShape(product) {
  const shape = String(product.shape || "").toLowerCase();
  if (["rectangle", "banner", "polepocket", "triangle", "homeplate", "homeplatepennant"].includes(shape)) return true;
  return false;
}

function roleAssetChecks(product) {
  const config = product.layerConfig || {};
  return [
    {
      role: "background",
      required: num(config.backgroundCount) > 0,
      ok: Boolean(config.backgroundAssetId && hasHttpUrl(config.backgroundUrl)),
      assetId: config.backgroundAssetId || "",
      url: config.backgroundUrl || ""
    },
    {
      role: "team-logo",
      required: num(config.teamLogoCount) > 0,
      ok: Boolean(config.logoAssetId && hasHttpUrl(config.logoUrl)),
      assetId: config.logoAssetId || "",
      url: config.logoUrl || ""
    },
    {
      role: "clipart",
      required: num(config.clipartCount) > 0,
      ok: Boolean(config.clipartAssetId && hasHttpUrl(config.clipartUrl)),
      assetId: config.clipartAssetId || "",
      url: config.clipartUrl || ""
    },
    {
      role: "accessory-player-icon",
      required: num(config.playerIconCount) > 0,
      ok: Boolean(config.accessoryAssetId && hasHttpUrl(config.accessoryUrl)),
      assetId: config.accessoryAssetId || "",
      url: config.accessoryUrl || ""
    }
  ];
}

function validateProduct(product, renderSample = null) {
  const config = product.layerConfig || {};
  const issues = [];
  const warnings = [];
  const roleChecks = roleAssetChecks(product);
  const missingRoles = roleChecks.filter((check) => check.required && !check.ok).map((check) => check.role);
  const configuredLayers = num(config.layerCount);
  const computedLayers = expectedLayers(config);
  const configuredTextLayers = num(config.textLayerCount);
  const computedTextLayers = expectedTextLayers(config);
  const isActiveDesignProduct = product.status === "active" && product.type !== "easify_addon_product";

  if (!isActiveDesignProduct) warnings.push("not-active-design-product");
  if (!product.handle) issues.push("missing-handle");
  if (!product.title) issues.push("missing-title");
  if (!hasHttpUrl(product.image)) issues.push("missing-product-image");
  if (!supportedShape(product)) issues.push(`unsupported-shape:${product.shape || "blank"}`);
  if (!configuredLayers) issues.push("missing-layer-count");
  if (configuredLayers && computedLayers && configuredLayers !== computedLayers) {
    issues.push(`layer-count-mismatch:${configuredLayers}-vs-${computedLayers}`);
  }
  if (configuredTextLayers && computedTextLayers && configuredTextLayers !== computedTextLayers) {
    issues.push(`text-layer-mismatch:${configuredTextLayers}-vs-${computedTextLayers}`);
  }
  if (num(config.playerCount) !== Math.max(num(config.playerIconCount), num(config.playerTextCount))) {
    warnings.push(`player-count-not-max:${num(config.playerCount)}-vs-${Math.max(num(config.playerIconCount), num(config.playerTextCount))}`);
  }
  missingRoles.forEach((role) => issues.push(`missing-object-asset:${role}`));

  const hasLayout = Boolean(config.layoutSvgUrl || config.layoutSvg || config.layoutSource === "design-tool-assets" || config.layoutSource === "svg-template");
  if (!hasLayout) issues.push("missing-layout-source");
  if (renderSample) {
    const actualLayerCount = num(renderSample.actualLayerCount);
    if (actualLayerCount && configuredLayers && actualLayerCount !== configuredLayers) {
      issues.push(`render-layer-mismatch:${configuredLayers}-vs-${actualLayerCount}`);
    }
    if (renderSample.errorsVisible) {
      issues.push("render-error-overlay");
    }
    if (Array.isArray(renderSample.consoleIssues) && renderSample.consoleIssues.length) {
      warnings.push(`render-console-issues:${renderSample.consoleIssues.length}`);
    }
  }

  const structuralChecks = [
    Boolean(product.handle),
    Boolean(product.title),
    hasHttpUrl(product.image),
    supportedShape(product),
    configuredLayers > 0,
    !issues.some((issue) => issue.startsWith("layer-count-mismatch")),
    !issues.some((issue) => issue.startsWith("text-layer-mismatch")),
    !issues.some((issue) => issue.startsWith("render-layer-mismatch")),
    hasLayout
  ];
  const structuralScore = structuralChecks.filter(Boolean).length / structuralChecks.length;
  const requiredRoleChecks = roleChecks.filter((check) => check.required);
  const assetScore = requiredRoleChecks.length
    ? requiredRoleChecks.filter((check) => check.ok).length / requiredRoleChecks.length
    : 1;
  const sourceScore = config.assetMatchStatus === "complete"
    ? 1
    : config.assetMatchStatus === "partial-no-clipart"
      ? 0.82
      : config.assetMatchStatus === "partial"
        ? 0.64
        : 0.5;
  const score = Math.round((structuralScore * 40 + assetScore * 45 + sourceScore * 15) * 10) / 10;
  const status = isActiveDesignProduct && issues.length === 0 && score >= 99 ? "pass" : "fail";

  return {
    status,
    score,
    issues,
    warnings,
    missingRoles,
    computedLayers,
    computedTextLayers,
    roleChecks
  };
}

function productTags(product, validation) {
  return [
    `tbd:qa-layout-status:${validation.status}`,
    `tbd:qa-layout-score:${String(Math.round(validation.score)).padStart(3, "0")}`,
    `tbd:qa-ready:${validation.status === "pass" ? "1" : "0"}`,
    validation.missingRoles.length ? `tbd:qa-missing-assets:${validation.missingRoles.join("+")}` : "",
    validation.issues.length ? "tbd:qa-needs-review" : "tbd:qa-layout-match",
    `tbd:qa-generated:20260523`
  ].filter(Boolean);
}

function readProductCsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const rows = parseCsv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const headers = rows.shift();
  const objects = rows.map((row) => rowObject(headers, row));
  return { headers, objects };
}

fs.mkdirSync(outputDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const products = manifest.products || [];
const renderSamples = (() => {
  if (!renderSamplePath || !fs.existsSync(renderSamplePath)) return new Map();
  try {
    const data = JSON.parse(fs.readFileSync(renderSamplePath, "utf8"));
    return new Map((data.results || [])
      .filter((item) => item && item.handle)
      .map((item) => [item.handle, item]));
  } catch {
    return new Map();
  }
})();
const activeProducts = products.filter((product) => product.status === "active" && product.type !== "easify_addon_product");
const validations = products.map((product) => {
  const validation = validateProduct(product, renderSamples.get(product.handle));
  const config = product.layerConfig || {};
  return {
    Handle: product.handle || "",
    Title: product.title || "",
    Status: product.status || "",
    Type: product.type || "",
    Shape: product.shape || "",
    "QA Status": validation.status,
    "QA Score": validation.score,
    "Asset Match": config.assetMatchStatus || "",
    "Layer Count": config.layerCount || "",
    "Expected Layers": validation.computedLayers,
    "Player Count": config.playerCount || "",
    "Player Icons": config.playerIconCount || "",
    "Player Texts": config.playerTextCount || "",
    "Header Texts": config.headerTextCount || "",
    "Year Texts": config.yearTextCount || "",
    "Missing Roles": validation.missingRoles.join("+"),
    Issues: validation.issues.join("; "),
    Warnings: validation.warnings.join("; "),
    "Background Asset": config.backgroundAssetId || "",
    "Team Logo Asset": config.logoAssetId || "",
    "Clipart Asset": config.clipartAssetId || "",
    "Accessory Asset": config.accessoryAssetId || "",
    "Design URL": designUrl(product)
  };
});

const activeValidation = validations.filter((row) => row.Status === "active" && row.Type !== "easify_addon_product");
const passRows = activeValidation.filter((row) => row["QA Status"] === "pass");
const failRows = activeValidation.filter((row) => row["QA Status"] !== "pass");
const passRate = activeValidation.length ? passRows.length / activeValidation.length * 100 : 0;
const byMissingRole = {};
const byShape = {};
const byAssetMatch = {};
for (const row of activeValidation) {
  byShape[row.Shape || "(blank)"] = (byShape[row.Shape || "(blank)"] || 0) + 1;
  byAssetMatch[row["Asset Match"] || "(blank)"] = (byAssetMatch[row["Asset Match"] || "(blank)"] || 0) + 1;
  const missing = row["Missing Roles"] || "none";
  byMissingRole[missing] = (byMissingRole[missing] || 0) + 1;
}

const headers = Object.keys(validations[0] || {});
fs.writeFileSync(path.join(outputDir, "layout-validation.csv"), stringifyCsv(headers, validations));
fs.writeFileSync(path.join(outputDir, "layout-validation-failures.csv"), stringifyCsv(headers, failRows));

const tagsRows = products.map((product) => {
  const validation = validateProduct(product, renderSamples.get(product.handle));
  return {
    Handle: product.handle || "",
    Title: product.title || "",
    Tags: setProductQaTags(product.tags || "", productTags(product, validation)),
    "QA Status": validation.status,
    "QA Score": validation.score,
    "Missing Roles": validation.missingRoles.join("+"),
    Issues: validation.issues.join("; ")
  };
});
fs.writeFileSync(path.join(outputDir, "product-layout-qa-tags.csv"), stringifyCsv(Object.keys(tagsRows[0] || {}), tagsRows));

const productCsv = readProductCsv(productCsvPath);
let taggedProductCsvPath = "";
if (productCsv) {
  const validationByHandle = new Map(products.map((product) => [product.handle, validateProduct(product, renderSamples.get(product.handle))]));
  const manifestByHandle = new Map(products.map((product) => [product.handle, product]));
  for (const row of productCsv.objects) {
    const handle = row.Handle || "";
    const product = manifestByHandle.get(handle);
    const validation = validationByHandle.get(handle);
    if (!product || !validation) continue;
    row.Tags = setProductQaTags(row.Tags || product.tags || "", productTags(product, validation));
  }
  taggedProductCsvPath = path.join(outputDir, "products_export_tbd_layout_qa_tags.csv");
  fs.writeFileSync(taggedProductCsvPath, stringifyCsv(productCsv.headers, productCsv.objects));
}

const summary = {
  generatedAt: new Date().toISOString(),
  manifestPath,
  productCsvPath: productCsv ? productCsvPath : "",
  renderSamplePath: renderSamples.size ? renderSamplePath : "",
  renderSampleCount: renderSamples.size,
  targetPassRate: TARGET_PASS_RATE,
  totalProducts: products.length,
  activeDesignProducts: activeProducts.length,
  passed: passRows.length,
  failed: failRows.length,
  passRate: Math.round(passRate * 100) / 100,
  meetsTarget: passRate >= TARGET_PASS_RATE,
  byShape,
  byAssetMatch,
  byMissingRole,
  outputFiles: {
    summary: path.join(outputDir, "layout-validation-summary.json"),
    validationCsv: path.join(outputDir, "layout-validation.csv"),
    failureCsv: path.join(outputDir, "layout-validation-failures.csv"),
    qaTagsCsv: path.join(outputDir, "product-layout-qa-tags.csv"),
    taggedProductCsv: taggedProductCsvPath
  },
  topFailures: failRows.slice(0, 80).map((row) => ({
    handle: row.Handle,
    title: row.Title,
    shape: row.Shape,
    score: row["QA Score"],
    assetMatch: row["Asset Match"],
    missingRoles: row["Missing Roles"],
    issues: row.Issues
  }))
};

fs.writeFileSync(path.join(outputDir, "layout-validation-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

if (!summary.meetsTarget) {
  process.exitCode = 2;
}
