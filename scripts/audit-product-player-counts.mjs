import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const input = process.argv[2] || "/Users/si/Downloads/products_export_1_tbd_layer_tags_alt_text_team_logo_title.csv";
const outputDir = process.argv[3] || "outputs/product-player-count-audit-20260521";
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ocrBinary = path.resolve(outputDir, "ocr-player-count");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(headers, rows) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readTag(tags, key) {
  const prefix = `${key}:`.toLowerCase();
  const match = String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .find((tag) => tag.toLowerCase().startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function readTagNumber(tags, key, fallback = 0) {
  const value = Number(readTag(tags, key));
  return Number.isFinite(value) ? value : fallback;
}

function setTag(tags, key, value) {
  const prefix = `${key}:`.toLowerCase();
  const nextTag = `${key}:${value}`;
  let replaced = false;
  const next = String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => {
      if (tag.toLowerCase().startsWith(prefix)) {
        replaced = true;
        return nextTag;
      }
      return tag;
    });
  if (!replaced) next.push(nextTag);
  return next.join(", ");
}

function recalcTags(tags) {
  const background = readTagNumber(tags, "tbd:background", 1);
  const teamLogo = readTagNumber(tags, "tbd:team-logo", 1);
  const clipart = readTagNumber(tags, "tbd:clipart", 1);
  const playerIcons = readTagNumber(tags, "tbd:player-icons", 0);
  const playerNames = readTagNumber(tags, "tbd:player-names", 0);
  const headerTexts = readTagNumber(tags, "tbd:header-texts", 0);
  const yearTexts = readTagNumber(tags, "tbd:year-texts", 0);
  const textLayers = playerNames + headerTexts + yearTexts;
  const layers = background + teamLogo + clipart + playerIcons + textLayers;
  let next = tags;
  next = setTag(next, "tbd:text-layers", textLayers);
  next = setTag(next, "tbd:layers", layers);
  return next;
}

function imageExt(url) {
  const clean = String(url || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return ".jpg";
  if (clean.endsWith(".webp")) return ".webp";
  if (clean.endsWith(".gif")) return ".gif";
  return ".png";
}

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return true;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, bytes);
  return true;
}

function compileOcr() {
  fs.mkdirSync(outputDir, { recursive: true });
  if (fs.existsSync(ocrBinary)) return;
  const source = path.join(__dirname, "ocr-player-count.swift");
  const result = spawnSync("swiftc", [source, "-o", ocrBinary], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "swiftc failed");
  }
}

