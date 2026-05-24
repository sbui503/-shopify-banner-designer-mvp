import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const [,, inputPath, publicBaseUrl = "https://cdn.example.com/team-banner-assets/"] = process.argv;

if (!inputPath) {
  console.error("Usage: node scripts/zip-list-to-manifest.mjs zip-file-list.txt https://cdn.example.com/assets/");
  process.exit(1);
}

function categoryFor(filename) {
  const normalized = filename.toLowerCase();
  if (normalized.includes("-bg-triangle")) return "BG Triangle";
  if (normalized.includes("-bg-homeplate")) return "BG Home Plate";
  if (normalized.includes("-bg-hem")) return "BG Hem & Grommets";
  if (normalized.includes("-bg-banner")) return "BG Pole Pocket";
  if (normalized.includes("-team-name")) return "Team name";
  if (normalized.includes("-clipart")) return "Clip art";
  if (normalized.includes("-accessory")) return "Accessory";
  return "Other";
}

function titleFor(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/^imgi_\d+_/, "")
    .replace(/-\d{10,}.*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function publicUrlFor(filename) {
  const cleanName = encodeURIComponent(path.basename(filename));
  return new URL(cleanName, publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`).toString();
}

const assets = [];
const rl = readline.createInterface({
  input: fs.createReadStream(inputPath, "utf8"),
  crlfDelay: Infinity
});

for await (const line of rl) {
  if (!line || line.startsWith("__MACOSX/")) continue;
  if (!/\.(png|svg)$/i.test(line)) continue;
  assets.push({
    name: titleFor(line),
    category: categoryFor(line),
    url: publicUrlFor(line)
  });
}

process.stdout.write(`${JSON.stringify({ assets }, null, 2)}\n`);
