import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const CANDIDATE_MAP_PATH = "public/team-banner-source-svg-candidates.json";
const OUTPUT_DIR = `outputs/strict-native-source-policy-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function filenameBase(value) {
  const raw = String(value || "").split("?", 1)[0].split("#", 1)[0].replace(/\/+$/g, "");
  const base = decodeURIComponent(raw.split("/").pop() || "");
  return base.replace(/\.[a-z0-9]+$/i, "");
}

function isPlaceholderAsset(value) {
  const text = String(value || "").trim().toLowerCase();
  return text.startsWith("data:image/svg+xml") || /generated-placeholder|placeholder-(team|art|player)/.test(text);
}

function isGeneratedNativeValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "generated-native-object-svg" || /(^|\/)generated-native-/.test(text);
}

function isRejectedValue(value) {
  return isPlaceholderAsset(value) || isGeneratedNativeValue(value);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    const next = value.filter((item) => item && !isRejectedValue(item));
    return next.length ? next : undefined;
  }
  if (isRejectedValue(value)) return undefined;
  return value;
}

function sanitizeConfig(config = {}) {
  const next = {};
  const removed = [];
  for (const [key, value] of Object.entries(config || {})) {
    const clean = sanitizeValue(value);
    if (clean === undefined) {
      removed.push(key);
    } else {
      next[key] = clean;
    }
  }
  if (isGeneratedNativeValue(next.layoutSvg) || isGeneratedNativeValue(next.layoutSvgUrl)) {
    delete next.layoutSvg;
    delete next.layoutSvgUrl;
    removed.push("layoutSvg", "layoutSvgUrl");
  }
  if (Array.isArray(next.sourceRoleSummary)) {
    const roleSummary = next.sourceRoleSummary.filter((entry) => !isRejectedValue(entry?.href));
    if (roleSummary.length) next.sourceRoleSummary = roleSummary;
    else delete next.sourceRoleSummary;
  }
  return { config: next, removed };
}

function isMatchedSourceRow(row = {}) {
  return row.matchStatus === "matched"
    && !isGeneratedNativeValue(row.templateSvg)
    && !isGeneratedNativeValue(row.sourceTemplateSvg);
}

function normalizeSourceRow(row = {}) {
  const { config, removed } = sanitizeConfig(row.layerConfig || {});
  if (!isMatchedSourceRow(row)) {
    return {
      row: {
        ...row,
        fullyEditable: true,
        sourceEditable: false,
        needsSourceSvg: true,
        sourceType: "needs-source-svg",
        editableLayerMode: "needs-source-svg",
        layerConfig: {
          ...config,
          sourceEditable: false,
          needsSourceSvg: true,
          objectLayerMode: "needs-source-svg"
        }
      },
      removed
    };
  }

  const layoutSvg = filenameBase(row.templateSvg || config.layoutSvgUrl || config.layoutSvg);
  return {
    row: {
      ...row,
      sourceType: "source-svg",
      editableLayerMode: "source-svg",
      fullyEditable: true,
      sourceEditable: true,
      needsSourceSvg: false,
      layerConfig: {
        ...config,
        layoutSource: "svg-template",
        layoutSvg: layoutSvg || config.layoutSvg,
        layoutSvgUrl: row.templateSvg || config.layoutSvgUrl,
        assetMatchStatus: config.assetMatchStatus || row.matchConfidence || "source-svg",
        objectLayerMode: "source-svg",
        sourceEditable: true,
        needsSourceSvg: false
      }
    },
    removed
  };
}

function normalizeMap(file) {
  const data = readJson(file);
  const rows = data.maps || [];
  let sourceEditableCount = 0;
  let needsSourceSvgCount = 0;
  let removedFieldCount = 0;
  const maps = rows.map((row) => {
    const normalized = normalizeSourceRow(row);
    removedFieldCount += normalized.removed.length;
    if (normalized.row.sourceEditable) sourceEditableCount += 1;
    if (normalized.row.needsSourceSvg) needsSourceSvgCount += 1;
    return normalized.row;
  });
  return {
    data: {
      ...data,
      strictNativeSourcePolicy: "Only matched real source SVG rows are sourceEditable. Generated-native templates, placeholder data URIs, and review/candidate rows are blocked from native-source use.",
      sourceEditableCount,
      needsSourceSvgCount,
      maps
    },
    summary: {
      file,
      rows: rows.length,
      sourceEditableCount,
      needsSourceSvgCount,
      removedFieldCount
    }
  };
}

function normalizeProducts(productsData, sourceRows) {
  const sourceByHandle = new Map(sourceRows.map((row) => [row.handle, row]));
  let removedFieldCount = 0;
  let matchedSourceProducts = 0;
  let needsSourceSvgProducts = 0;

  const products = (productsData.products || []).map((product) => {
    const source = sourceByHandle.get(product.handle);
    const normalized = sanitizeConfig(product.layerConfig || {});
    removedFieldCount += normalized.removed.length;

    if (source?.matchStatus === "matched" && source.sourceEditable !== false) {
      matchedSourceProducts += 1;
      return {
        ...product,
        templateSvg: source.templateSvg || product.templateSvg,
        layerConfig: {
          ...normalized.config,
          ...(source.layerConfig || {}),
          sourceEditable: true,
          needsSourceSvg: false,
          objectLayerMode: "source-svg"
        }
      };
    }

    needsSourceSvgProducts += 1;
    const config = {
      ...normalized.config,
      sourceEditable: false,
      needsSourceSvg: true,
      objectLayerMode: "needs-source-svg"
    };
    delete config.layoutSvg;
    delete config.layoutSvgUrl;
    delete config.assetMatchStatus;
    return {
      ...product,
      templateSvg: undefined,
      layerConfig: config
    };
  });

  return {
    data: {
      ...productsData,
      strictNativeSourcePolicyAppliedAt: new Date().toISOString(),
      products
    },
    summary: {
      file: PRODUCT_MANIFEST,
      products: products.length,
      matchedSourceProducts,
      needsSourceSvgProducts,
      removedFieldCount
    }
  };
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const sourceResult = normalizeMap(SOURCE_MAP_PATH);
const candidateResult = normalizeMap(CANDIDATE_MAP_PATH);
const productResult = normalizeProducts(readJson(PRODUCT_MANIFEST), sourceResult.data.maps);

const summary = {
  generatedAt: new Date().toISOString(),
  apply: shouldApply,
  sourceMap: sourceResult.summary,
  candidateMap: candidateResult.summary,
  products: productResult.summary,
  outputDir: OUTPUT_DIR
};

writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
writeJson(path.join(OUTPUT_DIR, "team-banner-source-svg-map.strict-preview.json"), sourceResult.data);
writeJson(path.join(OUTPUT_DIR, "team-banner-source-svg-candidates.strict-preview.json"), candidateResult.data);
writeJson(path.join(OUTPUT_DIR, "team-banner-products.strict-preview.json"), productResult.data);

if (shouldApply) {
  writeJson(SOURCE_MAP_PATH, sourceResult.data);
  writeJson(CANDIDATE_MAP_PATH, candidateResult.data);
  writeJson(PRODUCT_MANIFEST, productResult.data);
}

console.log(JSON.stringify(summary, null, 2));
