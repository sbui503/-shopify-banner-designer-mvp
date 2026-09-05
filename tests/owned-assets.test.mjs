import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import imageProxyHandler, { isAllowedImageUrl, parseTargetUrl } from "../api/image-proxy.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const ASSET_MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "public/team-banner-assets.owned.json"), "utf8"));
const OWNED_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "public/team-banner-owned-asset-map.json"), "utf8"));
const RUNTIME_PRODUCTS_PATH = path.join(ROOT, "public/team-banner-products.runtime.json");
const RUNTIME_ASSETS_PATH = path.join(ROOT, "public/team-banner-assets.runtime.json");
const RUNTIME_MAP_PATH = path.join(ROOT, "public/team-banner-owned-asset-map.runtime.json");
const RUNTIME_TEMPLATES_PATH = path.join(ROOT, "public/svg-layer-templates.runtime.json");
const TEMPLATE_DIR = path.join(ROOT, "public/svg-layer-templates");
const LEGACY_HOST_PATTERN = /(?:lct-designs|svg-design)\.s3\.us-west-1\.amazonaws\.com|(?:www\.)?teambannersports\.com|sv\.lct\.vn/i;
const IMAGE_HREF_PATTERN = /<image\b[^>]*?(?:href|xlink:href)=(?:"([^"]+)"|'([^']+)')/gi;
const APPROVED_PUBLIC_HOSTS = new Set([
  "cdn.shopify.com",
  "teamsportbanners.com",
  "www.teamsportbanners.com",
  "b4cuoooyldjrdeea.public.blob.vercel-storage.com"
]);

function pathKey(value) {
  return decodeURIComponent(new URL(String(value).replace(/^\/\//, "https://")).pathname);
}

function mappedUrl(key) {
  const record = OWNED_MAP.assets[key];
  return typeof record === "string" ? record : record && record.url;
}

function assertApprovedAssetUrl(value) {
  assert.ok(value, "asset URL must not be empty");
  if (/^(?:\/|data:)/i.test(value)) return;
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.ok(APPROVED_PUBLIC_HOSTS.has(url.hostname), `unapproved asset host: ${url.hostname}`);
}

test("owned asset manifest replaces all 1,506 missing records", () => {
  assert.equal(ASSET_MANIFEST.policy, "owned-sources-only");
  assert.equal(ASSET_MANIFEST.assetCount, 9488);
  assert.equal(ASSET_MANIFEST.exactAssetCount, 7982);
  assert.equal(ASSET_MANIFEST.recreatedAssetCount, 1506);
  assert.equal(ASSET_MANIFEST.assets.length, 9488);
  for (const asset of ASSET_MANIFEST.assets) {
    assertApprovedAssetUrl(asset.url);
    assert.equal(LEGACY_HOST_PATTERN.test(JSON.stringify(asset)), false, `legacy source leaked into asset ${asset.sourceId}`);
  }
});

test("every legacy SVG image reference has an owned replacement", () => {
  let templateCount = 0;
  let legacyReferenceCount = 0;
  for (const fileName of fs.readdirSync(TEMPLATE_DIR)) {
    if (!fileName.endsWith(".svg")) continue;
    templateCount += 1;
    const svg = fs.readFileSync(path.join(TEMPLATE_DIR, fileName), "utf8");
    for (const match of svg.matchAll(IMAGE_HREF_PATTERN)) {
      const href = String(match[1] || match[2] || "").replace(/&amp;/g, "&");
      if (!LEGACY_HOST_PATTERN.test(href)) continue;
      legacyReferenceCount += 1;
      const replacement = mappedUrl(pathKey(href));
      assertApprovedAssetUrl(replacement);
    }
  }
  assert.equal(templateCount, 5866);
  assert.equal(legacyReferenceCount, 41877);
  assert.equal(OWNED_MAP.templateLegacyPathCount, 8832);
});

test("Alligators source layers map to exact owned backup files", () => {
  const expectedPaths = [
    "/assets/libs/alligators-a-1639964581500.png",
    "/assets/libs/alligators-a-soflball-banner-1639966233827.png",
    "/assets/libs/alligators-a-soflball-banner-1639966281994.png"
  ];
  for (const key of expectedPaths) {
    const record = OWNED_MAP.assets[key];
    assert.equal(record.quality, "recovered-exact");
    assert.match(record.url, /^https:\/\/b4cuoooyldjrdeea\.public\.blob\.vercel-storage\.com\//);
  }
});

test("customer runtime catalogs are compact and contain owned sources only", () => {
  const runtimeProducts = JSON.parse(fs.readFileSync(RUNTIME_PRODUCTS_PATH, "utf8"));
  const runtimeAssets = JSON.parse(fs.readFileSync(RUNTIME_ASSETS_PATH, "utf8"));
  const runtimeMap = JSON.parse(fs.readFileSync(RUNTIME_MAP_PATH, "utf8"));
  const runtimeTemplates = JSON.parse(fs.readFileSync(RUNTIME_TEMPLATES_PATH, "utf8"));
  const serialized = JSON.stringify({ runtimeProducts, runtimeAssets, runtimeMap, runtimeTemplates });

  assert.equal(runtimeProducts.policy, "owned-sources-only");
  assert.equal(runtimeProducts.products.length, 7535);
  assert.equal(runtimeAssets.assets.length, 9488);
  assert.equal(Object.keys(runtimeMap.assets).length, 19062);
  assert.equal(runtimeTemplates.templates.length, 5866);
  assert.equal(LEGACY_HOST_PATTERN.test(serialized), false);
  assert.ok(Buffer.byteLength(serialized) < 18 * 1024 * 1024);

  const allStar = runtimeProducts.products.find((product) => product.handle === "all-star-baseball-banner");
  assert.equal(allStar.ownedRuntime, true);
  assert.equal(allStar.templateSvg, "/svg-layer-templates/1641354165414.svg");
  assert.equal(allStar.layerConfig.objectLayerMode, "source-svg");
});

test("image proxy rejects legacy and unrelated hosts", () => {
  assert.equal(isAllowedImageUrl("https://cdn.shopify.com/example.png"), true);
  assert.equal(isAllowedImageUrl("https://b4cuoooyldjrdeea.public.blob.vercel-storage.com/example.png"), true);
  assert.equal(isAllowedImageUrl("https://lct-designs.s3.us-west-1.amazonaws.com/example.png"), false);
  assert.equal(isAllowedImageUrl("https://teambannersports.com/example.png"), false);
  assert.equal(isAllowedImageUrl("https://example.com/example.png"), false);
  assert.throws(
    () => parseTargetUrl({ headers: { host: "teamsportbanners.vercel.app" }, url: "/api/image-proxy?url=https%3A%2F%2Flct-designs.s3.us-west-1.amazonaws.com%2Fbad.png" }),
    /not owned or approved/i
  );
});

test("image proxy blocks redirects to an unapproved host", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (value) => {
    calls.push(String(value));
    return new Response(null, {
      status: 302,
      headers: { location: "https://teambannersports.com/foreign.png" }
    });
  };
  let statusCode = 0;
  let jsonBody = null;
  const response = {
    setHeader() {},
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
    send() {},
    end() {}
  };
  try {
    await imageProxyHandler({
      method: "GET",
      headers: { host: "teamsportbanners.vercel.app" },
      url: "/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fsafe.png"
    }, response);
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(statusCode, 502);
  assert.match(jsonBody.error, /redirect left/i);
});
