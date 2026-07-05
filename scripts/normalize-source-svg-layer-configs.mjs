import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SVG_DIR = path.join(PUBLIC_DIR, "svg-layer-templates");
const MAP_FILE = path.join(PUBLIC_DIR, "team-banner-source-svg-map.json");
const CANDIDATES_FILE = path.join(PUBLIC_DIR, "team-banner-source-svg-candidates.json");
const PRODUCTS_FILE = path.join(PUBLIC_DIR, "team-banner-products.json");
const TEMPLATES_FILE = path.join(PUBLIC_DIR, "svg-layer-templates.json");
const OUTPUT_DIR = path.join(ROOT, "outputs", `source-svg-layer-normalization-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`);
const VECTOR_BACKGROUND_HREF = "__source_svg_vector_background__";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attrs(tag) {
  const result = {};
  String(tag || "").replace(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, key, __, doubleValue, singleValue) => {
    result[key.toLowerCase()] = decodeHtml(doubleValue ?? singleValue ?? "");
    return "";
  });
  return result;
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
  const areaScale = Math.abs(a * d - b * c) || Math.max(Math.abs(a), Math.abs(d), 1);
  return Math.abs(width * height * areaScale);
}

function parseViewBox(svgText) {
  const rootTag = (String(svgText || "").match(/<svg\b[^>]*>/i) || [""])[0];
  const values = String(attrs(rootTag).viewbox || "0 0 500 300")
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  return {
    width: values[2] > 0 ? values[2] : 500,
    height: values[3] > 0 ? values[3] : 300
  };
}

function parseDataInfo(svgText) {
  const rootTag = (String(svgText || "").match(/<svg\b[^>]*>/i) || [""])[0];
  const raw = attrs(rootTag)["data-info"] || "";
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shapeHintFromText(value) {
  const text = compact(value).toLowerCase();
  if (/pole|pocket|sleeve/.test(text)) return "polepocket";
  if (/home\s*plate|homeplate|plate/.test(text)) return "homeplatepennant";
  if (/triangle|pennant/.test(text)) return "triangle";
  return "rectangle";
}

function minBackgroundCoverForShape(shape) {
  return shape === "triangle" || shape === "homeplatepennant" ? 0.28 : 0.48;
}

function hasSourceVectorBackground(svgText) {
  return /<g\b[^>]*class=["'][^"']*(?:model|mask)[^"']*["']/i.test(String(svgText || ""))
    || /<(path|rect|polygon|polyline|circle|ellipse)\b/i.test(String(svgText || ""));
}

function textRole(text) {
  const value = compact(text);
  if (/^player$/i.test(value)) return "player";
  if (/^year$/i.test(value)) return "year";
  return "header";
}

function localSvgFile(value = "") {
  const name = String(value || "").split("?")[0].split("#")[0].split("/").pop();
  if (!name || !/\.svg$/i.test(name)) return "";
  const file = path.join(SVG_DIR, name);
  return fs.existsSync(file) ? file : "";
}

function cleanFallbackTags(tags) {
  if (typeof tags !== "string") return tags;
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !/^tbd:asset-match:partial-product-image$/i.test(tag))
    .filter((tag) => !/^tbd:layout-source:product-image-fallback$/i.test(tag))
    .filter((tag) => !/^tbd:(?:background|team-logo|clipart|accessory)-url:(?:product-image|crop)$/i.test(tag))
    .filter((tag) => !/^tbd:qa-needs-clean-assets:1$/i.test(tag))
    .join(", ");
}

function analyzeTemplateSvg(svg) {
  const viewBox = parseViewBox(svg);
  const dataInfo = parseDataInfo(svg);
  const shape = shapeHintFromText([dataInfo.type, dataInfo.name, dataInfo.information].filter(Boolean).join(" "));
  const artboardArea = Math.max(1, viewBox.width * viewBox.height);
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

  const minCover = minBackgroundCoverForShape(shape);
  const explicitBackground = images.find((entry) => /background/.test(entry.className)) || null;
  const lockedCoverBackground = images.find((entry) => /locked/.test(entry.className) && (entry.area / artboardArea) >= minCover) || null;
  const classBackground = explicitBackground || lockedCoverBackground;
  const largestImage = images.slice().sort((a, b) => b.area - a.area)[0] || null;
  const vectorBackground = hasSourceVectorBackground(svg)
    && (!images.length || (!classBackground && ((largestImage?.area || 0) / artboardArea) < minCover));
  const background = vectorBackground
    ? null
    : (classBackground || largestImage || images[0] || null);
  if (background) background.role = "background";

  const texts = [...String(svg || "").matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)]
    .map((match) => compact(decodeHtml(match[0].replace(/<[^>]+>/g, " "))))
    .filter(Boolean);
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
    images
      .filter((entry) => entry.href === repeated[0] && entry !== background)
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
    const playerCandidates = images
      .filter((entry) => entry.role === "svg-layer" && entry !== background)
      .sort((a, b) => a.area - b.area);
    if (playerCandidates.length >= neededPlayerIcons) {
      playerCandidates
        .slice(0, neededPlayerIcons)
        .forEach((entry) => { entry.role = "playerIcon"; });
    }
  }

  images
    .filter((entry) => entry.role === "svg-layer" && entry !== background)
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

