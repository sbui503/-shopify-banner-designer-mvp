import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const REMOTE_TIMEOUT_MS = Number(process.env.ASSET_GUARD_REMOTE_TIMEOUT_MS || 15000);
const CHECK_REMOTE = process.env.ASSET_GUARD_REMOTE !== "0";

const REQUIRED_PUBLIC_FILES = [
  "index.html",
  "team-banner-designer.css",
  "team-banner-designer.js",
  "team-banner-assets.shopify.json",
  "team-banner-products.json",
  "team-banner-layer-maps.json",
  "team-banner-source-svg-map.json",
  "svg-layer-templates.json",
  "team-sport-banners-logo.jpg"
];

const SCAN_FILES = [
  "public/index.html",
  "public/team-banner-designer.css",
  "public/team-banner-designer.js",
  "public/team-banner-assets.shopify.json",
  "public/team-banner-products.json",
  "public/team-banner-layer-maps.json",
  "public/team-banner-source-svg-map.json",
  "public/svg-layer-templates.json"
];

const ASSET_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".png",
  ".svg",
  ".webp"
]);

const IGNORED_PROTOCOLS = [
  "data:",
  "mailto:",
  "tel:",
  "sms:",
  "javascript:"
];

function relPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function stripQuery(value) {
  return String(value || "").split("#")[0].split("?")[0];
}

function hasAssetExtension(value) {
  const pathname = stripQuery(value);
  return ASSET_EXTENSIONS.has(path.extname(pathname).toLowerCase());
}

function isIgnored(value) {
  const lower = String(value || "").trim().toLowerCase();
  return !lower || lower.startsWith("#") || IGNORED_PROTOCOLS.some((protocol) => lower.startsWith(protocol));
}

function isRemote(value) {
  return /^https?:\/\//i.test(value);
}

function gitTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return new Set(output.split("\0").filter(Boolean));
  } catch {
    return null;
  }
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".vercel") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (entry.isFile()) {
      yield relPath(fullPath);
    }
  }
}

function knownFiles() {
  const tracked = gitTrackedFiles();
  if (tracked?.size) return tracked;
  return new Set(walkFiles(ROOT));
}

function normalizePublicPath(rawValue, fromRel) {
  if (isIgnored(rawValue) || isRemote(rawValue)) return "";

  const clean = stripQuery(rawValue).trim();
  if (!hasAssetExtension(clean)) return "";

  const decoded = decodeURIComponent(clean);
  if (decoded.startsWith("/")) return `public${decoded}`;

  const fromDir = fromRel.startsWith("public/")
    ? path.dirname(fromRel)
    : "public";
  return relPath(path.resolve(ROOT, fromDir, decoded));
}

function extractQuotedAssetValues(text) {
  const values = [];
  const attrPattern = /\b(?:src|href|data-[a-z0-9-]*url)=["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  for (const pattern of [attrPattern, cssUrlPattern]) {
    for (const match of text.matchAll(pattern)) {
      values.push(match[1]);
    }
  }

  return values;
}

function extractJsAssetValues(text) {
  const values = [];
  const patterns = [
    /\bfetch\(\s*["']([^"']+)["']/gi,
    /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
    /\b(?:src|href|url|imageUrl|svgUrl|templateSvg|layoutSvgUrl)\s*:\s*["']([^"']+)["']/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      values.push(match[1]);
    }
  }

  return values;
}

function isManifestRuntimeReference(value) {
  const clean = stripQuery(String(value || "").trim());
  if (!hasAssetExtension(clean)) return false;
  return isRemote(clean)
    || clean.startsWith("/")
    || clean.startsWith("./")
    || clean.startsWith("../")
    || /^(?:generated-product-svgs|svg-layer-templates)\//i.test(clean);
}

function extractJsonAssetValues(value, values = []) {
  if (typeof value === "string") {
    if (isManifestRuntimeReference(value)) values.push(value);
    return values;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractJsonAssetValues(item, values);
    return values;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) extractJsonAssetValues(item, values);
  }
  return values;
}

function extractAssetValues(fileRel) {
  const filePath = path.join(ROOT, fileRel);
  const text = fs.readFileSync(filePath, "utf8");
  if (fileRel.endsWith(".json")) {
    return extractJsonAssetValues(JSON.parse(text));
  }
  if (fileRel.endsWith(".js")) {
    return extractJsAssetValues(text);
  }
  return extractQuotedAssetValues(text);
}

function remoteAssetUrls(fileRel, values) {
  if (fileRel !== "public/index.html") return [];
  return values
    .filter((value) => isRemote(value) && hasAssetExtension(value))
    .filter((value) => !/\/api\//i.test(new URL(value).pathname));
}

async function checkRemoteUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal
    });

    if ([403, 405].includes(response.status)) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal
      });
      await response.body?.cancel();
    }

    return response.status >= 200 && response.status < 400
      ? null
      : `${url} returned HTTP ${response.status}`;
  } catch (error) {
    return `${url} failed: ${error.message}`;
  } finally {
    clearTimeout(timer);
  }
}

const files = knownFiles();
const localReferences = new Map();
const remoteReferences = new Map();
const findings = [];

for (const publicFile of REQUIRED_PUBLIC_FILES) {
  const rel = `public/${publicFile}`;
  if (!files.has(rel)) findings.push(`missing required public file: ${rel}`);
}

for (const fileRel of SCAN_FILES) {
  if (!files.has(fileRel)) {
    findings.push(`missing scan input: ${fileRel}`);
    continue;
  }

  const values = extractAssetValues(fileRel);

  for (const value of values) {
    const local = normalizePublicPath(value, fileRel);
    if (local) {
      if (!localReferences.has(local)) localReferences.set(local, new Set());
      localReferences.get(local).add(fileRel);
    }
  }

  for (const url of remoteAssetUrls(fileRel, values)) {
    if (!remoteReferences.has(url)) remoteReferences.set(url, new Set());
    remoteReferences.get(url).add(fileRel);
  }
}

for (const [asset, sources] of localReferences) {
  if (!files.has(asset)) {
    findings.push(`${asset} referenced by ${[...sources].sort().join(", ")}`);
  }
}

if (CHECK_REMOTE) {
  for (const [url, sources] of remoteReferences) {
    const error = await checkRemoteUrl(url);
    if (error) findings.push(`${error}; referenced by ${[...sources].sort().join(", ")}`);
  }
}

if (findings.length) {
  console.error("Public asset integrity guard failed.");
  console.error(findings.slice(0, 200).join("\n"));
  if (findings.length > 200) console.error(`...and ${findings.length - 200} more`);
  process.exit(1);
}

console.log(`Public asset integrity guard passed: ${localReferences.size} local asset references checked.`);
if (CHECK_REMOTE) {
  console.log(`Remote boot asset guard passed: ${remoteReferences.size} remote asset URLs checked.`);
}
