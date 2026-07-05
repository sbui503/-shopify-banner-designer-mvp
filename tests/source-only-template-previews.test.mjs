import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP = "public/team-banner-source-svg-map.json";
const QUARANTINE_DOC = "docs/source-policy-fallback-removal-20260705.md";
const DESIGNER_SCRIPT = "public/team-banner-designer.js";
const GENERATED_PRODUCT_SVG_DIR = "public/generated-product-svgs";

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function publicFileForUrl(url) {
  const clean = String(url || "").split(/[?#]/, 1)[0];
  return clean.startsWith("/") ? path.join(ROOT, "public", clean.slice(1)) : "";
}

function documentedQuarantinedHandles() {
  return readText(QUARANTINE_DOC)
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .map((line) => line.split("|")[1]?.trim())
    .filter((handle) => handle && handle !== "Handle" && !handle.startsWith("---"));
}

function hasConfirmedSourceTemplate(product = {}) {
  const config = product.layerConfig || {};
  return Boolean(product.templateSvg)
    && config.sourceEditable === true
    && config.needsSourceSvg !== true
    && config.objectLayerMode !== "needs-source-svg";
}

function isDesignProduct(product = {}) {
  return product.type !== "easify_addon_product";
}

function nestedStrings(value, strings = []) {
  if (typeof value === "string") {
    strings.push(value);
    return strings;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => nestedStrings(item, strings));
    return strings;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => nestedStrings(item, strings));
  }
  return strings;
}

test("documented source-only quarantined products cannot appear as template previews", () => {
  const handles = documentedQuarantinedHandles();
  const products = readJson(PRODUCT_MANIFEST).products;
  const productByHandle = new Map(products.map((product) => [product.handle, product]));

  assert.equal(handles.length, 42, "quarantine doc should enumerate the intentionally withheld products");

  for (const handle of handles) {
    const product = productByHandle.get(handle);
    assert.ok(product, `expected ${handle} in ${PRODUCT_MANIFEST}`);
    assert.equal(product.status, "needs-source-svg", `${handle} should be withheld from active previews`);
    assert.equal(hasConfirmedSourceTemplate(product), false, `${handle} should not satisfy preview source confirmation`);
    assert.equal(product.templateSvg, undefined, `${handle} should not keep a templateSvg while quarantined`);
    assert.equal(product.layerConfig?.sourceEditable, false, `${handle} should not be source-editable`);
    assert.equal(product.layerConfig?.needsSourceSvg, true, `${handle} should still require a source SVG`);
    assert.equal(product.layerConfig?.objectLayerMode, "needs-source-svg", `${handle} should be marked needs-source-svg`);
    assert.equal(
      fs.existsSync(path.join(ROOT, GENERATED_PRODUCT_SVG_DIR, `${handle}.svg`)),
      false,
      `${handle} should not have a generated preview fallback artifact`
    );
  }
});

test("active design products are backed by matched source SVG templates", () => {
  const products = readJson(PRODUCT_MANIFEST).products;
  const sourceRows = readJson(SOURCE_MAP).maps;
  const sourceByHandle = new Map(sourceRows.map((row) => [row.handle, row]));
  const activeDesignProducts = products.filter((product) => product.status === "active" && isDesignProduct(product));

  assert.ok(activeDesignProducts.length > 0, "fixture should include active design products");

  for (const product of activeDesignProducts) {
    const source = sourceByHandle.get(product.handle);
    assert.equal(source?.matchStatus, "matched", `${product.handle} should have a matched source row`);
    assert.equal(source?.sourceEditable, true, `${product.handle} source row should be editable`);
    assert.equal(hasConfirmedSourceTemplate(product), true, `${product.handle} should satisfy preview source confirmation`);
    assert.match(product.templateSvg, /^\/svg-layer-templates\/.+\.svg$/, `${product.handle} should use a source SVG template`);
    assert.equal(
      fs.existsSync(publicFileForUrl(product.templateSvg)),
      true,
      `${product.handle} source SVG should exist in public/svg-layer-templates`
    );
    assert.doesNotMatch(
      nestedStrings(product).join("\n"),
      /generated-product-svgs|generated-native-object-svg|product-image-(?:object-)?fallback/i,
      `${product.handle} should not reference generated or product-image fallback preview sources`
    );
  }
});

test("browser template catalog keeps the source confirmation gate before rendering products", () => {
  const script = readText(DESIGNER_SCRIPT);
  const generatedPreviewBody = script.match(/function generatedProductPreviewUrl\(product\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  const normalizeBody = script.match(/function normalizeTemplateProduct\(product\) \{([\s\S]*?)\n    \}/)?.[1] || "";

  assert.match(script, /function hasConfirmedSourceTemplate\(product\)/);
  assert.match(generatedPreviewBody, /if \(!hasConfirmedSourceTemplate\(product\)\) return "";/);
  assert.doesNotMatch(generatedPreviewBody, /generated-product-svgs/i);
  assert.match(normalizeBody, /if \(!hasConfirmedSourceTemplate\(product\)\) return null;/);
  assert.doesNotMatch(script, /\/generated-product-svgs\//i);
});
