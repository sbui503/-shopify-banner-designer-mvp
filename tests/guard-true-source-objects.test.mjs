import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD_SCRIPT = path.join(ROOT, "scripts/guard-true-source-objects.mjs");
const VECTOR_BACKGROUND_HREF = "__source_svg_vector_background__";

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function makeWorkspace({
  products = [],
  sourceMaps = [],
  candidateMaps = [],
  templates = []
} = {}) {
  const workspace = mkdtempSync(path.join(tmpdir(), "true-source-guard-"));
  const publicDir = path.join(workspace, "public");
  mkdirSync(publicDir, { recursive: true });
  writeJson(path.join(publicDir, "team-banner-products.json"), { products });
  writeJson(path.join(publicDir, "team-banner-source-svg-map.json"), { maps: sourceMaps });
  writeJson(path.join(publicDir, "team-banner-source-svg-candidates.json"), { maps: candidateMaps });
  writeJson(path.join(publicDir, "svg-layer-templates.json"), { templates });
  return workspace;
}

function runGuard(workspace) {
  return spawnSync(process.execPath, [GUARD_SCRIPT], {
    cwd: workspace,
    encoding: "utf8"
  });
}

function parseSummary(result) {
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function withWorkspace(fixture, callback) {
  const workspace = makeWorkspace(fixture);
  try {
    return callback(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("guard passes matched source-svg rows and valid vector background summaries", () => {
  withWorkspace({
    products: [
      {
        handle: "matched-banner",
        layerConfig: {
          sourceEditable: true
        }
      }
    ],
    sourceMaps: [
      {
        handle: "matched-banner",
        matchStatus: "matched",
        sourceType: "source-svg",
        sourceEditable: true,
        layerConfig: {
          objectLayerMode: "source-svg",
          sourceEditable: true,
          needsSourceSvg: false
        }
      },
      {
        handle: "vector-background-banner",
        matchStatus: "matched",
        sourceType: "source-svg",
        layerConfig: {
          backgroundSource: "source-svg-vector-background",
          backgroundUrl: VECTOR_BACKGROUND_HREF,
          sourceRoleSummary: [
            {
              index: -1,
              role: "background",
              href: VECTOR_BACKGROUND_HREF,
              className: "vector-background locked"
            }
          ]
        }
      }
    ],
    templates: [
      {
        name: "vector-background-banner",
        backgroundUrl: VECTOR_BACKGROUND_HREF
      }
    ]
  }, (workspace) => {
    const result = runGuard(workspace);
    const summary = parseSummary(result);

    assert.equal(result.status, 0);
    assert.equal(summary.findingCount, 0);
  });
});

test("guard rejects fallback and placeholder values anywhere in checked manifests", () => {
  withWorkspace({
    products: [
      {
        handle: "fallback-banner",
        layerConfig: {
          backgroundUrl: "/generated-placeholder-team.svg",
          logoUrl: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"
        }
      }
    ],
    templates: [
      {
        name: "fallback-template",
        tags: "layout-source:product-image-object-fallback"
      }
    ]
  }, (workspace) => {
    const result = runGuard(workspace);
    const summary = parseSummary(result);
    const values = summary.findings.map((finding) => finding.value);

    assert.notEqual(result.status, 0);
    assert.equal(summary.findingCount, 3);
    assert(values.includes("/generated-placeholder-team.svg"));
    assert(values.includes("data:image/svg+xml,%3Csvg%3E%3C/svg%3E"));
    assert(values.includes("layout-source:product-image-object-fallback"));
  });
});

test("guard rejects editable rows that are not matched source SVGs", () => {
  withWorkspace({
    sourceMaps: [
      {
        handle: "partial-banner",
        matchStatus: "partial",
        sourceType: "bitmap-crop",
        sourceEditable: true,
        needsSourceSvg: true,
        layerConfig: {
          sourceEditable: true
        }
      }
    ]
  }, (workspace) => {
    const result = runGuard(workspace);
    const summary = parseSummary(result);
    const values = summary.findings.map((finding) => finding.value);

    assert.notEqual(result.status, 0);
    assert(values.includes("non-matched source row promoted as editable: partial"));
    assert(values.includes("editable row is not source-svg: bitmap-crop"));
    assert(values.includes("editable row still needs source SVG"));
  });
});

test("guard rejects editable products without a matched source row", () => {
  withWorkspace({
    products: [
      {
        handle: "missing-source-banner",
        layerConfig: {
          sourceEditable: true
        }
      }
    ]
  }, (workspace) => {
    const result = runGuard(workspace);
    const summary = parseSummary(result);

    assert.notEqual(result.status, 0);
    assert.deepEqual(summary.findings, [
      {
        pointer: "public/team-banner-products.json/products/0",
        value: "product promoted without matched source row: missing"
      }
    ]);
  });
});

test("guard rejects vector backgrounds missing a source role summary object", () => {
  withWorkspace({
    sourceMaps: [
      {
        handle: "vector-background-banner",
        matchStatus: "matched",
        sourceType: "source-svg",
        layerConfig: {
          backgroundSource: "source-svg-vector-background",
          backgroundUrl: VECTOR_BACKGROUND_HREF,
          sourceRoleSummary: []
        }
      }
    ]
  }, (workspace) => {
    const result = runGuard(workspace);
    const summary = parseSummary(result);

    assert.notEqual(result.status, 0);
    assert.deepEqual(summary.findings, [
      {
        pointer: "public/team-banner-source-svg-map.json/maps/0",
        value: "vector source background missing sourceRoleSummary background object"
      }
    ]);
  });
});
