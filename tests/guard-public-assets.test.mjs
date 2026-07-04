import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const GUARD_SOURCE = path.join(REPO_ROOT, "scripts/guard-public-assets.mjs");

function writeFixtureFile(root, relPath, content = "") {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function removeFixturePath(root, relPath) {
  fs.rmSync(path.join(root, relPath), { force: true, recursive: true });
}

function createFixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "public-asset-guard-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));

  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(GUARD_SOURCE, path.join(root, "scripts/guard-public-assets.mjs"));

  const files = {
    "public/index.html": [
      "<!doctype html>",
      "<link rel=\"stylesheet\" href=\"/team-banner-designer.css?v=1\">",
      "<script src=\"/team-banner-designer.js#boot\"></script>",
      "<img src=\"/team-sport-banners-logo.jpg\" alt=\"Team Sport Banners\">",
      `<img src="${options.remoteBootAssetUrl || "https://cdn.invalid/boot.png"}" alt="">`,
      "<img src=\"https://cdn.invalid/api/generated-preview.png\" alt=\"API generated preview\">"
    ].join("\n"),
    "public/team-banner-designer.css": [
      ".preview {",
      "  background-image: url('./svg-layer-templates/template.svg?cache=1#icon');",
      "}"
    ].join("\n"),
    "public/team-banner-designer.js": [
      "const manifestPromise = fetch('/team-banner-assets.shopify.json?cache=1');",
      "const layer = {",
      "  imageUrl: './svg-layer-templates/template.svg',",
      "  svgUrl: 'generated-product-svgs/rendered.svg'",
      "};",
      "const ignoredRemote = { url: 'https://cdn.invalid/runtime.svg' };",
      "void manifestPromise;",
      "void layer;",
      "void ignoredRemote;"
    ].join("\n"),
    "public/team-banner-assets.shopify.json": JSON.stringify(
      {
        assets: [
          {
            id: "fixture",
            svgUrl: "/svg-layer-templates/template.svg",
            imageUrl: "https://blob.vercel-storage.com/remote.svg"
          }
        ]
      },
      null,
      2
    ),
    "public/team-banner-products.json": JSON.stringify(
      [{ id: "product", imageUrl: "/generated-product-svgs/rendered.svg" }],
      null,
      2
    ),
    "public/team-banner-layer-maps.json": JSON.stringify(
      { fixture: { templateSvg: "svg-layer-templates/template.svg?from=layer" } },
      null,
      2
    ),
    "public/team-banner-source-svg-map.json": JSON.stringify(
      { fixture: { layoutSvgUrl: "./svg-layer-templates/template.svg#source" } },
      null,
      2
    ),
    "public/svg-layer-templates.json": JSON.stringify(
      { templates: [{ templateSvg: "svg-layer-templates/template.svg" }] },
      null,
      2
    ),
    "public/team-sport-banners-logo.jpg": "fixture jpg",
    "public/svg-layer-templates/template.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" />",
    "public/generated-product-svgs/rendered.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" />"
  };

  for (const [relPath, content] of Object.entries(files)) {
    writeFixtureFile(root, relPath, content);
  }

  for (const relPath of options.omit || []) {
    removeFixturePath(root, relPath);
  }

  return root;
}

function runGuard(root, env = {}) {
  return spawnSync(process.execPath, ["scripts/guard-public-assets.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      ASSET_GUARD_REMOTE: "0",
      ...env
    },
    encoding: "utf8"
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

test("passes when required public files and discovered local references exist", (t) => {
  const root = createFixture(t);
  const result = runGuard(root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Public asset integrity guard passed: \d+ local asset references checked\./);
  assert.doesNotMatch(result.stdout, /Remote boot asset guard passed/);
});

test("fails fast when a required public deploy artifact is missing", (t) => {
  const root = createFixture(t, {
    omit: ["public/team-banner-products.json"]
  });
  const result = runGuard(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Public asset integrity guard failed\./);
  assert.match(result.stderr, /missing required public file: public\/team-banner-products\.json/);
  assert.match(result.stderr, /missing scan input: public\/team-banner-products\.json/);
});

test("reports one missing local asset with every public file that referenced it", (t) => {
  const root = createFixture(t, {
    omit: ["public/svg-layer-templates/template.svg"]
  });
  const result = runGuard(root);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /public\/svg-layer-templates\/template\.svg referenced by /);
  assert.match(result.stderr, /public\/team-banner-assets\.shopify\.json/);
  assert.match(result.stderr, /public\/team-banner-designer\.css/);
  assert.match(result.stderr, /public\/team-banner-designer\.js/);
  assert.match(result.stderr, /public\/team-banner-layer-maps\.json/);
  assert.match(result.stderr, /public\/team-banner-source-svg-map\.json/);
  assert.match(result.stderr, /public\/svg-layer-templates\.json/);
});

test("checks only non-API remote boot assets from index.html", async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end(`missing: ${request.url}`);
  });
  t.after(() => server.close());

  const address = await listen(server);
  const root = createFixture(t, {
    remoteBootAssetUrl: `http://127.0.0.1:${address.port}/missing-boot.png`
  });

  const result = runGuard(root, {
    ASSET_GUARD_REMOTE: "1",
    ASSET_GUARD_REMOTE_TIMEOUT_MS: "1000"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /http:\/\/127\.0\.0\.1:\d+\/missing-boot\.png returned HTTP 404/);
  assert.doesNotMatch(result.stderr, /api\/generated-preview\.png/);
});
