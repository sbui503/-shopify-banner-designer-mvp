import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "sync-design-tool-assets.mjs");

function childEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.TEAM_BANNER_DESIGN_TOOL_API_URL;
  if (overrides.TEAM_BANNER_DESIGN_TOOL_API_URL) {
    env.TEAM_BANNER_DESIGN_TOOL_API_URL = overrides.TEAM_BANNER_DESIGN_TOOL_API_URL;
  }
  return env;
}

function runSyncScript({ outputPath, reportDir, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, outputPath, reportDir], {
      cwd: ROOT_DIR,
      env
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

function createTempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-design-tool-assets-"));
  return {
    dir,
    outputPath: path.join(dir, "assets.json"),
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
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: JSON.parse(body)
    });

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      total: 1,
      docs: [
        {
          _id: "asset-1",
          label: "Béisbol & Softball",
          type: "teamname",
          img_url: "https://cdn.example.com/team-name.png",
          svg_url: "https://cdn.example.com/svg/team-name.svg?version=1"
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
        requests,
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

test("sync-design-tool-assets fails closed when the API URL is not configured", async () => {
  const { outputPath, reportDir } = createTempPaths();

  const result = await runSyncScript({
    outputPath,
    reportDir,
    env: childEnv()
  });

  assert.notEqual(result.code, 0);
  assert.match(
    result.stderr,
    /TEAM_BANNER_DESIGN_TOOL_API_URL is required; the legacy design tool endpoint is intentionally disabled/
  );
  assert.equal(fs.existsSync(outputPath), false);
  assert.equal(fs.existsSync(reportDir), false);
});

test("sync-design-tool-assets sends requests to the configured API URL", async () => {
  const api = await startAssetApi();
  const { outputPath, reportDir } = createTempPaths();

  try {
    const result = await runSyncScript({
      outputPath,
      reportDir,
      env: childEnv({ TEAM_BANNER_DESIGN_TOOL_API_URL: api.url })
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(api.requests.length, 1);
    assert.equal(api.requests[0].method, "POST");
    assert.equal(api.requests[0].url, "/crud/find");
    assert.deepEqual(api.requests[0].body, {
      collection: "tool_assets",
      filter: {},
      options: { limit: 500, skip: 0 },
      db: "teamsportbanners"
    });

    const manifest = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    assert.equal(manifest.sourceApi, api.url);
    assert.equal(manifest.assetCount, 1);
    assert.equal(manifest.assets[0].name, "Béisbol & Softball");
    assert.equal(manifest.assets[0].category, "Team name");
    assert.equal(manifest.assets[0].role, "team-name-logo");
    assert.ok(fs.existsSync(path.join(reportDir, "asset-sync-summary.json")));
  } finally {
    await api.close();
  }
});
