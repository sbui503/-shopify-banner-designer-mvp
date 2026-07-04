import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const SCRIPT_PATH = path.join(ROOT_DIR, "scripts", "sync-teambannersports-design-db-svgs.mjs");

function envWithoutDesignDbApiUrl() {
  const env = { ...process.env };
  delete env.TEAM_BANNER_DESIGN_DB_API_URL;
  return env;
}

function runSyncScript(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT_PATH, "--no-download"], {
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

test("design DB SVG sync fails closed when the API URL is not configured", async () => {
  const result = await runSyncScript(envWithoutDesignDbApiUrl());

  assert.notEqual(result.code, 0);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /TEAM_BANNER_DESIGN_DB_API_URL is required; the legacy design DB endpoint is intentionally disabled/
  );
  assert.doesNotMatch(result.stderr, /https:\/\/sv\.lct\.vn\/crud\/find/);
});
