import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SVG_DIR = path.join(ROOT, "public", "svg-layer-templates");
const MANIFEST_FILE = path.join(ROOT, "public", "svg-layer-templates.json");
const OUTPUT_DIR = path.join(ROOT, "outputs", `true-source-svg-discovery-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`);
const CRUD_URL = "https://sv.lct.vn/crud/find";
const DB = "teambannersports_com";
const COLLECTION = "designs";
const ADMIN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const shouldDownload = !args.has("--no-download");

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value) {
  return compact(String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " "));
}

function inferSport(value) {
  const text = cleanText(value);
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoftball\b/.test(text) || /\bsofball\b/.test(text)) return "softball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  return "";
}

function mapType(value) {
  const text = cleanText(value);
  if (/\bpole\b|\bpocket\b/.test(text)) return "polepocket";
  if (/\bhome\b|\bplate\b/.test(text)) return "homeplatepennant";
  if (/\btriangle\b|\bpennant\b/.test(text)) return "triangle";
  return "rectangle";
}

function inferType(value) {
  const text = cleanText(value);
  if (/\bpole\b|\bpocket\b/.test(text)) return "polepocket";
  if (/\bhome\b|\bplate\b|\bhomeplate\b/.test(text)) return "homeplatepennant";
  if (/\btriangle\b|\bpennant\b/.test(text)) return "triangle";
  if (/\bbanner\b|\bhem\b|\bgrommet\b|\brectangle\b/.test(text)) return "rectangle";
  return "";
}

