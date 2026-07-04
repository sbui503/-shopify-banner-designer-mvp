import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESIGN_TOOL_SCRIPT = "scripts/sync-design-tool-assets.mjs";
const DESIGN_DB_SCRIPT = "scripts/sync-teambannersports-design-db-svgs.mjs";
const LEGACY_DESIGN_TOOL_LABEL = "https://teambannersports.com/design-tool/?m=5";
const LEGACY_ADMIN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";
const LEGACY_CRUD_ENDPOINT = "https://sv.lct.vn/crud/find";

function scriptPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.TEAM_BANNER_DESIGN_TOOL_API_URL;
  delete env.TEAM_BANNER_DESIGN_DB_API_URL;
  return { ...env, ...overrides };
}

function runScriptSync(relativePath, options = {}) {
  return spawnSync(process.execPath, [scriptPath(relativePath), ...(options.args || [])], {
    cwd: ROOT,
    encoding: "utf8",
    env: cleanEnv(options.env)
  });
}

function runScript(relativePath, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath(relativePath), ...(options.args || [])], {
      cwd: ROOT,
      env: cleanEnv(options.env),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}/crud/find`);
    });
  });
}

test("sync scripts require configured API URLs instead of falling back to legacy endpoints", () => {
  const cases = [
    {
      script: DESIGN_TOOL_SCRIPT,
      message: "TEAM_BANNER_DESIGN_TOOL_API_URL is required"
    },
    {
      script: DESIGN_DB_SCRIPT,
      message: "TEAM_BANNER_DESIGN_DB_API_URL is required"
    }
  ];

  for (const { script, message } of cases) {
    const result = runScriptSync(script);
    const output = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0, `${script} should fail without its API URL`);
    assert.match(output, new RegExp(message), `${script} should explain the required env var`);
    assert.doesNotMatch(output, /sv\.lct\.vn|lct-designs\.s3|teambannersports\.com\/design-tool/i, `${script} should not advertise legacy domains`);
  }
});

test("sync scripts do not contain stale legacy endpoint constants", () => {
  const designToolScript = fs.readFileSync(scriptPath(DESIGN_TOOL_SCRIPT), "utf8");
  const designDbScript = fs.readFileSync(scriptPath(DESIGN_DB_SCRIPT), "utf8");

  assert.doesNotMatch(designToolScript, new RegExp(LEGACY_DESIGN_TOOL_LABEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(designToolScript, new RegExp(LEGACY_CRUD_ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(designDbScript, new RegExp(LEGACY_CRUD_ENDPOINT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(designDbScript, new RegExp(LEGACY_ADMIN_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("design tool asset sync writes configured source metadata with no stale labels", async (t) => {
  const requests = [];
  const docs = [
    {
      _id: 101,
      label: "Rockets & Stars",
      tags: "Rockets",
      alt: "Rockets team background",
      type: "bg_hem_grommets",
      img_key: "assets/libs/rockets-hem.png",
      img_url: "https://cdn.example.test/rockets-hem.png",
      svg_url: "https://cdn.example.test/source/rockets-hem.svg"
    },
    {
      _id: 202,
      label: "Mascot",
      tags: "Mascot",
      alt: "Mascot clip art",
      type: "",
      img_key: "assets/libs/mascot.png",
      img_url: "https://cdn.example.test/mascot.png",
      svg_url: "https://cdn.example.test/source/mascot.svg?download=1"
    }
  ];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method, body: JSON.parse(body) });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ total: docs.length, docs }));
    });
  });
  t.after(() => server.close());

  const apiUrl = await listen(server);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-banner-sync-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const outputPath = path.join(tempDir, "team-banner-assets.shopify.json");
  const reportDir = path.join(tempDir, "report");
  const result = await runScript(DESIGN_TOOL_SCRIPT, {
    args: [outputPath, reportDir],
    env: { TEAM_BANNER_DESIGN_TOOL_API_URL: apiUrl }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].body, {
    collection: "tool_assets",
    filter: {},
    options: { limit: 500, skip: 0 },
    db: "teamsportbanners"
  });

  const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const summary = JSON.parse(fs.readFileSync(path.join(reportDir, "asset-sync-summary.json"), "utf8"));
  const serialized = JSON.stringify({ manifest, summary });

  assert.equal(manifest.source, "Configured team banner asset API");
  assert.equal(summary.source, "Configured team banner asset API");
  assert.equal(manifest.sourceApi, apiUrl);
  assert.equal(manifest.assetCount, docs.length);
  assert.equal(manifest.uncategorizedCount, 1);
  assert.deepEqual(manifest.typeCounts, { bg_hem_grommets: 1, uncategorized_clipart: 1 });
  assert.doesNotMatch(serialized, /teambannersports\.com\/design-tool\/\?m=5|sv\.lct\.vn/i);
  assert.deepEqual(manifest.assets.map((asset) => asset.role), ["background", "clipart"]);
  assert.ok(manifest.assets[0].assetTags.includes("tbd:asset-category:bg-hem-and-grommets"));
  assert.ok(manifest.assets[0].assetTags.includes("tbd:asset-key:rockets-and-stars"));
  assert.ok(manifest.assets[1].assetTags.includes("tbd:asset-source-type:uncategorized_clipart"));
});
