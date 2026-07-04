import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const rewrites = vercelConfig.rewrites ?? [];
const rewriteDestinationsBySource = new Map(
  rewrites.map(({ source, destination }) => [source, destination])
);

function matchesRewriteSource(source, pathname) {
  if (source === pathname) {
    return true;
  }

  const wildcardMatch = source.match(/^(.+)\/:path\*$/);
  if (!wildcardMatch) {
    return false;
  }

  const prefix = `${wildcardMatch[1]}/`;
  return pathname.startsWith(prefix) && pathname.length > prefix.length;
}

function findRewrite(pathname) {
  return rewrites.find(({ source }) => matchesRewriteSource(source, pathname));
}

test("designer entry routes include exact trailing-slash aliases", () => {
  for (const route of [
    "/custom-design-request",
    "/custom-design-request/",
    "/design-tool",
    "/design-tool/"
  ]) {
    assert.equal(
      rewriteDestinationsBySource.get(route),
      "/",
      `${route} should rewrite to the designer SPA`
    );
  }
});

test("designer entry requests resolve to the SPA rewrite", () => {
  const cases = [
    ["/custom-design-request", "/custom-design-request"],
    ["/custom-design-request/", "/custom-design-request/"],
    ["/design-tool", "/design-tool"],
    ["/design-tool/", "/design-tool/"],
    ["/design-tool/saved-design/abc123", "/design-tool/:path*"]
  ];

  for (const [pathname, expectedSource] of cases) {
    assert.deepEqual(
      findRewrite(pathname),
      { source: expectedSource, destination: "/" },
      `${pathname} should resolve to the designer SPA rewrite`
    );
  }
});

test("designer rewrites do not capture API or static asset endpoints", () => {
  for (const pathname of [
    "/api/designs",
    "/team-banner-assets.shopify.json",
    "/svg-layer-templates/baseball.svg"
  ]) {
    assert.equal(findRewrite(pathname), undefined, `${pathname} should not be rewritten`);
  }
});