function normalizedLayerConfig(existing = {}, analysis, svgName = "") {
  const imageCount = analysis.images.length;
  const textCount = analysis.texts.length;
  const backgroundCount = analysis.background || analysis.vectorBackground ? 1 : 0;
  const teamLogoCount = analysis.teamLogo ? 1 : 0;
  const clipartCount = analysis.clipart.length;
  const playerIconCount = analysis.playerIcons.length;
  const playerTextCount = analysis.playerTextCount;
  const playerCount = Math.max(playerIconCount, playerTextCount, Number(existing.playerCount || 0));
  const backgroundUrls = uniqueValues(analysis.vectorBackground ? [VECTOR_BACKGROUND_HREF] : (analysis.background ? [analysis.background.href] : []));
  const logoUrls = uniqueValues(analysis.teamLogo ? [analysis.teamLogo.href] : []);
  const clipartUrls = uniqueValues(analysis.clipart.map((entry) => entry.href));
  const accessoryUrls = uniqueValues(analysis.playerIcons.map((entry) => entry.href));

  const config = {
    ...existing,
    layerCount: imageCount + textCount + (analysis.vectorBackground ? 1 : 0),
    backgroundCount,
    teamLogoCount,
    clipartCount,
    playerCount,
    playerIconCount,
    playerTextCount,
    textLayerCount: textCount,
    headerTextCount: analysis.headerTextCount,
    coachNameCount: analysis.texts.filter((text) => /coach/i.test(text) && !/asst|assistant/i.test(text)).length,
    teamMomNameCount: analysis.texts.filter((text) => /team mom|mom\/dad|mom/i.test(text)).length,
    yearTextCount: analysis.yearTextCount,
    backgroundUrls,
    logoUrls,
    clipartUrls,
    accessoryUrls,
    sourceRoleSummary: [
      ...(analysis.vectorBackground ? [{
        index: -1,
        role: "background",
        href: VECTOR_BACKGROUND_HREF,
        className: "vector-background locked"
      }] : []),
      ...analysis.images.map((entry) => ({
        index: entry.index,
        role: entry.role,
        href: entry.href,
        className: entry.className || ""
      }))
    ],
    ...(analysis.background?.href ? { backgroundUrl: analysis.background.href, backgroundSource: "svg-template-asset" } : {}),
    ...(analysis.vectorBackground ? { backgroundUrl: VECTOR_BACKGROUND_HREF, backgroundSource: "source-svg-vector-background" } : {}),
    ...(analysis.teamLogo?.href ? { logoUrl: analysis.teamLogo.href, logoSource: "svg-template-asset" } : {}),
    ...(analysis.clipart[0]?.href ? { clipartUrl: analysis.clipart[0].href, clipartSource: "svg-template-asset" } : {}),
    ...(analysis.playerIcons[0]?.href ? { accessoryUrl: analysis.playerIcons[0].href, accessorySource: "svg-template-asset" } : {}),
    layoutSource: "svg-template",
    assetMatchStatus: String(existing.assetMatchStatus || "").includes("direct-product-image-id")
      ? "svg-template-direct-product-image-id"
      : (existing.assetMatchStatus || "svg-template"),
    objectLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    needsSourceSvg: false
  };

  if (!teamLogoCount) {
    config.logoUrl = "";
    config.logoSource = "";
  }
  if (!clipartCount) {
    config.clipartUrl = "";
    config.clipartSource = "";
  }
  if (!playerIconCount) {
    config.accessoryUrl = "";
    config.accessorySource = "";
  }
  if (svgName) {
    config.layoutSvg = svgName.replace(/\.svg$/i, "");
    config.layoutSvgUrl = `/svg-layer-templates/${svgName}`;
  }
  return config;
}

function normalizeMapRows(rows = [], templateStats) {
  let normalized = 0;
  let skipped = 0;
  const next = rows.map((row) => {
    const svgFile = localSvgFile(row.templateSvg || row.layerConfig?.layoutSvgUrl || row.layerConfig?.layoutSvg || "");
    if (!svgFile) {
      skipped += 1;
      return row;
    }
    const svgName = path.basename(svgFile);
    const analysis = analyzeTemplateSvg(fs.readFileSync(svgFile, "utf8"));
    templateStats.set(svgName.replace(/\.svg$/i, ""), analysis);
    normalized += 1;
    return {
      ...row,
      productShape: row.shape || row.productShape,
      layerConfig: normalizedLayerConfig(row.layerConfig || {}, analysis, svgName),
      fullyEditable: true,
      sourceEditable: true,
      needsSourceSvg: false,
      sourceType: "source-svg",
      editableLayerMode: "source-svg"
    };
  });
  return { rows: next, normalized, skipped };
}

