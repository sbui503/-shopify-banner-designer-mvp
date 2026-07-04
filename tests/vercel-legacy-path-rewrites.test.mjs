import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

const EXACT_LEGACY_PATHS = [
  "/team-banner",
  "/collections",
  "/products",
  "/pages",
  "/baseball-banners",
  "/softball-banners",
  "/soccer-banners",
  "/custom-design-request",
  "/design-tool",
  "/cart",
  "/checkout",
  "/account",
  "/order-detail",
  "/sign-in",
  "/sign-up",
  "/official-notice"
];

const NESTED_LEGACY_PATHS = [
  "/team-banner",
  "/collections",
  "/products",
  "/pages",
  "/baseball-banners",
  "/softball-banners",
  "/soccer-banners",
  "/design-tool",
  "/checkout",
  "/account"
];

const PROTECTED_ENTRY_POINTS = [
  "/api/designs",
  "/api/image-proxy",
  "/api/send-proof-email",
  "/team-banner-assets.shopify.json",
  "/team-banner-products.json",
  "/team-banner-layer-maps.json",
  "/team-banner-designer.js",
  "/svg-layer-templates.json",
  "/svg-layer-templates/baseball.svg"
];

function rewrites() {
  assert.ok(Array.isArray(vercelConfig.rewrites), "vercel.json must define a rewrites array");
  return vercelConfig.rewrites;
}

function designerRewriteMap() {
  return new Map(
    rewrites()
      .filter((rewrite) => rewrite.destination === "/")
      .map((rewrite) => [rewrite.source, rewrite])
  );
}

function sourceMatchesPath(source, pathname) {
  const sourceSegments = source.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);

  let pathIndex = 0;
  for (const sourceSegment of sourceSegments) {
    if (sourceSegment === "(.*)" || /^:[A-Za-z][A-Za-z0-9_]*\*$/.test(sourceSegment)) {
      return true;
    }

    const pathSegment = pathSegments[pathIndex];
    if (pathSegment === undefined) return false;

    if (/^:[A-Za-z][A-Za-z0-9_]*$/.test(sourceSegment)) {
      pathIndex += 1;
      continue;
    }

    if (sourceSegment.includes("*")) {
      const wildcardPattern = new RegExp(`^${sourceSegment.split("*").map(escapeRegExp).join(".*")}$`);
      if (!wildcardPattern.test(pathSegment)) return false;
      pathIndex += 1;
      continue;
    }

    if (sourceSegment !== pathSegment) return false;
    pathIndex += 1;
  }

  return pathIndex === pathSegments.length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("legacy customer entry paths rewrite to the designer root", () => {
  const routes = designerRewriteMap();

  for (const source of EXACT_LEGACY_PATHS) {
    assert.ok(routes.has(source), `Missing designer rewrite for ${source}`);
    assert.equal(routes.get(source).destination, "/", `${source} must rewrite to the designer root`);
  }
});

test("legacy customer nested paths keep rewriting to the designer root", () => {
  const routes = designerRewriteMap();

  for (const source of NESTED_LEGACY_PATHS.map((legacyPath) => `${legacyPath}/:path*`)) {
    assert.ok(routes.has(source), `Missing nested designer rewrite for ${source}`);
    assert.equal(routes.get(source).destination, "/", `${source} must rewrite to the designer root`);
  }
});

test("designer rewrites do not capture API routes or static asset entry points", () => {
  const designerRewrites = rewrites().filter((rewrite) => rewrite.destination === "/");

  for (const pathname of PROTECTED_ENTRY_POINTS) {
    const matchingSources = designerRewrites
      .filter((rewrite) => sourceMatchesPath(rewrite.source, pathname))
      .map((rewrite) => rewrite.source);

    assert.deepEqual(matchingSources, [], `${pathname} must not be rewritten to the designer root`);
  }
});

