import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "sync-design-tool-assets.mjs");
const LEGACY_ASSET_API_URL = "https://sv.lct.vn/crud/find";
const DEPLOYABLE_MANIFEST_PATHS = [
  "public/team-banner-assets.shopify.json",
  "shopify-banner-designer/assets/team-banner-assets.shopify.json",
  "shopify-banner-designer-app/extensions/team-banner-designer/assets/team-banner-assets.shopify.json"
];

function createTempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "team-banner-assets-"));
  return {
    outputPath: path.join(dir, "team-banner-assets.shopify.json"),
    reportDir: path.join(dir, "report")
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      resolve(body);
    });
    request.on("error", reject);
  });
}

function startAssetApi() {
  const server = http.createServer(async (request, response) => {
    await readRequestBody(request);

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      total: 1,
      docs: [
        {
          _id: "asset-1",
          label: "Bears Team Name",
          type: "teamname",
          img_url: "https://cdn.example.com/bears-team-name.png",
          svg_url: "https://cdn.example.com/svg/bears-team-name.svg"
        }
      ]
    }));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/crud/find`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => {
            if (error) {
              closeReject(error);
              return;
            }
            closeResolve();
          });
        })
      });
    });
  });
}

function runSyncScript({ outputPath, reportDir, apiUrl }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, outputPath, reportDir], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        TEAM_BANNER_DESIGN_TOOL_API_URL: apiUrl
      }
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function assertNoLegacySourceApi(manifest, label) {
  assert.equal(
    Object.hasOwn(manifest, "sourceApi"),
    false,
    `${label} must not expose sourceApi metadata`
  );
  assert.doesNotMatch(
    JSON.stringify(manifest),
    /https:\/\/sv\.lct\.vn\/crud\/find/,
    `${label} must not reference the legacy asset API`
  );
}

test("deployable Shopify asset manifests do not expose legacy source API metadata", () => {
  for (const relativePath of DEPLOYABLE_MANIFEST_PATHS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8"));

    assertNoLegacySourceApi(manifest, relativePath);
    assert.notEqual(manifest.source, LEGACY_ASSET_API_URL);
    assert.ok(Array.isArray(manifest.assets), `${relativePath} should contain asset entries`);
  }
});

test("sync-design-tool-assets regenerates manifests without sourceApi metadata", async () => {
  const api = await startAssetApi();
  const { outputPath, reportDir } = createTempPaths();

  try {
    const result = await runSyncScript({ outputPath, reportDir, apiUrl: api.url });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.ok(result.stdout.includes(`Fetched 1/1 records from ${api.url}.`));

    const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assertNoLegacySourceApi(manifest, "regenerated design-tool manifest");
    assert.equal(manifest.assetCount, 1);
    assert.equal(manifest.assets[0].name, "Bears Team Name");
    assert.equal(manifest.assets[0].role, "team-name-logo");
    assert.ok(fs.existsSync(path.join(reportDir, "asset-sync-summary.json")));
  } finally {
    await api.close();
  }
});
