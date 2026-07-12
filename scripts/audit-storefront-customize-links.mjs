import fs from "node:fs";

const SOURCE_MAP = "public/team-banner-source-svg-map.json";
const STORE_PRODUCTS_URL = "https://teamsportbanners.com/products.json";
const STORE_PRODUCT_URL = "https://teamsportbanners.com/products";
const DESIGN_TOOL_HOST = "teamsportbanners.vercel.app";

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

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
  return response.text();
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

function extractCustomizeLinks(html) {
  const matches = html.match(new RegExp(`https://${DESIGN_TOOL_HOST}[^"'<>\\s]+`, "g")) || [];
  return [...new Set(matches.filter((href) => href.includes("autoLoadProduct=1")))];
}

const sourceData = readJson(SOURCE_MAP);
const sourceRows = Array.isArray(sourceData.maps) ? sourceData.maps : [];
const sourceByHandle = new Map(sourceRows.map((entry) => [entry.handle, entry]));
const sourceByImage = new Map(
  sourceRows
    .map((entry) => [imageFileKey(entry.productImage), entry])
    .filter(([key]) => key)
);

const products = await fetchStorefrontProducts();
const unsafeProducts = products
  .map((product) => {
    const image = product.images?.[0]?.src || product.image?.src || "";
    const sourceMap = sourceByImage.get(imageFileKey(image)) || sourceByHandle.get(product.handle);
    const helperOrNoImage = String(product.product_type || "").toLowerCase() === "easify_addon_product" || !image;
    const verified = isTrueSourceNoFallback(sourceMap);
    return {
      handle: product.handle,
      title: product.title,
      type: product.product_type || "",
      image: Boolean(image),
      verified,
      reason: verified
        ? ""
        : helperOrNoImage
          ? "helper-or-no-image"
          : sourceMap
            ? "untrusted-source-row"
            : "missing-source-map"
    };
  })
  .filter((product) => !product.verified);

const unsafeCustomizeLinks = [];
for (const product of unsafeProducts) {
  const html = await fetchText(`${STORE_PRODUCT_URL}/${product.handle}`);
  const links = extractCustomizeLinks(html);
  if (links.length) unsafeCustomizeLinks.push({ ...product, customizeLinks: links });
}

const result = {
  ok: unsafeCustomizeLinks.length === 0,
  storefrontProductCount: products.length,
  unsafeProductCount: unsafeProducts.length,
  unsafeCustomizeLinkCount: unsafeCustomizeLinks.length,
  unsafeCustomizeLinks
};

const output = JSON.stringify(result, null, 2);
if (!result.ok) {
  console.error(output);
  process.exit(1);
}

console.log(output);
