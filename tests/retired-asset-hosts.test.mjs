import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const RETIRED_HOSTS = [
  ["teamsportbanners", "com"].join("."),
  [["sv", "lct", "vn"].join(".")],
  ["lct", "designs"].join("-"),
  ["lct", "store"].join("-")
].flat();
const RETIRED_HOST_PATTERN = new RegExp(`\\b(?:${RETIRED_HOSTS.map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
const LOCAL_SVG_TEMPLATE_PATTERN = /^\/svg-layer-templates\/[^/]+\.svg$/;
const VECTOR_BACKGROUND_HREF = "__source_svg_vector_background__";

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assertNoRetiredHostText(relativePath) {
  const text = readText(relativePath);
  assert.doesNotMatch(text, RETIRED_HOST_PATTERN, `${relativePath} should not ship retired asset/storefront hosts`);
}

function assertDesignerProductUrl(value, handle, label) {
  assert.equal(typeof value, "string", `${label} should be a string`);
  assert.ok(value.startsWith("/?"), `${label} should stay app-local: ${value}`);

  const url = new URL(value, "https://designer.example.test");
  assert.equal(url.origin, "https://designer.example.test", `${label} should not point at a remote storefront`);
  assert.equal(url.pathname, "/", `${label} should route to the designer root`);
  assert.equal(url.searchParams.get("productHandle"), handle, `${label} should preserve the product handle`);
  assert.equal(url.searchParams.get("autoLoadProduct"), "1", `${label} should auto-load the product`);
  assert.equal(url.searchParams.get("autoLayer"), "png", `${label} should request PNG-backed product loading`);
}

function isVectorBackgroundConfig(config = {}) {
  const backgroundUrls = Array.isArray(config.backgroundUrls) ? config.backgroundUrls : [];
  return [
    config.backgroundUrl,
    config.backgroundSvgUrl,
    ...backgroundUrls
  ].includes(VECTOR_BACKGROUND_HREF)
    || String(config.backgroundSource || "").toLowerCase() === "source-svg-vector-background";
}

test("public designer entry points do not ship retired asset hosts", () => {
  [
    "api/image-proxy.js",
    "public/index.html",
    "public/team-banner-designer.js",
    "public/team-banner-products.json",
    "public/team-banner-source-svg-map.json",
    "public/svg-layer-templates.json"
  ].forEach(assertNoRetiredHostText);
});

test("product and source-map links stay app-local after storefront retirement", () => {
  const productsManifest = readJson("public/team-banner-products.json");
  const sourceMapManifest = readJson("public/team-banner-source-svg-map.json");

  assert.equal(productsManifest.products.length, productsManifest.count);
  assert.equal(sourceMapManifest.maps.length, sourceMapManifest.productCount);

  for (const product of productsManifest.products) {
    assertDesignerProductUrl(product.url, product.handle, `product ${product.handle} url`);
    assert.doesNotMatch(product.path || "", /^https?:/i, `product ${product.handle} path should not be absolute`);
  }

  for (const sourceMap of sourceMapManifest.maps) {
    assertDesignerProductUrl(sourceMap.productUrl, sourceMap.handle, `source map ${sourceMap.handle} productUrl`);
  }
});

test("SVG template manifest uses local source templates instead of retired remote pages", () => {
  const manifest = readJson("public/svg-layer-templates.json");

  assert.ok(manifest.templates.length > 0, "expected SVG templates to be present");

  for (const template of manifest.templates) {
    assert.match(template.url, LOCAL_SVG_TEMPLATE_PATTERN, `${template.name} should use a local template URL`);
    assert.equal(template.sourceUrl, template.url, `${template.name} sourceUrl should match the local template URL`);
    assert.equal(template.sourcePage, "", `${template.name} should not ship a retired source page`);
  }
});

test("vector-background products retain local SVG fallbacks when exact images fail", () => {
  const designerSource = readText("public/team-banner-designer.js");
  const productImageFirstBranch = "launch.image && launch.autoLayer === \"png\" && usesSourceVectorBackground(layerConfig)";
  const matchedSvgBranch = "const shouldUseMatchedSvg = !launch.layerMap";

  assert.ok(designerSource.includes(productImageFirstBranch), "runtime should try exact product images for vector-background products");
  assert.ok(
    designerSource.indexOf(productImageFirstBranch) < designerSource.indexOf(matchedSvgBranch),
    "the exact-image vector-background branch should run before matched SVG import"
  );
  assert.match(
    designerSource,
    /if \(!launch\.templateSvg\) throw error;\s+setStatus\("Product image unavailable\. Loading product SVG layers\.\.\."\);/,
    "runtime should fall through to SVG layers when a vector-background image cannot load"
  );

  const sourceMapManifest = readJson("public/team-banner-source-svg-map.json");
  const vectorBackgroundMaps = sourceMapManifest.maps.filter((sourceMap) => isVectorBackgroundConfig(sourceMap.layerConfig));

  assert.equal(vectorBackgroundMaps.length, 250);
  for (const sourceMap of vectorBackgroundMaps) {
    assert.match(
      sourceMap.templateSvg,
      LOCAL_SVG_TEMPLATE_PATTERN,
      `${sourceMap.handle} should keep a local SVG fallback`
    );
  }
});