function runOcr(files) {
  if (!files.length) return [];
  const result = spawnSync(ocrBinary, files, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "OCR failed");
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function confidenceSummary(result) {
  const playerTexts = result.texts.filter((item) => /player|p1ayer|piayer/i.test(item.text));
  const confidence = playerTexts.length
    ? Math.min(...playerTexts.map((item) => Number(item.confidence || 0)))
    : 0;
  return {
    detectedTextCount: result.texts.length,
    playerTextDetections: playerTexts.length,
    minPlayerConfidence: confidence
  };
}

function editDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function isPlayerLikeToken(token) {
  const clean = String(token || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/1/g, "l")
    .replace(/0/g, "o");
  if (!clean) return false;
  if (clean.includes("player")) return true;
  if (clean.length < 4 || clean.length > 9) return false;
  if (!clean.startsWith("p")) return false;
  if (/^pla(y|v|l)?e?r?s?$/.test(clean)) return true;
  if (/^pla/.test(clean) && editDistance(clean, "player") <= 3) return true;
  if (/^p[li]a/.test(clean) && editDistance(clean, "player") <= 3) return true;
  return false;
}

function countPlayerLikeText(texts) {
  let count = 0;
  for (const item of texts) {
    const raw = String(item.text || "");
    const direct = raw.match(/player/gi);
    if (direct) {
      count += direct.length;
      continue;
    }
    const tokens = raw.split(/[\s|,;:()[\]{}<>/\\]+/).filter(Boolean);
    count += tokens.filter(isPlayerLikeToken).length;
  }
  return count;
}

const source = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(source).filter((row) => row.some((field) => field.trim()));
const headers = rows.shift();
const objects = rows.map((values) => rowObject(headers, values));
const byHandle = new Map();

for (const row of objects) {
  if (!row.Handle || byHandle.has(row.Handle)) continue;
  if (!/tbd:layered/i.test(row.Tags || "")) continue;
  if (!row["Image Src"]) continue;
  byHandle.set(row.Handle, row);
}

const products = [...byHandle.values()].slice(0, limit > 0 ? limit : undefined);
const imageDir = path.join(outputDir, "images");
fs.mkdirSync(imageDir, { recursive: true });
compileOcr();

const auditRows = [];
const files = [];
const productForFile = new Map();

let downloaded = 0;
for (const product of products) {
  const file = path.join(imageDir, `${slug(product.Handle)}${imageExt(product["Image Src"])}`);
  try {
    await download(product["Image Src"], file);
    files.push(file);
    productForFile.set(file, product);
    downloaded += 1;
  } catch (error) {
    auditRows.push({
      Handle: product.Handle,
      Title: product.Title,
      "Image Src": product["Image Src"],
      Shape: readTag(product.Tags, "tbd:shape"),
      "Tagged Player Names": readTagNumber(product.Tags, "tbd:player-names", 0),
      "OCR Player Names": "",
      Status: "download-error",
      "Suggested Player Names": "",
      "Min Player Confidence": "",
      "OCR Texts": String(error.message || error)
    });
  }
  if (downloaded % 100 === 0) {
    console.log(`downloaded ${downloaded}/${products.length}`);
  }
}

let ocrDone = 0;
const batchSize = 25;
for (let index = 0; index < files.length; index += batchSize) {
  const batch = files.slice(index, index + batchSize);
  const results = runOcr(batch);
  for (const result of results) {
    const product = productForFile.get(result.path);
    const tagged = readTagNumber(product.Tags, "tbd:player-names", 0);
    const summary = confidenceSummary(result);
    const ocrCount = countPlayerLikeText(result.texts);
    const status = ocrCount === tagged ? "match" : "mismatch";
    auditRows.push({
      Handle: product.Handle,
      Title: product.Title,
      "Image Src": product["Image Src"],
      Shape: readTag(product.Tags, "tbd:shape"),
      "Tagged Player Names": tagged,
      "OCR Player Names": ocrCount,
      Status: status,
      "Suggested Player Names": ocrCount,
      "Min Player Confidence": summary.minPlayerConfidence ? summary.minPlayerConfidence.toFixed(3) : "",
      "OCR Texts": result.texts.map((item) => item.text).join(" | ")
    });
  }
  ocrDone += batch.length;
  console.log(`ocr ${Math.min(ocrDone, files.length)}/${files.length}`);
}

auditRows.sort((a, b) => String(a.Handle).localeCompare(String(b.Handle)));

const auditPath = path.join(outputDir, limit > 0 ? "sample-player-count-audit.csv" : "player-count-audit.csv");
fs.writeFileSync(auditPath, writeCsv([
  "Handle",
  "Title",
  "Image Src",
  "Shape",
  "Tagged Player Names",
  "OCR Player Names",
  "Status",
  "Suggested Player Names",
  "Min Player Confidence",
  "OCR Texts"
], auditRows));

const mismatches = auditRows.filter((row) => row.Status === "mismatch");
const summary = {
  input,
  outputDir,
  products: products.length,
  downloaded: files.length,
  matches: auditRows.filter((row) => row.Status === "match").length,
  mismatches: mismatches.length,
  downloadErrors: auditRows.filter((row) => row.Status === "download-error").length,
  auditPath
};

fs.writeFileSync(path.join(outputDir, limit > 0 ? "sample-summary.json" : "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
