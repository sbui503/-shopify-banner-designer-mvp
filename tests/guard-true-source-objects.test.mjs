import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD_SCRIPT = path.join(ROOT, "scripts/guard-true-source-objects.mjs");

function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root, relativePath, value) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function withGuardFixture(setup) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guard-true-source-"));
  try {
    setup(root);
    return spawnSync(process.execPath, [GUARD_SCRIPT], {
      cwd: root,
      encoding: "utf8"
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeBaseFixture(root, overrides = {}) {
  const trustedSourceRow = {
    handle: "trusted-template",
    matchStatus: "matched",
    sourceType: "source-svg",
    editableLayerMode: "source-svg",
    sourceEditable: true,
    templateSvg: "/svg-layer-templates/trusted-template.svg",
    layerConfig: {
      sourceEditable: true,
      needsSourceSvg: false,
      objectLayerMode: "source-svg"
    }
  };
  const trustedProduct = {
    handle: "trusted-template",
    status: "active",
    type: "Banner",
    templateSvg: "/svg-layer-templates/trusted-template.svg",
    layerConfig: {
      sourceEditable: true,
      needsSourceSvg: false,
      objectLayerMode: "source-svg"
    }
  };

  writeJson(root, "public/team-banner-products.json", {
    products: overrides.products || [trustedProduct]
  });
  writeJson(root, "public/team-banner-source-svg-map.json", {
    maps: overrides.sourceRows || [trustedSourceRow]
  });
  writeJson(root, "public/team-banner-source-svg-candidates.json", {
    maps: overrides.candidateRows || []
  });
  writeJson(root, "public/svg-layer-templates.json", {
    templates: overrides.templates || []
  });
  writeText(root, "public/team-banner-designer.js", overrides.designerScript || "console.log('source only');\n");
  writeText(root, "scripts/promote-visual-exact-svg-matches.py", overrides.promoteScript || "print('source only')\n");
}

function parseSummary(result) {
  assert.equal(result.stdout.trim().startsWith("{"), true, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("true-source guard accepts matched source-backed active products", () => {
  const result = withGuardFixture((root) => writeBaseFixture(root));
  const summary = parseSummary(result);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(summary.findingCount, 0);
});

test("true-source guard rejects active products without matched source rows", () => {
  const orphanProduct = {
    handle: "orphan-template",
    status: "active",
    type: "Banner",
    templateSvg: "/svg-layer-templates/orphan-template.svg",
    layerConfig: {
      sourceEditable: true,
      needsSourceSvg: false,
      objectLayerMode: "source-svg"
    }
  };
  const result = withGuardFixture((root) => writeBaseFixture(root, {
    products: [orphanProduct],
    sourceRows: []
  }));
  const summary = parseSummary(result);

  assert.notEqual(result.status, 0);
  assert.ok(
    summary.findings.some((finding) => /active design product is not backed by a matched source SVG: orphan-template/.test(finding.value)),
    JSON.stringify(summary.findings, null, 2)
  );
});

test("true-source guard rejects generated preview artifacts and text references", () => {
  const result = withGuardFixture((root) => {
    writeBaseFixture(root, {
      designerScript: "const fallback = '/generated-product-svgs/trusted-template.svg';\n"
    });
    writeText(root, "public/generated-product-svgs/trusted-template.svg", "<svg />\n");
  });
  const summary = parseSummary(result);

  assert.notEqual(result.status, 0);
  assert.ok(
    summary.findings.some((finding) => finding.pointer === "public/generated-product-svgs/trusted-template.svg"),
    JSON.stringify(summary.findings, null, 2)
  );
  assert.ok(
    summary.findings.some((finding) => finding.pointer === "public/team-banner-designer.js"),
    JSON.stringify(summary.findings, null, 2)
  );
});
