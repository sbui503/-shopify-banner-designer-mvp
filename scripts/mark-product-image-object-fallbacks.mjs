import fs from "node:fs";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const CANDIDATE_MAP_PATH = "public/team-banner-source-svg-candidates.json";

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function filenameBase(value) {
  const raw = String(value || "").split("?", 1)[0].split("#", 1)[0].replace(/\/+$/g, "");
  const base = decodeURIComponent(raw.split("/").pop() || "");
  return base.replace(/\.[a-z0-9]+$/i, "");
}

function isProductImageFallback(row) {
  const config = row?.layerConfig || {};
  const values = [
    row?.matchConfidence,
    row?.sourceType,
    row?.editableLayerMode,
    config.layoutSource,
    config.assetMatchStatus,
    config.objectLayerMode
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => (
    value === "product-image-svg-exact-fallback"
    || value === "product-image-svg-fallback"
    || value === "product-image-object-fallback"
  ));
}

function withObjectFallbackLayerConfig(product, row) {
  const productConfig = product?.layerConfig || {};
  const rowConfig = row?.layerConfig || {};
  const svgUrl = row?.templateSvg || rowConfig.layoutSvgUrl || "";
  const config = {
    ...rowConfig,
    ...productConfig,
    backgroundUrl: productConfig.backgroundUrl || rowConfig.backgroundUrl || product?.image || row?.productImage || "",
    backgroundSource: productConfig.backgroundSource || rowConfig.backgroundSource || "product-image",
    logoUrl: productConfig.logoUrl || rowConfig.logoUrl || "",
    logoSource: productConfig.logoSource || rowConfig.logoSource || "",
    clipartUrl: productConfig.clipartUrl || rowConfig.clipartUrl || "",
    clipartSource: productConfig.clipartSource || rowConfig.clipartSource || "",
    accessoryUrl: productConfig.accessoryUrl || rowConfig.accessoryUrl || "",
    accessorySource: productConfig.accessorySource || rowConfig.accessorySource || "",
    layoutSource: "product-image-object-fallback",
    layoutSvg: filenameBase(svgUrl),
    layoutSvgUrl: svgUrl,
    assetMatchStatus: "product-image-object-fallback",
    objectLayerMode: "product-image-object-fallback",
    fullyEditable: true,
    sourceEditable: false,
    visualExact: true,
    needsSourceSvg: true
  };
  return config;
}

function normalizeRow(row, product) {
  if (!row || !product) return row;
  if (!isProductImageFallback(row)) {
    return {
      ...row,
      fullyEditable: true,
      sourceEditable: true,
      needsSourceSvg: false,
      editableLayerMode: row.editableLayerMode || "source-svg",
      sourceType: row.sourceType || "source-svg",
      layerConfig: {
        ...(row.layerConfig || {}),
        fullyEditable: true,
        sourceEditable: true,
        needsSourceSvg: false,
        objectLayerMode: row.layerConfig?.objectLayerMode || "source-svg"
      }
    };
  }

  const reasons = new Set([
    ...(Array.isArray(row.matchReasons) ? row.matchReasons : []),
    "generated-editable-object-fallback",
    "exact-product-image-retained-as-visual-reference",
    "source-svg-still-needed-for-native-object-editing"
  ]);
  return {
    ...row,
    matchConfidence: "product-image-object-fallback",
    sourceType: "product-image-object-fallback",
    editableLayerMode: "product-image-object-fallback",
    fullyEditable: true,
    sourceEditable: false,
    visualExact: true,
    needsSourceSvg: true,
    matchReasons: [...reasons],
    layerConfig: withObjectFallbackLayerConfig(product, row)
  };
}

function updateMap(mapPath, productByHandle) {
  const data = readJson(mapPath, { maps: [] });
  const maps = Array.isArray(data.maps) ? data.maps : [];
  let objectFallbackCount = 0;
  let sourceEditableCount = 0;
  const nextRows = maps.map((row) => {
    const next = normalizeRow(row, productByHandle.get(row?.handle));
    if (next?.editableLayerMode === "product-image-object-fallback") objectFallbackCount += 1;
    if (next?.sourceEditable) sourceEditableCount += 1;
    return next;
  });
  const nextData = {
    ...data,
    editableLayerPolicy: "Source SVG rows load native editable objects. Product-image fallback rows load editable object layers from product layer config/assets/crops instead of importing a flattened generated SVG.",
    objectEditableCount: nextRows.filter((row) => row?.fullyEditable).length,
    sourceEditableCount,
    objectFallbackCount,
    flattenedFallbackCount: nextRows.filter((row) => isProductImageFallback(row) && row?.editableLayerMode !== "product-image-object-fallback").length,
    maps: nextRows
  };
  writeJson(mapPath, nextData);
  return {
    mapPath,
    total: nextRows.length,
    sourceEditableCount,
    objectFallbackCount,
    objectEditableCount: nextData.objectEditableCount,
    flattenedFallbackCount: nextData.flattenedFallbackCount
  };
}

const products = readJson(PRODUCT_MANIFEST, { products: [] }).products || [];
const productByHandle = new Map(products.filter((product) => product.handle).map((product) => [product.handle, product]));
const summaries = [
  updateMap(SOURCE_MAP_PATH, productByHandle),
  updateMap(CANDIDATE_MAP_PATH, productByHandle)
];

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), summaries }, null, 2));
