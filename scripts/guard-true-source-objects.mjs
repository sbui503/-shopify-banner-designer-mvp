import fs from "node:fs";
import path from "node:path";

const VECTOR_BACKGROUND_HREF = "__source_svg_vector_background__";
const GENERATED_PRODUCT_SVG_DIR = "public/generated-product-svgs";

const DATA_FILES = [
  "public/team-banner-products.json",
  "public/team-banner-source-svg-map.json",
  "public/team-banner-source-svg-candidates.json",
  "public/svg-layer-templates.json"
];

const TEXT_FILES = [
  "public/team-banner-designer.js",
  "scripts/promote-visual-exact-svg-matches.py"
];

const FORBIDDEN_VALUE_PATTERNS = [
  /product-image-(?:object-)?fallback/i,
  /generated-native-object-svg/i,
  /generated-product-svgs/i,
  /generated-placeholder/i,
  /placeholder-(?:team|art|player)/i,
  /^data:image\/svg\+xml/i
];

const FORBIDDEN_TEXT_PATTERNS = [
  /generated-product-svgs/i
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

function isForbiddenValue(value) {
  const text = String(value || "").trim();
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

function scanValue(value, pointer, findings) {
  if (typeof value === "string") {
    if (isForbiddenValue(value)) findings.push({ pointer, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, `${pointer}/${index}`, findings));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => scanValue(item, `${pointer}/${key}`, findings));
  }
}

function scanTextFile(file, findings) {
  const text = fs.readFileSync(file, "utf8");
  if (FORBIDDEN_TEXT_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push({
      pointer: file,
      value: "text file references generated product preview SVG assets"
    });
  }
}

function sourceRows(data) {
  return Array.isArray(data?.maps) ? data.maps : [];
}

function productRows(data) {
  return Array.isArray(data?.products) ? data.products : [];
}

function isSourceEditable(row = {}) {
  return row.sourceEditable === true || row.layerConfig?.sourceEditable === true;
}

function isActiveDesignProduct(product = {}) {
  return product.status === "active" && product.type !== "easify_addon_product";
}

function hasConfirmedSourceProduct(product = {}, source = {}) {
  const config = product.layerConfig || {};
  return Boolean(product.templateSvg)
    && source?.matchStatus === "matched"
    && config.sourceEditable === true
    && config.needsSourceSvg !== true
    && config.objectLayerMode !== "needs-source-svg";
}

function assertSourceRow(row, pointer, findings) {
  if (row.matchStatus !== "matched" && isSourceEditable(row)) {
    findings.push({
      pointer,
      value: `non-matched source row promoted as editable: ${row.matchStatus || "blank"}`
    });
  }

  if (isSourceEditable(row)) {
    const sourceType = row.sourceType || row.editableLayerMode || row.layerConfig?.objectLayerMode || "";
    if (sourceType !== "source-svg" && row.editableLayerMode !== "source-svg") {
      findings.push({ pointer, value: `editable row is not source-svg: ${sourceType || "blank"}` });
    }
    if (row.needsSourceSvg === true || row.layerConfig?.needsSourceSvg === true) {
      findings.push({ pointer, value: "editable row still needs source SVG" });
    }
  }

  const config = row.layerConfig || {};
  if (config.backgroundSource === "source-svg-vector-background" || config.backgroundUrl === VECTOR_BACKGROUND_HREF) {
    const role = Array.isArray(config.sourceRoleSummary)
      ? config.sourceRoleSummary.find((entry) => entry?.href === VECTOR_BACKGROUND_HREF && String(entry?.role || "").toLowerCase() === "background")
      : null;
    if (!role) {
      findings.push({ pointer, value: "vector source background missing sourceRoleSummary background object" });
    }
  }
}

function main() {
  const findings = [];
  const sourceByHandle = new Map();

  for (const file of walkFiles(GENERATED_PRODUCT_SVG_DIR)) {
    findings.push({
      pointer: file,
      value: "generated product preview SVGs are disabled; use matched /svg-layer-templates source SVGs"
    });
  }

  for (const file of DATA_FILES) {
    const data = readJson(file);
    scanValue(data, file, findings);
    sourceRows(data).forEach((row, index) => {
      if (row.handle) sourceByHandle.set(row.handle, row);
      assertSourceRow(row, `${file}/maps/${index}`, findings);
    });
  }

  const products = productRows(readJson("public/team-banner-products.json"));
  products.forEach((product, index) => {
    const source = sourceByHandle.get(product.handle);
    if (product.layerConfig?.sourceEditable === true && source?.matchStatus !== "matched") {
      findings.push({
        pointer: `public/team-banner-products.json/products/${index}`,
        value: `product promoted without matched source row: ${source?.matchStatus || "missing"}`
      });
    }
    if (isActiveDesignProduct(product) && !hasConfirmedSourceProduct(product, source)) {
      findings.push({
        pointer: `public/team-banner-products.json/products/${index}`,
        value: `active design product is not backed by a matched source SVG: ${product.handle || "missing-handle"}`
      });
    }
  });

  for (const file of TEXT_FILES) {
    if (fs.existsSync(file)) scanTextFile(file, findings);
  }

  const summary = {
    checkedFiles: DATA_FILES,
    checkedTextFiles: TEXT_FILES.filter((file) => fs.existsSync(file)),
    blockedArtifactDir: GENERATED_PRODUCT_SVG_DIR,
    findings: findings.slice(0, 50),
    findingCount: findings.length
  };
  console.log(JSON.stringify(summary, null, 2));
  if (findings.length) process.exitCode = 1;
}

main();
