import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATE_SCRIPT = path.join(ROOT, "scripts/generate-native-object-source-svgs.mjs");

const DEFAULT_LAYER_CONFIG = {
  backgroundCount: 1,
  backgroundUrl: "/assets/background.svg",
  teamLogoCount: 1,
  logoUrl: "/assets/logo.svg",
  clipartCount: 1,
  clipartUrl: "/assets/clipart.svg",
  playerIconCount: 1,
  accessoryUrl: "/assets/player.svg",
  textLayerCount: 3,
  headerTextCount: 1,
  playerTextCount: 1,
  yearTextCount: 1
};

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function makeWorkspace(layerConfigOverrides = {}) {
  const workspace = mkdtempSync(path.join(tmpdir(), "native-source-svg-"));
  const publicDir = path.join(workspace, "public");
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(path.join(publicDir, "svg-layer-templates"), { recursive: true });

  const layerConfig = {
    ...DEFAULT_LAYER_CONFIG,
    ...layerConfigOverrides
  };
  Object.entries(layerConfig).forEach(([key, value]) => {
    if (value === undefined) delete layerConfig[key];
  });

  writeJson(path.join(publicDir, "team-banner-products.json"), {
    products: [
      {
        handle: "baseball-banner",
        title: "Baseball Banner",
        image: "https://cdn.example.com/product-image.jpg",
        shape: "rectangle",
        layerConfig
      }
    ]
  });
  writeJson(path.join(publicDir, "team-banner-source-svg-map.json"), {
    maps: [
      {
        handle: "baseball-banner",
        title: "Baseball Banner",
        matchConfidence: "product-image-object-fallback",
        sourceType: "product-image-object-fallback",
        editableLayerMode: "product-image-object-fallback",
        layerConfig: {}
      }
    ]
  });
  writeJson(path.join(publicDir, "team-banner-source-svg-candidates.json"), { maps: [] });
  writeJson(path.join(publicDir, "svg-layer-templates.json"), { templates: [] });
  return workspace;
}

function runGenerator(workspace, args = []) {
  return spawnSync(process.execPath, [GENERATE_SCRIPT, ...args], {
    cwd: workspace,
    encoding: "utf8"
  });
}

function withWorkspace(layerConfigOverrides, callback) {
  const workspace = makeWorkspace(layerConfigOverrides);
  try {
    return callback(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("generator uses configured true source object URLs instead of product image fallbacks", () => {
  withWorkspace({}, (workspace) => {
    const result = runGenerator(workspace, ["--apply"]);

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.objectFallbackRowsFound, 1);
    assert.equal(summary.generatedNativeSourceSvgs, 1);

    const svgPath = path.join(
      workspace,
      "public",
      "svg-layer-templates",
      "generated-native-baseball-banner.svg"
    );
    assert.equal(existsSync(svgPath), true);

    const svg = readFileSync(svgPath, "utf8");
    assert.match(svg, /href="\/assets\/background\.svg"/);
    assert.match(svg, /href="\/assets\/logo\.svg"/);
    assert.match(svg, /href="\/assets\/clipart\.svg"/);
    assert.match(svg, /href="\/assets\/player\.svg"/);
    assert.doesNotMatch(svg, /product-image\.jpg|data:image\/svg\+xml|placeholder/i);
  });
});

test("generator refuses to use product images when a true background URL is missing", () => {
  withWorkspace({ backgroundUrl: undefined }, (workspace) => {
    const result = runGenerator(workspace);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing true source background URL/);
    assert.match(result.stderr, /refusing to use product image fallback/);
  });
});

test("generator refuses to synthesize placeholder object URLs", () => {
  withWorkspace({ logoUrl: "/assets/background.svg" }, (workspace) => {
    const result = runGenerator(workspace);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing true source object URL for team logo/);
    assert.match(result.stderr, /refusing to generate a placeholder object/);
  });
});
