import fs from "node:fs";

const SOURCE_MAP = "public/team-banner-source-svg-map.json";
const STORE_PRODUCTS_URL = "https://teamsportbanners.com/products.json";
const TARGET_PASS_RATE = 0.999;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function imageFileKey(value) {
  return String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
}

function hasFallbackSignal(map = {}) {
  const config = map.layerConfig || {};
  return [
    map.matchConfidence,
    map.sourceType,
    map.editableLayerMode,
    config.layoutSource,
    config.assetMatchStatus,
    config.objectLayerMode
  ].some((value) => /fallback|product-image|candidate|needs-source-svg/i.test(String(value || "")));
}

function isTrueSourceNoFallback(map = {}) {
  return Boolean(
    map
    && map.matchStatus === "matched"
    && map.sourceType === "source-svg"
    && map.editableLayerMode === "source-svg"
    && map.needsSourceSvg !== true
    && map.sourceEditable === true
    && map.fullyEditable === true
    && !hasFallbackSignal(map)
  );
}

function isCustomerDesignProduct(product = {}) {
  if (String(product.product_type || "").toLowerCase() === "easify_addon_product") return false;
  const image = product.images?.[0]?.src || product.image?.src || "";
  return Boolean(image);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
  return response.json();
}

async function fetchStorefrontProducts() {
  const products = [];
  for (let page = 1; page <= 100; page += 1) {
    const data = await fetchJson(`${STORE_PRODUCTS_URL}?limit=250&page=${page}`);
    const batch = Array.isArray(data.products) ? data.products : [];
    if (!batch.length) break;
    products.push(...batch);
  }
  return products;
}

const sourceData = readJson(SOURCE_MAP);
const sourceRows = Array.isArray(sourceData.maps) ? sourceData.maps : [];
const sourceByHandle = new Map(sourceRows.map((entry) => [entry.handle, entry]));
const sourceByImage = new Map(
  sourceRows
    .map((entry) => [imageFileKey(entry.productImage), entry])
    .filter(([key]) => key)
);

const storefrontProducts = await fetchStorefrontProducts();
const customerProducts = storefrontProducts.filter(isCustomerDesignProduct);
const failures = [];

customerProducts.forEach((product) => {
  const image = product.images?.[0]?.src || product.image?.src || "";
  const sourceMap = sourceByImage.get(imageFileKey(image)) || sourceByHandle.get(product.handle);
  if (isTrueSourceNoFallback(sourceMap)) return;
  failures.push({
    handle: product.handle,
    title: product.title,
    type: product.product_type || "",
    reason: sourceMap
      ? `${sourceMap.matchStatus || "missing"}/${sourceMap.matchConfidence || ""}/${sourceMap.sourceType || ""}/${sourceMap.editableLayerMode || ""}`
      : "missing-source-map"
  });
});

const pass = customerProducts.length - failures.length;
const passRate = customerProducts.length ? pass / customerProducts.length : 0;
const result = {
  ok: passRate >= TARGET_PASS_RATE,
  targetPassRate: TARGET_PASS_RATE,
  storefrontProductCount: storefrontProducts.length,
  customerDesignProductCount: customerProducts.length,
  excludedHelperOrNoImageCount: storefrontProducts.length - customerProducts.length,
  pass,
  fail: failures.length,
  passRate,
  failureExamples: failures.slice(0, 25)
};

const output = JSON.stringify(result, null, 2);
if (!result.ok) {
  console.error(output);
  process.exit(1);
}

console.log(output);
