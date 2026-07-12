import fs from "node:fs";
import path from "node:path";

const SVG_DIR = "public/svg-layer-templates";
const MANIFEST_PATH = "public/svg-layer-templates.json";
const DEFAULT_SOURCES = [
  "https://teambannersports.com/team-banner/little-knights-soccer-banner-12874",
  "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs/1660095824436.svg"
];
const ADMIN_DESIGN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";

const sources = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_SOURCES;

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function slugText(value) {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fileNameFromSvgUrl(url) {
  const clean = String(url || "").split("?")[0].split("#")[0];
  return clean.split("/").pop() || "";
}

function extractSvgUrls(textOrUrl) {
  const urls = new Set();
  const raw = String(textOrUrl || "");
  if (/^https?:\/\/.+\.svg(?:[?#].*)?$/i.test(raw)) urls.add(raw);
  const fullPattern = /https:\/\/lct-designs\.s3\.us-west-1\.amazonaws\.com\/admin-designs\/([0-9]+)\.(?:svg|png)/gi;
  for (const match of raw.matchAll(fullPattern)) urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  const encodedPattern = /https%3A%2F%2Flct-designs\.s3\.us-west-1\.amazonaws\.com%2Fadmin-designs%2F([0-9]+)\.(?:svg|png)/gi;
  for (const match of raw.matchAll(encodedPattern)) urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  const relativePattern = /admin-designs\/([0-9]+)\.(?:svg|png)/gi;
  for (const match of raw.matchAll(relativePattern)) {
    urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  }
  return [...urls];
}

function rememberDiscoveredTemplate(discovered, hintsByFile, url, hint) {
  discovered.add(url);
  const file = fileNameFromSvgUrl(url);
  if (!file) return;
  const previous = hintsByFile.get(file) || {};
  hintsByFile.set(file, {
    ...previous,
    ...hint,
    page: previous.page || hint.page || "",
    source: previous.source || hint.source || "",
    svgUrl: url
  });
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

function parseDataInfo(svg) {
  const raw = (svg.match(/\bdata-info=["']([^"']+)["']/i) || [])[1] || "";
  if (!raw) return {};
  try {
    return JSON.parse(decodeHtml(raw));
  } catch {
    return {};
  }
}

function mapType(type) {
  const value = String(type || "").toLowerCase();
  if (/pole/.test(value)) return "polepocket";
  if (/home/.test(value) || /plate/.test(value)) return "homeplatepennant";
  if (/triangle|pennant/.test(value)) return "triangle";
  return "rectangle";
}

function inferSport(text) {
  const value = slugText(text);
  if (/\bbaseball\b/.test(value)) return "baseball";
  if (/\bsoftball\b/.test(value) || /\bsofball\b/.test(value)) return "softball";
  if (/\bsoccer\b/.test(value)) return "soccer";
  return "";
}

function templateTitle(file, info, svg) {
  const imageHrefs = [...svg.matchAll(/<image\b[^>]*(?:xlink:href|href)=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const best = imageHrefs[0] || info.cover?.url || file;
  const base = best.split("?")[0].split("/").pop().replace(/\.[a-z0-9]+$/i, "");
  return compact(base
    .replace(/[-_]+1[0-9]{9,}$/g, "")
    .replace(/[-_]+(?:background|banner|bg|hem|pole|pocket|triangle|home|plate|softball|baseball|soccer|acc|accessory|libs|assets)\b/gi, " ")
    .replace(/[-_]+/g, " "))
    || file.replace(/\.svg$/i, "");
}

function readTemplateMeta(file, hintsByFile = new Map()) {
  const fullPath = path.join(SVG_DIR, file);
  const svg = fs.readFileSync(fullPath, "utf8");
  const info = parseDataInfo(svg);
  const hint = hintsByFile.get(file) || {};
  const imageTags = [...svg.matchAll(/<image\b[^>]*>/gi)].map((match) => match[0]);
  const textContents = [...svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)]
    .map((match) => compact(match[0].replace(/<[^>]+>/g, " ")));
  const playerCount = textContents.filter((text) => /^player$/i.test(text)).length;
  const hrefs = imageTags
    .map((tag) => (tag.match(/\b(?:xlink:href|href)=["']([^"']+)["']/i) || [])[1] || "")
    .filter(Boolean);
  const hrefCounts = hrefs.reduce((map, href) => {
    map.set(href, (map.get(href) || 0) + 1);
    return map;
  }, new Map());
  const repeated = [...hrefCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const searchable = [
    file,
    info.type,
    info.name,
    info.information,
    info.back?.url,
    info.mask?.url,
    info.cover?.url,
    hint.source || "",
    hint.page || "",
    ...hrefs,
    ...textContents
  ].join(" ");

  return {
    name: file.replace(/\.svg$/i, ""),
    title: templateTitle(file, info, svg),
    url: `/svg-layer-templates/${file}`,
    sourceUrl: hint.svgUrl || `https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs/${file}`,
    sourcePage: hint.page || "",
    type: mapType(searchable),
    sport: inferSport(searchable),
    playerCount,
    imageCount: imageTags.length,
    textCount: textContents.length,
    backgroundUrl: hrefs[0] || "",
    playerIconUrl: repeated[1] > 1 ? repeated[0] : "",
    playerIconCount: repeated[1] > 1 ? repeated[1] : 0
  };
}

async function main() {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  const discovered = new Set();
  const hintsByFile = new Map();

  for (const source of sources) {
    try {
      const body = await fetchText(source);
      [...extractSvgUrls(source), ...extractSvgUrls(body)].forEach((url) => {
        rememberDiscoveredTemplate(discovered, hintsByFile, url, {
          page: /\.svg(?:[?#].*)?$/i.test(source) ? "" : source,
          source,
          svgUrl: url
        });
      });
    } catch (error) {
      extractSvgUrls(source).forEach((url) => {
        rememberDiscoveredTemplate(discovered, hintsByFile, url, {
          page: /\.svg(?:[?#].*)?$/i.test(source) ? "" : source,
          source,
          svgUrl: url
        });
      });
      console.warn(`Could not inspect ${source}: ${error.message}`);
    }
  }

  const downloaded = [];
  for (const url of discovered) {
    const file = fileNameFromSvgUrl(url);
    if (!file || !/\.svg$/i.test(file)) continue;
    const svg = await fetchText(url);
    fs.writeFileSync(path.join(SVG_DIR, file), svg);
    downloaded.push(file);
  }

  const templates = fs.readdirSync(SVG_DIR)
    .filter((file) => /\.svg$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => readTemplateMeta(file, hintsByFile));

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ templates }, null, 2) + "\n");

  const complete = templates.filter((template) => template.playerCount && template.backgroundUrl && template.playerIconUrl).length;
  console.log(JSON.stringify({
    inspectedSources: sources.length,
    discoveredSvgUrls: discovered.size,
    downloaded,
    templateCount: templates.length,
    templatesWithPlayerIcons: complete,
    manifest: MANIFEST_PATH
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