function attrs(tag) {
  const out = {};
  for (const match of String(tag || "").matchAll(/([:@a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return out;
}

function safeNumber(value, fallback = 0) {
  const next = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(next) ? next : fallback;
}

function parseMatrix(transform = "") {
  const match = String(transform || "").match(/matrix\(([^)]+)\)/i);
  if (!match) return [1, 0, 0, 1, 0, 0];
  const values = match[1].split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return values.length === 6 ? values : [1, 0, 0, 1, 0, 0];
}

function transformedArea(matrix, width, height) {
  const [a, b, c, d] = matrix;
  const scale = Math.abs(a * d - b * c) || Math.max(Math.abs(a), Math.abs(d), 1);
  return Math.abs(width * height * scale);
}

function textRole(text) {
  const value = compact(text);
  if (/^player$/i.test(value)) return "player";
  if (/^year$/i.test(value)) return "year";
  return "header";
}

function parseDataInfo(svg) {
  const raw = (String(svg || "").match(/\bdata-info=["']([^"']+)["']/i) || [])[1] || "";
  if (!raw) return {};
  try {
    return JSON.parse(decodeHtml(raw));
  } catch {
    return {};
  }
}

function analyzeTemplateSvg(svg) {
  const images = [...String(svg || "").matchAll(/<image\b[^>]*>/gi)].map((match, index) => {
    const attr = attrs(match[0]);
    const href = attr.href || attr["xlink:href"] || "";
    const width = safeNumber(attr.width, 1);
    const height = safeNumber(attr.height, 1);
    const matrix = parseMatrix(attr.transform || "");
    return {
      index,
      href,
      className: String(attr.class || "").toLowerCase(),
      width,
      height,
      area: transformedArea(matrix, width, height),
      ratio: width / Math.max(1, height),
      role: "svg-layer"
    };
  });

  const background = images.find((entry) => /background|locked/.test(entry.className))
    || images.slice().sort((a, b) => b.area - a.area)[0]
    || images[0]
    || null;
  if (background) background.role = "background";

  const texts = [...String(svg || "").matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)]
    .map((match) => compact(decodeHtml(match[0].replace(/<[^>]+>/g, " "))))
    .filter(Boolean);
  const vectorBackground = !images.length && /<(path|rect|polygon|polyline|circle|ellipse)\b/i.test(String(svg || ""));
  const playerTextCount = texts.filter((text) => textRole(text) === "player").length;
  const yearTextCount = texts.filter((text) => textRole(text) === "year").length;
  const headerTextCount = texts.filter((text) => textRole(text) === "header").length;

  const hrefCounts = images.reduce((map, entry) => {
    if (entry.href) map.set(entry.href, (map.get(entry.href) || 0) + 1);
    return map;
  }, new Map());
  const repeated = [...hrefCounts.entries()]
    .filter(([href, count]) => count > 1 && (!background || href !== background.href))
    .sort((a, b) => b[1] - a[1])[0];
  if (repeated) {
    images.filter((entry) => entry.href === repeated[0] && entry !== background)
      .forEach((entry) => { entry.role = "playerIcon"; });
  }

  const artEntries = images
    .filter((entry) => entry.role === "svg-layer" && entry !== background)
    .sort((a, b) => b.area - a.area);
  const teamCandidate = artEntries
    .filter((entry) => entry.ratio > 1.25)
    .sort((a, b) => b.ratio - a.ratio)[0]
    || artEntries[0]
    || null;
  if (teamCandidate) teamCandidate.role = "teamLogo";

  const neededPlayerIcons = playerTextCount - images.filter((entry) => entry.role === "playerIcon").length;
  if (neededPlayerIcons > 0 && playerTextCount >= 2) {
    images
      .filter((entry) => entry.role === "svg-layer" && entry !== background)
      .sort((a, b) => a.area - b.area)
      .slice(0, neededPlayerIcons)
      .forEach((entry) => { entry.role = "playerIcon"; });
  }

  images.filter((entry) => entry.role === "svg-layer" && entry !== background)
    .forEach((entry) => { entry.role = "clipart"; });

  return {
    images,
    texts,
    background,
    vectorBackground,
    teamLogo: images.find((entry) => entry.role === "teamLogo") || null,
    clipart: images.filter((entry) => entry.role === "clipart"),
    playerIcons: images.filter((entry) => entry.role === "playerIcon"),
    playerTextCount,
    yearTextCount,
    headerTextCount
  };
}

function templateTitle(file, info, svg, doc = {}) {
  const hrefs = [...String(svg || "").matchAll(/<image\b[^>]*(?:xlink:href|href)=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const best = doc.label || hrefs[0] || info.cover?.url || file;
  return compact(String(best)
    .split("?")[0]
    .split("/")
    .pop()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+1[0-9]{9,}$/g, "")
    .replace(/[-_]+(?:background|banner|bg|hem|pole|pocket|triangle|home|plate|softball|baseball|soccer|acc|accessory|libs|assets)\b/gi, " ")
    .replace(/[-_]+/g, " ")) || file.replace(/\.svg$/i, "");
}

function adminIdFromUrl(url) {
  const match = String(url || "").match(/admin-designs\/([0-9]{10,})\.svg/i);
  return match ? match[1] : "";
}

function localFileForDoc(doc) {
  const source = String(doc.svg_url || "");
  const adminId = adminIdFromUrl(source);
  if (adminId) return `${adminId}.svg`;
  const id = String(doc._id || crypto.createHash("sha1").update(source).digest("hex").slice(0, 12));
  return `legacy-${id}.svg`;
}

function publicSvgUrl(file) {
  return `/svg-layer-templates/${encodeURIComponent(file)}`;
}

async function postFind(skip, limit) {
  const response = await fetch(CRUD_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-requested-with": "XMLHttpRequest",
      "user-agent": "TeamBannerTrueSourceSync/1.0"
    },
    body: JSON.stringify({
      collection: COLLECTION,
      filter: {},
      options: { skip, limit },
      db: DB
    })
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchAllDesignDocs() {
  const first = await postFind(0, 1);
  const total = Number(first.total || 0);
  const docs = [];
  for (let skip = 0; skip < total; skip += 500) {
    const page = await postFind(skip, 500);
    docs.push(...(page.docs || []));
    process.stdout.write(`  fetched ${docs.length}/${total}\n`);
  }
  return { total, docs };
}

async function downloadSvg(url, file) {
  const target = path.join(SVG_DIR, file);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return "exists";
  const response = await fetch(url, { headers: { "user-agent": "TeamBannerTrueSourceSync/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const svg = await response.text();
  if (!/<svg[\s>]/i.test(svg)) throw new Error("not-svg");
  fs.writeFileSync(target, svg);
  return "downloaded";
}

function readTemplateMeta(file, doc = {}, previous = {}) {
  const svg = fs.readFileSync(path.join(SVG_DIR, file), "utf8");
  const info = parseDataInfo(svg);
  const analysis = analyzeTemplateSvg(svg);
  const text = [file, info.type, info.name, doc.label, doc.tags, doc.alt, previous.sourceTitle, previous.sourceCategoryUrl, ...analysis.images.map((entry) => entry.href), ...analysis.texts].join(" ");
  const svgShapeHint = [
    info.type,
    info.name,
    info.information,
    info.back?.url,
    info.mask?.url,
    info.cover?.url,
    ...analysis.images.map((entry) => entry.href),
    ...analysis.texts
  ].join(" ");
  const name = file.replace(/\.svg$/i, "");
  return {
    ...previous,
    name,
    title: previous.title || templateTitle(file, info, svg, doc),
    url: publicSvgUrl(file),
    sourceUrl: doc.svg_url || previous.sourceUrl || (adminIdFromUrl(file) ? `${ADMIN_BASE}/${name}.svg` : ""),
    previewUrl: doc.jpg_url || previous.previewUrl || "",
    sourcePage: previous.sourcePage || "",
    sourceTitle: doc.label || previous.sourceTitle || "",
    sourceCategoryUrl: previous.sourceCategoryUrl || "",
    type: inferType(svgShapeHint) || mapType(doc.type || previous.type || text),
    sport: inferSport(doc.tags || doc.label || previous.sport || text),
    playerCount: analysis.playerTextCount,
    imageCount: analysis.images.length + (analysis.vectorBackground ? 1 : 0),
    textCount: analysis.texts.length,
    headerTextCount: analysis.headerTextCount,
    yearTextCount: analysis.yearTextCount,
    backgroundCount: analysis.background || analysis.vectorBackground ? 1 : 0,
    teamLogoCount: analysis.teamLogo ? 1 : 0,
    clipartCount: analysis.clipart.length,
    backgroundUrl: analysis.background?.href || (analysis.vectorBackground ? publicSvgUrl(file) : previous.backgroundUrl || ""),
    teamLogoUrl: analysis.teamLogo?.href || "",
    clipartUrl: analysis.clipart[0]?.href || "",
    playerIconUrl: analysis.playerIcons[0]?.href || "",
    playerIconCount: analysis.playerIcons.length
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function writeCsv(file, headers, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n") + "\n");
}

async function main() {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const { total, docs } = await fetchAllDesignDocs();
  fs.writeFileSync(path.join(OUTPUT_DIR, "designs.teambannersports_com.json"), JSON.stringify({ total, docs }, null, 2) + "\n");

  const previousManifest = fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")) : { templates: [] };
  const previousByName = new Map((previousManifest.templates || []).map((template) => [template.name, template]));
  const docByFile = new Map();
  const downloadRows = [];

  for (const doc of docs) {
    if (!doc.svg_url) continue;
    const file = localFileForDoc(doc);
    docByFile.set(file, doc);
    if (!shouldDownload) {
      downloadRows.push({ file, status: fs.existsSync(path.join(SVG_DIR, file)) ? "exists" : "not-downloaded", sourceUrl: doc.svg_url, previewUrl: doc.jpg_url || "" });
      continue;
    }
    try {
      const status = await downloadSvg(doc.svg_url, file);
      downloadRows.push({ file, status, sourceUrl: doc.svg_url, previewUrl: doc.jpg_url || "" });
    } catch (error) {
      downloadRows.push({ file, status: "download-error", error: error.message, sourceUrl: doc.svg_url, previewUrl: doc.jpg_url || "" });
    }
  }

  const localFiles = fs.readdirSync(SVG_DIR)
    .filter((file) => /\.svg$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const nextTemplates = [];
  const manifestRows = [];
  for (const file of localFiles) {
    const previous = previousByName.get(file.replace(/\.svg$/i, "")) || {};
    const doc = docByFile.get(file) || {};
    try {
      const template = readTemplateMeta(file, doc, previous);
      nextTemplates.push(template);
      manifestRows.push({
        name: template.name,
        type: template.type,
        sport: template.sport,
        playerCount: template.playerCount,
        imageCount: template.imageCount,
        textCount: template.textCount,
        sourceUrl: template.sourceUrl,
        previewUrl: template.previewUrl,
        sourceTitle: template.sourceTitle
      });
    } catch (error) {
      manifestRows.push({ name: file.replace(/\.svg$/i, ""), error: error.message });
    }
  }

  const nextManifest = {
    ...previousManifest,
    templates: nextTemplates,
    teambannersportsDesignDbSyncedAt: new Date().toISOString()
  };
  const previewFile = path.join(OUTPUT_DIR, "svg-layer-templates.preview.json");
  fs.writeFileSync(previewFile, JSON.stringify(nextManifest, null, 2) + "\n");
  writeCsv(path.join(OUTPUT_DIR, "downloaded-design-db-svgs.csv"), ["file", "status", "sourceUrl", "previewUrl", "error"], downloadRows);
  writeCsv(path.join(OUTPUT_DIR, "design-db-template-manifest.csv"), ["name", "type", "sport", "playerCount", "imageCount", "textCount", "sourceUrl", "previewUrl", "sourceTitle", "error"], manifestRows);

  const summary = {
    generatedAt: nextManifest.teambannersportsDesignDbSyncedAt,
    apply: shouldApply,
    db: DB,
    collection: COLLECTION,
    designDocs: docs.length,
    sourceSvgDocs: docs.filter((doc) => doc.svg_url).length,
    adminDesignDocs: docs.filter((doc) => /admin-designs\//i.test(doc.svg_url || "")).length,
    legacyDesignDocs: docs.filter((doc) => /svg-design\.s3/i.test(doc.svg_url || "")).length,
    downloaded: downloadRows.filter((row) => row.status === "downloaded").length,
    existing: downloadRows.filter((row) => row.status === "exists").length,
    downloadErrors: downloadRows.filter((row) => row.status === "download-error").length,
    templateCountBefore: (previousManifest.templates || []).length,
    templateCountAfter: nextTemplates.length,
    outputDir: OUTPUT_DIR,
    manifestPreview: previewFile
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  if (shouldApply) fs.writeFileSync(MANIFEST_FILE, JSON.stringify(nextManifest, null, 2) + "\n");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
