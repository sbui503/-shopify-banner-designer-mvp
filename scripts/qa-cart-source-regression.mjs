import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SVG_DIR = path.join(PUBLIC_DIR, "svg-layer-templates");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function readJson(file) {
  return JSON.parse(read(file));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrs(tag) {
  const out = {};
  for (const match of String(tag || "").matchAll(/([:@a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return out;
}

function svgImages(svgText) {
  return [...svgText.matchAll(/<image\b[^>]*>/gi)].map((match, index) => {
    const attr = attrs(match[0]);
    return {
      index,
      href: attr.href || attr["xlink:href"] || "",
      className: String(attr.class || "").toLowerCase()
    };
  });
}

function fileFromSvgRef(ref) {
  const name = String(ref || "").split("?")[0].split("#")[0].split("/").pop();
  return name && name.endsWith(".svg") ? path.join(SVG_DIR, name) : "";
}

function fail(message, detail = {}) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

const indexHtml = read(path.join(PUBLIC_DIR, "index.html"));
const designerJs = read(path.join(PUBLIC_DIR, "team-banner-designer.js"));
const sourceMap = readJson(path.join(PUBLIC_DIR, "team-banner-source-svg-map.json"));

[
  "data-tbd-cart-count",
  "data-tbd-panel=\"cart\"",
  "data-tbd-cart-summary",
  "data-tbd-cart-items",
  "data-tbd-cart-checkout"
].forEach((needle) => {
  if (!indexHtml.includes(needle)) fail(`Missing cart UI hook: ${needle}`);
});

[
  "addCurrentDesignToToolCart",
  "renderDesignCart",
  "redirectToShopifyCheckout",
  "cartLineUrl",
  "svgRoleFromSourceSummary"
].forEach((needle) => {
  if (!designerJs.includes(needle)) fail(`Missing cart runtime function: ${needle}`);
});

if (indexHtml.includes("data-tbd-checkout-frame") || designerJs.includes("openCheckoutFrame")) {
  fail("Checkout is still embedded instead of redirecting to Shopify checkout");
}

if (/saveOrAddToCart\(\)\s*{[\s\S]{0,250}saveAndOpenCustomCheckout/.test(designerJs)) {
  fail("Add to Cart still calls immediate checkout flow");
}

if (!designerJs.includes("(preserveSvgAssets && entry.href)")) {
  fail("Exact source SVG loads do not preserve per-entry image hrefs first");
}

const loggers = sourceMap.maps.find((row) => row.handle === "triangle-loggers-triangle-soccer-pennant");
if (!loggers) fail("Missing Loggers regression row");
const loggersSvgFile = fileFromSvgRef(loggers.templateSvg || loggers.layerConfig?.layoutSvgUrl);
const loggersImages = svgImages(read(loggersSvgFile));
const lockedBackground = loggersImages.find((image) => /background|locked/.test(image.className));
if (!lockedBackground) fail("Loggers SVG has no locked background for regression");
if (loggers.layerConfig.backgroundUrl !== lockedBackground.href) {
  fail("Loggers backgroundUrl does not match locked SVG background", {
    expected: lockedBackground.href,
    actual: loggers.layerConfig.backgroundUrl
  });
}
if ((loggers.layerConfig.backgroundUrls || [])[0] !== lockedBackground.href) {
  fail("Loggers backgroundUrls array does not match locked SVG background", {
    expected: lockedBackground.href,
    actual: loggers.layerConfig.backgroundUrls
  });
}

let checked = 0;
for (const row of sourceMap.maps) {
  const svgFile = fileFromSvgRef(row.templateSvg || row.layerConfig?.layoutSvgUrl);
  if (!svgFile || !fs.existsSync(svgFile)) continue;
  checked += 1;
  const images = svgImages(read(svgFile));
  const locked = images.find((image) => /background|locked/.test(image.className));
  if (locked && row.layerConfig?.backgroundUrl && row.layerConfig.backgroundUrl !== locked.href) {
    fail("Source map backgroundUrl diverges from locked SVG background", {
      handle: row.handle,
      expected: locked.href,
      actual: row.layerConfig.backgroundUrl
    });
  }
  if (row.layerConfig?.sourceRoleSummary && row.layerConfig.sourceRoleSummary.filter((item) => item.role === "background").length > 1) {
    fail("Source map contains multiple background roles", { handle: row.handle });
  }
  if (Array.isArray(row.layerConfig?.sourceRoleSummary)) {
    const roleCounts = row.layerConfig.sourceRoleSummary.reduce((acc, item) => {
      acc[item.role] = (acc[item.role] || 0) + 1;
      return acc;
    }, {});
    const checks = [
      ["background", "backgroundCount"],
      ["teamLogo", "teamLogoCount"],
      ["clipart", "clipartCount"],
      ["playerIcon", "playerIconCount"]
    ];
    for (const [role, key] of checks) {
      const expected = Number(row.layerConfig[key] || 0);
      if (expected && (roleCounts[role] || 0) !== expected) {
        fail("Source role summary count diverges from layer config", {
          handle: row.handle,
          role,
          expected,
          actual: roleCounts[role] || 0
        });
      }
    }
  }
}

for (const handle of ["gunners-soccer-banner", "space-monkeys-softball-banner"]) {
  const row = sourceMap.maps.find((item) => item.handle === handle);
  if (!row?.layerConfig?.sourceRoleSummary) fail("Missing shared-asset source role regression row", { handle });
  const counts = row.layerConfig.sourceRoleSummary.reduce((acc, item) => {
    acc[item.role] = (acc[item.role] || 0) + 1;
    return acc;
  }, {});
  if (counts.teamLogo !== row.layerConfig.teamLogoCount || counts.playerIcon !== row.layerConfig.playerIconCount) {
    fail("Shared source asset roles are no longer index-specific", {
      handle,
      counts,
      expectedTeamLogo: row.layerConfig.teamLogoCount,
      expectedPlayerIcon: row.layerConfig.playerIconCount
    });
  }
}

console.log(JSON.stringify({
  ok: true,
  checkedSourceRows: checked,
  cartUi: true,
  directCheckoutDisabled: true,
  shopifyCheckoutRedirect: true,
  exactSvgHrefPreserved: true,
  loggersBackgroundRegression: true,
  sourceRoleSummaryRegression: true
}, null, 2));
