import fs from "node:fs";
import path from "node:path";

const inputCsv = process.argv[2];
const auditCsv = process.argv[3];
const outputDir = process.argv[4] || "outputs/product-player-count-audit-20260521-corrected";

if (!inputCsv || !auditCsv) {
  console.error("Usage: node scripts/apply-player-count-audit.mjs <products.csv> <player-count-audit.csv> [output-dir]");
  process.exit(1);
}

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

  return rows.filter((csvRow) => csvRow.some((cell) => String(cell || "").trim()));
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

function recalcLayerTags(tags) {
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

function ensureHeaderIdentityTags(tags) {
  const headerTexts = readTagNumber(tags, "tbd:header-texts", 0);
  let next = tags;
  next = setTag(next, "tbd:coach-name", headerTexts > 0 ? 1 : 0);
  next = setTag(next, "tbd:team-mom-name", headerTexts > 1 ? 1 : 0);
  return next;
}

function ensurePlayerIdentityTags(tags) {
  const playerNames = readTagNumber(tags, "tbd:player-names", readTagNumber(tags, "tbd:players", 0));
  let next = tags;
  next = setTag(next, "tbd:player-texts", playerNames);
  next = setTag(next, "tbd:player-label", "Player");
  return next;
}

function numberCell(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isSafePlayerCountCorrection(auditRow) {
  const shape = String(auditRow.Shape || "").toLowerCase();
  const status = String(auditRow.Status || "").toLowerCase();
  const tagged = numberCell(auditRow["Tagged Player Names"]);
  const ocr = numberCell(auditRow["OCR Player Names"]);

  if (status !== "mismatch") return false;
  if (shape !== "banner") return false;
  if (tagged == null || ocr == null) return false;
  if (ocr === tagged) return false;

  // Keep OCR outliers in the review queue. Most real rectangular templates on
  // this site are 7-14 player-name layouts; lower/higher counts were often OCR
  // misses, duplicates, or stylized text that needs eyes on it.
  return ocr >= 7 && ocr <= 14;
}

function teamLogoTitle(row) {
  const title = String(row.Title || row.Handle || "").trim();
  const [teamName] = title.split(/\s+-\s+/);
  return String(teamName || title).replace(/\s+/g, " ").trim();
}

function buildQaRow(row) {
  const tags = row.Tags || "";
  return {
    Handle: row.Handle,
    Title: row.Title,
    Status: row.Status,
    Shape: readTag(tags, "tbd:shape"),
    "Background URL": row["Image Src"],
    "Background Tag": readTag(tags, "tbd:background-url") || "product-image",
    "Team/Logo Title": readTag(tags, "tbd:team-logo-title") || teamLogoTitle(row),
    "Team/Logo URL": readTag(tags, "tbd:team-logo-url") || "crop-from-product-image",
    "Clipart URL": readTag(tags, "tbd:clipart-url") || "crop-from-product-image",
    Players: readTag(tags, "tbd:players"),
    "Player Icon Layers": readTag(tags, "tbd:player-icons"),
    "Player Name Layers": readTag(tags, "tbd:player-names"),
    "Player Text Layers": readTag(tags, "tbd:player-texts"),
    "Player Count Match": readTag(tags, "tbd:players") === readTag(tags, "tbd:player-names") && readTag(tags, "tbd:player-names") === readTag(tags, "tbd:player-texts") ? "yes" : "no",
    "Coach Name Layers": readTag(tags, "tbd:coach-name"),
    "Team Mom Name Layers": readTag(tags, "tbd:team-mom-name"),
    "Text Layers": readTag(tags, "tbd:text-layers"),
    "Total Layers": readTag(tags, "tbd:layers"),
    Tags: tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => /^tbd:/i.test(tag))
      .join(", ")
  };
}

const productRows = parseCsv(fs.readFileSync(inputCsv, "utf8").replace(/^\uFEFF/, ""));
const productHeaders = productRows.shift();
const products = productRows.map((values) => rowObject(productHeaders, values));

const auditRows = parseCsv(fs.readFileSync(auditCsv, "utf8").replace(/^\uFEFF/, ""));
const auditHeaders = auditRows.shift();
const auditByHandle = new Map(
  auditRows.map((values) => {
    const row = rowObject(auditHeaders, values);
    return [row.Handle, row];
  })
);

const corrections = [];
const reviewRows = [];
const seenHandles = new Set();

for (const row of products) {
  if (!row.Handle || seenHandles.has(row.Handle)) continue;
  seenHandles.add(row.Handle);
  if (!/tbd:layered/i.test(row.Tags || "")) continue;
  row.Tags = ensureHeaderIdentityTags(row.Tags);
  row.Tags = ensurePlayerIdentityTags(row.Tags);

  const audit = auditByHandle.get(row.Handle);
  if (!audit) {
    reviewRows.push({
      Handle: row.Handle,
      Title: row.Title,
      Shape: readTag(row.Tags, "tbd:shape"),
      "Tagged Player Names": readTag(row.Tags, "tbd:player-names"),
      "OCR Player Names": "",
      Reason: "missing-audit-row",
      "Image Src": row["Image Src"],
      "OCR Texts": ""
    });
    continue;
  }

  if (isSafePlayerCountCorrection(audit)) {
    const before = readTagNumber(row.Tags, "tbd:player-names", 0);
    const after = Number(audit["OCR Player Names"]);
    row.Tags = setTag(row.Tags, "tbd:players", after);
    row.Tags = setTag(row.Tags, "tbd:player-icons", after);
    row.Tags = setTag(row.Tags, "tbd:player-names", after);
    row.Tags = setTag(row.Tags, "tbd:player-texts", after);
    row.Tags = recalcLayerTags(row.Tags);
    row.Tags = ensurePlayerIdentityTags(row.Tags);
    corrections.push({
      Handle: row.Handle,
      Title: row.Title,
      Shape: audit.Shape,
      "Before Player Names": before,
      "After Player Names": after,
      "Before Total Layers": Number(audit["Tagged Player Names"]) * 2 + readTagNumber(row.Tags, "tbd:background", 1) + readTagNumber(row.Tags, "tbd:team-logo", 1) + readTagNumber(row.Tags, "tbd:clipart", 1) + readTagNumber(row.Tags, "tbd:header-texts", 0) + readTagNumber(row.Tags, "tbd:year-texts", 0),
      "After Total Layers": readTag(row.Tags, "tbd:layers"),
      "Image Src": row["Image Src"],
      "OCR Texts": audit["OCR Texts"]
    });
  } else if (String(audit.Status || "").toLowerCase() === "mismatch") {
    reviewRows.push({
      Handle: row.Handle,
      Title: row.Title,
      Shape: audit.Shape,
      "Tagged Player Names": audit["Tagged Player Names"],
      "OCR Player Names": audit["OCR Player Names"],
      Reason: "manual-review-needed",
      "Image Src": row["Image Src"],
      "OCR Texts": audit["OCR Texts"]
    });
  }
}

const qaRows = [];
const qaSeen = new Set();
for (const row of products) {
  if (!row.Handle || qaSeen.has(row.Handle)) continue;
  qaSeen.add(row.Handle);
  if (!/tbd:layered/i.test(row.Tags || "")) continue;
  qaRows.push(buildQaRow(row));
}

fs.mkdirSync(outputDir, { recursive: true });
const correctedCsvPath = path.join(outputDir, "products_export_1_tbd_layer_tags_alt_text_team_logo_title_audited_player_counts.csv");
const qaCsvPath = path.join(outputDir, "team-banner-layer-qa-team-logo-title-audited.csv");
const correctionsPath = path.join(outputDir, "player-count-corrections-applied.csv");
const reviewPath = path.join(outputDir, "player-count-needs-manual-review.csv");
const summaryPath = path.join(outputDir, "player-count-correction-summary.json");

fs.writeFileSync(correctedCsvPath, writeCsv(productHeaders, products));
fs.writeFileSync(qaCsvPath, writeCsv([
  "Handle",
  "Title",
  "Status",
  "Shape",
  "Background URL",
  "Background Tag",
  "Team/Logo Title",
  "Team/Logo URL",
  "Clipart URL",
  "Players",
  "Player Icon Layers",
  "Player Name Layers",
  "Player Text Layers",
  "Player Count Match",
  "Coach Name Layers",
  "Team Mom Name Layers",
  "Text Layers",
  "Total Layers",
  "Tags"
], qaRows));
fs.writeFileSync(correctionsPath, writeCsv([
  "Handle",
  "Title",
  "Shape",
  "Before Player Names",
  "After Player Names",
  "Before Total Layers",
  "After Total Layers",
  "Image Src",
  "OCR Texts"
], corrections));
fs.writeFileSync(reviewPath, writeCsv([
  "Handle",
  "Title",
  "Shape",
  "Tagged Player Names",
  "OCR Player Names",
  "Reason",
  "Image Src",
  "OCR Texts"
], reviewRows));

const summary = {
  inputCsv,
  auditCsv,
  correctedCsvPath,
  qaCsvPath,
  correctionsPath,
  reviewPath,
  auditedProducts: auditByHandle.size,
  taggedProducts: qaRows.length,
  safeCorrectionsApplied: corrections.length,
  needsManualReview: reviewRows.length,
  matchedOrUnchanged: qaRows.length - corrections.length - reviewRows.length
};

fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
