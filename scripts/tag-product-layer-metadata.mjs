import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
const outputDir = process.argv[3] || "outputs/team-banner-product-layer-tags";

if (!input) {
  console.error("Usage: node scripts/tag-product-layer-metadata.mjs <products.csv> [output-dir]");
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

  return rows;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(headers, rows) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] || "")).join(","))
  ].join("\n");
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
}

function inferShape(row) {
  const context = [row.Title, row.Type, row.Tags, row.Handle, row["Product Category"]].join(" ").toLowerCase();
  if (/pole[\s-]?pocket|pole[\s-]?sleeve|sleeve/.test(context)) return "polepocket";
  if (/home[\s-]?plate[\s-]?pennant|plate[\s-]?pennant/.test(context)) return "homeplatepennant";
  if (/home[\s-]?plate|homeplate/.test(context)) return "homeplate";
  if (/triangle|pennant/.test(context)) return "triangle";
  return "banner";
}

function shouldTagProduct(row) {
  const type = String(row.Type || "").toLowerCase();
  if (type === "easify_addon_product") return false;
  if (String(row.Status || "").toLowerCase() === "draft") return false;
  const context = [row.Title, row.Type, row.Tags, row["Product Category"]].join(" ").toLowerCase();
  return /banner|pennant|soccer|baseball|softball/.test(context);
}

function defaultProfile(shape, handle) {
  if (handle === "pokemon-go-soccer-banner") {
    return {
      shape: "banner",
      background: 1,
      teamLogo: 1,
      clipart: 1,
      players: 8,
      playerIcons: 8,
      playerNames: 8,
      headerTexts: 2,
      yearTexts: 0
    };
  }

  if (handle === "all-star-2-triangle-baseball-banners") {
    return {
      shape: "triangle",
      background: 1,
      teamLogo: 1,
      clipart: 1,
      players: 1,
      playerIcons: 0,
      playerNames: 1,
      headerTexts: 0,
      yearTexts: 1
    };
  }

  if (handle === "all-star-02-baseball-banner") {
    return {
      shape: "banner",
      background: 1,
      teamLogo: 1,
      clipart: 1,
      players: 9,
      playerIcons: 9,
      playerNames: 9,
      headerTexts: 2,
      yearTexts: 0
    };
  }

  if (handle === "super-heroes-soccer-banner") {
    return {
      shape: "banner",
      background: 1,
      teamLogo: 1,
      clipart: 1,
      players: 9,
      playerIcons: 9,
      playerNames: 9,
      headerTexts: 2,
      yearTexts: 0
    };
  }

  if (shape === "banner" || shape === "rectangle" || shape === "polepocket") {
    return {
      shape: shape === "polepocket" ? "polepocket" : "banner",
      background: 1,
      teamLogo: 1,
      clipart: 1,
      players: 12,
      playerIcons: 12,
      playerNames: 12,
      headerTexts: 2,
      yearTexts: 0
    };
  }

  return {
    shape,
    background: 1,
    teamLogo: 1,
    clipart: 1,
    players: 1,
    playerIcons: 1,
    playerNames: 1,
    headerTexts: 0,
    yearTexts: 1
  };
}

function teamLogoTitle(row) {
  const title = String(row.Title || row.Handle || "").trim();
  const [teamName] = title.split(/\s+-\s+/);
  return String(teamName || title).replace(/\s+/g, " ").trim();
}

function profileTotals(profile) {
  const textLayers = profile.playerNames + profile.headerTexts + profile.yearTexts;
  const layerCount = profile.background + profile.teamLogo + profile.clipart + profile.playerIcons + textLayers;
  return { textLayers, layerCount };
}

function coachNameCount(profile) {
  return profile.headerTexts > 0 ? 1 : 0;
}

function teamMomNameCount(profile) {
  return profile.headerTexts > 1 ? 1 : 0;
}

function cleanTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !/^tbd:/i.test(tag));
}

function tbdTags(row) {
  const shape = inferShape(row);
  const profile = defaultProfile(shape, row.Handle);
  const totals = profileTotals(profile);
  const logoTitle = teamLogoTitle(row);
  return [
    "tbd:layered",
    `tbd:shape:${profile.shape}`,
    `tbd:layers:${totals.layerCount}`,
    `tbd:background:${profile.background}`,
    "tbd:background-url:product-image",
    `tbd:team-logo:${profile.teamLogo}`,
    `tbd:team-logo-title:${logoTitle}`,
    "tbd:team-logo-url:crop",
    `tbd:clipart:${profile.clipart}`,
    "tbd:clipart-url:crop",
    `tbd:players:${profile.players}`,
    `tbd:player-icons:${profile.playerIcons}`,
    `tbd:player-names:${profile.playerNames}`,
    `tbd:player-texts:${profile.playerNames}`,
    "tbd:player-label:Player",
    `tbd:text-layers:${totals.textLayers}`,
    `tbd:header-texts:${profile.headerTexts}`,
    `tbd:coach-name:${coachNameCount(profile)}`,
    `tbd:team-mom-name:${teamMomNameCount(profile)}`,
    `tbd:year-texts:${profile.yearTexts}`
  ];
}

const source = fs.readFileSync(input, "utf8").replace(/^\uFEFF/, "");
const rows = parseCsv(source);
const headers = rows.shift();
const objects = rows.map((values) => rowObject(headers, values));
const qaRows = [];
const seenHandles = new Set();

for (const row of objects) {
  if (!row.Handle || seenHandles.has(row.Handle)) continue;
  seenHandles.add(row.Handle);
  if (!shouldTagProduct(row)) continue;

  const addedTags = tbdTags(row);
  const existingTags = cleanTags(row.Tags);
  row.Tags = [...existingTags, ...addedTags].join(", ");

  const tagMap = Object.fromEntries(addedTags.map((tag) => {
    const parts = tag.split(":");
    return [parts.slice(0, 2).join(":"), parts.slice(2).join(":") || "1"];
  }));
  qaRows.push({
    Handle: row.Handle,
    Title: row.Title,
    Status: row.Status,
    Shape: tagMap["tbd:shape"],
    "Background URL": row["Image Src"],
    "Background Tag": "tbd:background-url:product-image",
    "Team/Logo Title": teamLogoTitle(row),
    "Team/Logo URL": "crop-from-product-image",
    "Clipart URL": "crop-from-product-image",
    Players: tagMap["tbd:players"],
    "Player Icon Layers": tagMap["tbd:player-icons"],
    "Player Name Layers": tagMap["tbd:player-names"],
    "Player Text Layers": tagMap["tbd:player-texts"],
    "Player Count Match": tagMap["tbd:players"] === tagMap["tbd:player-names"] && tagMap["tbd:player-names"] === tagMap["tbd:player-texts"] ? "yes" : "no",
    "Coach Name Layers": tagMap["tbd:coach-name"],
    "Team Mom Name Layers": tagMap["tbd:team-mom-name"],
    "Text Layers": tagMap["tbd:text-layers"],
    "Total Layers": tagMap["tbd:layers"],
    Tags: addedTags.join(", ")
  });
}

fs.mkdirSync(outputDir, { recursive: true });
const taggedCsvPath = path.join(outputDir, "products_export_1_tbd_layer_tags.csv");
const qaCsvPath = path.join(outputDir, "team-banner-layer-qa.csv");
fs.writeFileSync(taggedCsvPath, writeCsv(headers, objects));
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

console.log(JSON.stringify({
  taggedCsvPath,
  qaCsvPath,
  taggedProducts: qaRows.length
}, null, 2));