function normalizeProducts(products = [], rowByHandle, templateStats) {
  let normalized = 0;
  const next = products.map((product) => {
    const baseProduct = { ...product, tags: cleanFallbackTags(product.tags) };
    const row = rowByHandle.get(product.handle);
    if (row?.layerConfig) {
      normalized += 1;
      return { ...baseProduct, shape: row.shape || row.productShape || product.shape, layerConfig: { ...(product.layerConfig || {}), ...row.layerConfig } };
    }
    const svgFile = localSvgFile(product.layerConfig?.layoutSvgUrl || product.layerConfig?.layoutSvg || "");
    if (!svgFile) return baseProduct;
    const svgName = path.basename(svgFile);
    const analysis = templateStats.get(svgName.replace(/\.svg$/i, "")) || analyzeTemplateSvg(fs.readFileSync(svgFile, "utf8"));
    normalized += 1;
    return { ...baseProduct, layerConfig: normalizedLayerConfig(product.layerConfig || {}, analysis, svgName) };
  });
  return { products: next, normalized };
}

function normalizeTemplateIndex(data, templateStats) {
  let normalized = 0;
  const templates = (data.templates || []).map((template) => {
    const svgFile = localSvgFile(template.url || `${template.name}.svg`);
    if (!svgFile) return template;
    const svgName = path.basename(svgFile);
    const analysis = templateStats.get(template.name) || analyzeTemplateSvg(fs.readFileSync(svgFile, "utf8"));
    normalized += 1;
    return {
      ...template,
      playerCount: analysis.playerTextCount,
      imageCount: analysis.images.length + (analysis.vectorBackground ? 1 : 0),
      textCount: analysis.texts.length,
      headerTextCount: analysis.headerTextCount,
      yearTextCount: analysis.yearTextCount,
      backgroundCount: analysis.background || analysis.vectorBackground ? 1 : 0,
      teamLogoCount: analysis.teamLogo ? 1 : 0,
      clipartCount: analysis.clipart.length,
      backgroundUrl: analysis.background?.href || (analysis.vectorBackground ? VECTOR_BACKGROUND_HREF : template.backgroundUrl || ""),
      teamLogoUrl: analysis.teamLogo?.href || "",
      clipartUrl: analysis.clipart[0]?.href || "",
      playerIconUrl: analysis.playerIcons[0]?.href || "",
      playerIconCount: analysis.playerIcons.length,
      url: `/svg-layer-templates/${svgName}`
    };
  });
  return { data: { ...data, templates }, normalized };
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const templateStats = new Map();
  const summary = { generatedAt: new Date().toISOString(), files: {} };

  const mapData = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  const mapResult = normalizeMapRows(mapData.maps || [], templateStats);
  const normalizedMapData = { ...mapData, maps: mapResult.rows, layerNormalizedAt: summary.generatedAt };
  writeJson(MAP_FILE, normalizedMapData);
  summary.files["team-banner-source-svg-map.json"] = { normalized: mapResult.normalized, skipped: mapResult.skipped };

  if (fs.existsSync(CANDIDATES_FILE)) {
    const candidateData = JSON.parse(fs.readFileSync(CANDIDATES_FILE, "utf8"));
    const candidateResult = normalizeMapRows(candidateData.maps || [], templateStats);
    writeJson(CANDIDATES_FILE, { ...candidateData, maps: candidateResult.rows, layerNormalizedAt: summary.generatedAt });
    summary.files["team-banner-source-svg-candidates.json"] = { normalized: candidateResult.normalized, skipped: candidateResult.skipped };
  }

  const rowByHandle = new Map(mapResult.rows.filter((row) => row.handle).map((row) => [row.handle, row]));
  const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));
  const productResult = normalizeProducts(productsData.products || [], rowByHandle, templateStats);
  writeJson(PRODUCTS_FILE, { ...productsData, products: productResult.products, layerNormalizedAt: summary.generatedAt });
  summary.files["team-banner-products.json"] = { normalized: productResult.normalized, skipped: Math.max(0, (productsData.products || []).length - productResult.normalized) };

  const templateData = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8"));
  const templateResult = normalizeTemplateIndex(templateData, templateStats);
  writeJson(TEMPLATES_FILE, { ...templateResult.data, layerNormalizedAt: summary.generatedAt });
  summary.files["svg-layer-templates.json"] = { normalized: templateResult.normalized, skipped: Math.max(0, (templateData.templates || []).length - templateResult.normalized) };

  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main();
