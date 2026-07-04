import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const BLOCKED = [
  ["sv", "lct"].join("."),
  ["lct", "designs"].join("-"),
  ["lct", "store"].join("-"),
  ["teambanner", "sports", "com"].join(".")
];
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "outputs",
  ".vercel",
  ".next"
]);
const SKIP_FILES = new Set([
  "package-lock.json",
  "yarn.lock"
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".liquid",
  ".md",
  ".mjs",
  ".py",
  ".svg",
  ".toml",
  ".txt",
  ".yml",
  ".yaml"
]);

function isTextFile(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") {
      if (SKIP_DIRS.has(entry.name)) continue;
    }
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(ROOT, fullPath);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(fullPath);
    } else if (entry.isFile() && isTextFile(entry.name) && !SKIP_FILES.has(entry.name)) {
      yield rel;
    }
  }
}

const findings = [];
for (const rel of walk(ROOT)) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    for (const blocked of BLOCKED) {
      if (lower.includes(blocked)) {
        findings.push(`${rel}:${index + 1}: ${blocked}`);
      }
    }
  });
}

if (findings.length) {
  console.error("Legacy Team Banner domain references are blocked.");
  console.error(findings.slice(0, 200).join("\n"));
  if (findings.length > 200) console.error(`...and ${findings.length - 200} more`);
  process.exit(1);
}

console.log("Legacy Team Banner domain guard passed.");
