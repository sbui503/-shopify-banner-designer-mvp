import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD_SCRIPT = path.join(ROOT, "scripts", "guard-legacy-domains.mjs");

async function runGuard() {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [GUARD_SCRIPT], {
      cwd: ROOT,
      maxBuffer: 1024 * 1024
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout || "",
      stderr: error.stderr || ""
    };
  }
}

async function writeFixture(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test("legacy domain guard fails when a retired asset host is introduced", async () => {
  const fixtureDir = path.join(ROOT, "tmp", "legacy-domain-guard-fail");
  const fixtureFile = path.join(fixtureDir, "fixture.txt");
  const blockedNeedle = ["lct", "designs"].join("-");

  await rm(fixtureDir, { recursive: true, force: true });
  await writeFixture(fixtureFile, `asset_url=https://${blockedNeedle}.example/banner.svg\n`);

  try {
    const result = await runGuard();

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Legacy Team Banner domain references are blocked\./);
    assert.ok(result.stderr.includes("tmp/legacy-domain-guard-fail/fixture.txt:1"));
    assert.ok(result.stderr.includes(blockedNeedle));
  } finally {
    await rm(fixtureDir, { recursive: true, force: true });
  }
});

test("legacy domain guard ignores generated directories and lockfiles", async () => {
  const blockedNeedle = ["sv", "lct"].join(".");
  const generatedFixtures = [
    path.join(ROOT, "outputs", "legacy-domain-guard", "ignored.txt"),
    path.join(ROOT, ".next", "legacy-domain-guard", "ignored.json"),
    path.join(ROOT, ".vercel", "legacy-domain-guard", "ignored.md"),
    path.join(ROOT, "node_modules", "legacy-domain-guard", "ignored.js"),
    path.join(ROOT, "package-lock.json")
  ];

  await Promise.all(generatedFixtures.map((fixture) => (
    writeFixture(fixture, `ignored=https://${blockedNeedle}/asset.png\n`)
  )));

  try {
    const result = await runGuard();

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Legacy Team Banner domain guard passed\./);
    assert.equal(result.stderr, "");
  } finally {
    await Promise.all([
      rm(path.join(ROOT, "outputs", "legacy-domain-guard"), { recursive: true, force: true }),
      rm(path.join(ROOT, ".next", "legacy-domain-guard"), { recursive: true, force: true }),
      rm(path.join(ROOT, ".vercel", "legacy-domain-guard"), { recursive: true, force: true }),
      rm(path.join(ROOT, "node_modules", "legacy-domain-guard"), { recursive: true, force: true }),
      rm(path.join(ROOT, "package-lock.json"), { force: true })
    ]);
  }
});
