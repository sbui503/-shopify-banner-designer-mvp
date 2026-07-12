import fs from "node:fs";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP = "public/team-banner-source-svg-map.json";
const REGRESSION_HANDLES = [
  "aquasox-softball-banner",
  "assault-softball-banner",
  "avengers-softball-banner"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function cleanText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleSlug(value) {
  return cleanText(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function imageFileKey(value) {
  return String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
}

function normalizeShape(product = {}) {
  const text = cleanText([product.shape, product.productShape, product.type, product.tags, product.title, product.handle].filter(Boolean).join(" "));
  if (/pole\s*pocket|polepocket|sleeve/.test(text)) return "polepocket";
  if (/home\s*plate|homeplate/.test(text)) return "homeplatepennant";
  if (/triangle|pennant/.test(text)) return "triangle";
  return "rectangle";
}

function tagList(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagNumber(tagsValue, names, fallback = 0) {
  const tags = tagList(tagsValue);
  for (const name of names) {
    const prefix = `${name}:`;
    const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix));
    if (!match) continue;
    const value = Number(match.slice(prefix.length));
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function requiredConfig(product = {}) {
  const shape = normalizeShape(product);
  const rectangular = shape === "rectangle" || shape === "polepocket";
  return {
    backgroundCount: tagNumber(product.tags, ["tbd:background"], 1),
    teamLogoCount: tagNumber(product.tags, ["tbd:team-logo", "tbd:logo"], 1),
    playerIconCount: rectangular ? tagNumber(product.tags, ["tbd:player-icons", "tbd:accessories"], 0) : 0
  };
}

function roleCounts(config = {}) {
  const counts = {};
  if (!Array.isArray(config.sourceRoleSummary)) return counts;
  config.sourceRoleSummary.forEach((entry) => {
    const role = String(entry?.role || "").toLowerCase();
    if (!role) return;
    counts[role] = (counts[role] || 0) + 1;
  });
  return counts;
}

function roleCount(counts, roles) {
  return roles.reduce((total, role) => total + (counts[role] || 0), 0);
}

function countValue(config = {}, key) {
  const value = Number(config[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function sourceCoverageIssues(product = {}, map = {}) {
  const shape = normalizeShape(product);
  const required = requiredConfig(product);
  const config = map.layerConfig || {};
  const counts = roleCounts(config);
  const hasRoleSummary = Array.isArray(config.sourceRoleSummary);
  const issues = [];
  const checks = [
    ["backgroundCount", ["background"], 1],
    ["teamLogoCount", ["teamlogo", "team-name", "team_name"], 1]
  ];
  if (shape === "rectangle" || shape === "polepocket") {
    checks.push(["playerIconCount", ["playericon", "player-icon", "accessory"], Infinity]);
  }

  checks.forEach(([key, roles, cap]) => {
    const needed = required[key] || 0;
    if (!needed) return;
    const expected = cap === Infinity ? needed : Math.min(needed, cap);
    const available = hasRoleSummary ? roleCount(counts, roles) : countValue(config, key);
    if (available < expected) issues.push(`${key}:${available}/${expected}`);
  });

  return issues;
}

const productData = readJson(PRODUCT_MANIFEST);
const sourceData = readJson(SOURCE_MAP);
const products = Array.isArray(productData.products) ? productData.products : [];
const maps = Array.isArray(sourceData.maps) ? sourceData.maps : [];
const sourceByHandle = new Map();
const sourceByImage = new Map();

maps.forEach((entry) => {
  [entry.handle, entry.productHandle, titleSlug(entry.title)].filter(Boolean).forEach((key) => {
    if (!sourceByHandle.has(String(key))) sourceByHandle.set(String(key), entry);
  });
  const imageKey = imageFileKey(entry.productImage);
  if (imageKey && !sourceByImage.has(imageKey)) sourceByImage.set(imageKey, entry);
});

const failures = [];
const exactImageFallbacks = [];
let trustedSourceCount = 0;

products
  .filter((product) => !product.status || String(product.status).toLowerCase() === "active")
  .forEach((product) => {
    const sourceMap = sourceByImage.get(imageFileKey(product.image))
      || sourceByHandle.get(product.handle)
      || sourceByHandle.get(titleSlug(product.title));
    const issues = sourceMap ? sourceCoverageIssues(product, sourceMap) : ["missing-source-map"];
    if (!issues.length) {
      trustedSourceCount += 1;
      return;
    }
    if (product.image) {
      exactImageFallbacks.push({
        handle: product.handle,
        title: product.title,
        issues
      });
      return;
    }
    failures.push({
      handle: product.handle,
      title: product.title,
      issues
    });
  });

REGRESSION_HANDLES.forEach((handle) => {
  const product = products.find((item) => item.handle === handle);
  const sourceMap = product && (sourceByImage.get(imageFileKey(product.image)) || sourceByHandle.get(handle));
  const issues = product && sourceMap ? sourceCoverageIssues(product, sourceMap) : ["missing-regression-product-or-source"];
  if (issues.length) failures.push({ handle, title: product?.title || "", issues, regression: true });
});

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    productCount: products.length,
    trustedSourceCount,
    exactImageFallbackCount: exactImageFallbacks.length,
    failures: failures.slice(0, 50)
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  productCount: products.length,
  trustedSourceCount,
  exactImageFallbackCount: exactImageFallbacks.length,
  regressionHandles: REGRESSION_HANDLES,
  fallbackExamples: exactImageFallbacks.slice(0, 12)
}, null, 2));
