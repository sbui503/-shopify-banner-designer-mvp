import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const SVG_MANIFEST = "public/svg-layer-templates.json";
const SVG_DIR = "public/svg-layer-templates";
const TARGET_PASS_RATE = 99;

const args = new Set(process.argv.slice(2));
const strictMode = args.has("--strict");
const manifestPath = readArg("--manifest", PRODUCT_MANIFEST);
const sourceMapPath = readArg("--source-map", SOURCE_MAP_PATH);
const svgManifestPath = readArg("--svg-manifest", SVG_MANIFEST);
const outputDir = readArg("--output-dir", `outputs/product-graphic-qa-${localDateStamp()}`);
const targetPassRate = safeNumber(readArg("--target", TARGET_PASS_RATE), TARGET_PASS_RATE);
const sportFilter = readListArg("--sport");
const shapeFilter = readListArg("--shape");

function readArg(name, fallback) {
  const withEquals = [...process.argv].find((arg) => arg.startsWith(`${name}=`));
  if (withEquals) return withEquals.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function readListArg(name) {
  const raw = readArg(name, "");
  return String(raw || "")
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function localDateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanText(value) {
  return compact(String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " "));
}

function slug(value) {
  return cleanText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokenSet(value) {
  const stop = new Set([
    "banner", "banners", "pennant", "pennants", "home", "plate", "homeplate",
    "hem", "grommets", "grommet", "pole", "pocket", "triangle", "baseball",
    "softball", "soccer", "team", "sport", "sports", "custom", "design",
    "image", "png", "jpg", "jpeg", "svg", "the", "and", "for", "with"
  ]);
  return new Set(cleanText(value).split(" ").filter((token) => token && !stop.has(token)));
}

function tokenOverlap(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  const hits = [...a].filter((token) => b.has(token)).length;
  return hits / Math.max(a.size, b.size);
}

function filenameBase(value) {
  const raw = String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
  return decodeURIComponent(raw).replace(/\.[a-z0-9]+$/i, "");
}

function assetKey(value) {
  return filenameBase(value).toLowerCase();
}

function assetMatches(value, candidates) {
  const key = assetKey(value);
  if (!key) return false;
  return candidates
    .filter(Boolean)
    .some((candidate) => {
      const candidateKey = assetKey(candidate);
      return candidateKey && (candidateKey === key || String(candidate || "") === String(value || ""));
    });
}

function roleExpected(config = {}, key) {
  if (!Object.prototype.hasOwnProperty.call(config, key)) return true;
  const raw = config[key];
  if (raw === undefined || raw === null || raw === "") return true;
  return configNumber(config, key) > 0;
}

function configuredImageRole(href, config = {}) {
  const list = (values) => values.flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
  if (roleExpected(config, "backgroundCount") && assetMatches(href, list([config.backgroundUrl, config.backgroundSvgUrl, config.backgroundUrls]))) return "template-background";
  if (roleExpected(config, "teamLogoCount") && assetMatches(href, list([config.logoUrl, config.logoSvgUrl, config.logoUrls]))) return "template-team-name";
  if (roleExpected(config, "clipartCount") && assetMatches(href, list([config.clipartUrl, config.clipartSvgUrl, config.clipartUrls]))) return "template-clipart";
  if (roleExpected(config, "playerIconCount") && assetMatches(href, list([config.accessoryUrl, config.accessorySvgUrl, config.accessoryUrls]))) return "template-player-icon";
  return "";
}

function roleFromSourceSummary(index, config = {}) {
  const entry = Array.isArray(config.sourceRoleSummary)
    ? config.sourceRoleSummary.find((item) => Number(item.index) === Number(index))
    : null;
  const role = String(entry?.role || "").toLowerCase();
  if (role === "background") return "template-background";
  if (role === "teamlogo" || role === "team-name" || role === "team_name") return "template-team-name";
  if (role === "clipart" || role === "mascot") return "template-clipart";
  if (role === "playericon" || role === "accessory" || role === "player-icon") return "template-player-icon";
  return "";
}

function isProductImageObjectFallback(sourceMap, config = {}) {
  const values = [
    sourceMap?.matchConfidence,
    sourceMap?.sourceType,
    sourceMap?.editableLayerMode,
    config.layoutSource,
    config.assetMatchStatus,
    config.objectLayerMode
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => value === "product-image-object-fallback");
}

function safeNumber(value, fallback = 0) {
  const next = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(next) ? next : fallback;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function writeCsv(filePath, rows) {
  const headers = Object.keys(rows[0] || { Empty: "" });
  fs.writeFileSync(filePath, [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n") + "\n");
}

function normalizeShape(value) {
  const text = cleanText(value);
  if (/pole|pocket|sleeve/.test(text)) return "polepocket";
  if (/home\s*plate|homeplate|plate/.test(text)) return "homeplatepennant";
  if (/\bhome\b.*\b(baseball|softball|soccer)\b.*\bbanners?\b/.test(text)) return "homeplatepennant";
  if (/triangle|pennant/.test(text)) return "triangle";
  if (/rectangle|banner|banne\b|hem|grommet/.test(text)) return "rectangle";
  return text || "";
}

function inferSport(value) {
  const text = cleanText(value);
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoftball\b/.test(text)) return "softball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  return "";
}

function attrs(tag) {
  const out = {};
  for (const match of String(tag || "").matchAll(/([:@a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1]] = decodeHtml(match[2] ?? match[3] ?? "");
  }
  return out;
}

function attrNumber(attr, name, fallback = 0) {
  if (!attr || attr[name] === undefined || attr[name] === null || attr[name] === "") return fallback;
  return safeNumber(attr[name], fallback);
}

function parseMatrix(transform) {
  let matrix = [1, 0, 0, 1, 0, 0];
  const pattern = /(matrix|translate|scale)\(([^)]*)\)/gi;
  for (const match of String(transform || "").matchAll(pattern)) {
    const kind = match[1].toLowerCase();
    const nums = match[2].split(/[,\s]+/).filter(Boolean).map(Number);
    let next = [1, 0, 0, 1, 0, 0];
    if (kind === "matrix" && nums.length >= 6) {
      next = nums.slice(0, 6);
    } else if (kind === "translate") {
      next = [1, 0, 0, 1, nums[0] || 0, nums[1] || 0];
    } else if (kind === "scale") {
      next = [nums[0] || 1, 0, 0, nums.length > 1 ? nums[1] || 1 : nums[0] || 1, 0, 0];
    }
    matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

function multiplyMatrix(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

function transformedBox(matrix, x, y, width, height) {
  const [a, b, c, d, e, f] = matrix;
  const points = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height]
  ].map(([px, py]) => [a * px + c * py + e, b * px + d * py + f]);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
}

function parseViewBox(svgText) {
  const rootTag = (svgText.match(/<svg\b[^>]*>/i) || [""])[0];
  const value = attrs(rootTag).viewBox || "0 0 500 300";
  const nums = value.split(/[,\s]+/).filter(Boolean).map(Number);
  return {
    x: nums[0] || 0,
    y: nums[1] || 0,
    width: nums[2] || 500,
    height: nums[3] || 300
  };
}

function parseDataInfo(svgText) {
  const rootTag = (svgText.match(/<svg\b[^>]*>/i) || [""])[0];
  const raw = attrs(rootTag)["data-info"] || "";
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function textRole(text) {
  if (/^player$/i.test(String(text || "").trim())) return "template-player-text";
  if (/^year$/i.test(String(text || "").trim())) return "template-year-text";
  return "template-text-layer";
}

function classifySvgImages(images, config = {}) {
  images.forEach((entry) => {
    const configuredRole = roleFromSourceSummary(entry.index, config) || configuredImageRole(entry.href, config);
    if (configuredRole) entry.role = configuredRole;
  });

  const hrefCounts = new Map();
  for (const image of images) {
    if (image.href) hrefCounts.set(image.href, (hrefCounts.get(image.href) || 0) + 1);
  }

  const classBackground = images.find((entry) => /background|locked/.test(entry.className));
  const background = classBackground
    || images.find((entry) => entry.role === "template-background")
    || images.slice().sort((a, b) => b.area - a.area)[0]
    || images[0]
    || null;
  if (background) {
    images.filter((entry) => entry !== background && entry.role === "template-background")
      .forEach((entry) => { entry.role = "svg-layer"; });
    background.role = "template-background";
  }

  const capRole = (role, key) => {
    if (!roleExpected(config, key)) return;
    const expected = configNumber(config, key);
    if (!expected) return;
    const entries = images
      .filter((entry) => entry.role === role && entry !== background)
      .sort((a, b) => b.area - a.area);
    entries.slice(expected).forEach((entry) => { entry.role = "svg-layer"; });
  };
  capRole("template-team-name", "teamLogoCount");
  capRole("template-clipart", "clipartCount");
  capRole("template-player-icon", "playerIconCount");

  const repeated = [...hrefCounts.entries()]
    .filter(([href, count]) => count > 1 && (!background || href !== background.href))
    .sort((a, b) => b[1] - a[1])[0];
  if (repeated) {
    images.filter((entry) => entry.href === repeated[0] && entry !== background && entry.role === "svg-layer")
      .forEach((entry) => { entry.role = "template-player-icon"; });
  }

  const artEntries = images.filter((entry) => entry.role === "svg-layer" && entry !== background)
    .sort((a, b) => b.area - a.area);
  if (roleExpected(config, "teamLogoCount") && !images.some((entry) => entry.role === "template-team-name")) {
    const teamCandidate = artEntries
      .filter((entry) => entry.box.width / Math.max(1, entry.box.height) > 1.25)
      .sort((a, b) => (b.box.width / Math.max(1, b.box.height)) - (a.box.width / Math.max(1, a.box.height)))[0]
      || artEntries[1]
      || artEntries[0]
      || null;
    if (teamCandidate) teamCandidate.role = "template-team-name";
  }
  const neededPlayerIcons = configNumber(config, "playerTextCount") - images.filter((entry) => entry.role === "template-player-icon").length;
  if (neededPlayerIcons > 0 && configNumber(config, "playerTextCount") >= 2) {
    const playerCandidates = images
      .filter((entry) => entry.role === "svg-layer" && entry !== background)
      .sort((a, b) => a.area - b.area);
    if (playerCandidates.length >= neededPlayerIcons) {
      playerCandidates
        .slice(0, neededPlayerIcons)
        .forEach((entry) => { entry.role = "template-player-icon"; });
    }
  }
  if (roleExpected(config, "clipartCount")) {
    images.filter((entry) => entry.role === "svg-layer" && entry !== background)
      .forEach((entry) => { entry.role = "template-clipart"; });
  }

  return background;
}

function parseSvg(svgText, config = {}) {
  const viewBox = parseViewBox(svgText);
  const info = parseDataInfo(svgText);
  const images = [...svgText.matchAll(/<image\b[^>]*>/gi)].map((match, index) => {
    const attr = attrs(match[0]);
    const href = attr.href || attr["xlink:href"] || "";
    const width = safeNumber(attr.width, 1);
    const height = safeNumber(attr.height, 1);
    const x = safeNumber(attr.x, 0);
    const y = safeNumber(attr.y, 0);
    const matrix = parseMatrix(attr.transform || "");
    const box = transformedBox(matrix, x, y, width, height);
    return {
      tag: "image",
      index,
      href,
      file: filenameBase(href),
      className: String(attr.class || "").toLowerCase(),
      box,
      area: box.width * box.height,
      role: "svg-layer"
    };
  });
  if (!images.length && /<(path|rect|polygon|polyline|circle|ellipse)\b/i.test(svgText)) {
    images.push({
      tag: "vector-background",
      index: 0,
      href: "__vector_background__",
      file: "__vector_background__",
      className: "vector-background locked",
      box: { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height },
      area: viewBox.width * viewBox.height,
      role: "svg-layer"
    });
  }

  const background = classifySvgImages(images, config);

  const texts = [...svgText.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)].map((match, index) => {
    const textTag = (match[0].match(/^<text\b[^>]*>/i) || [""])[0];
    const tspanTag = (match[2].match(/<tspan\b[^>]*>/i) || [""])[0];
    const attr = attrs(textTag);
    const tspanAttr = attrs(tspanTag);
    const text = compact(decodeHtml(match[2].replace(/<[^>]+>/g, " ")));
    const role = textRole(text);
    const fontSize = attrNumber(tspanAttr, "font-size", attrNumber(attr, "font-size", 18));
    const matrix = parseMatrix(attr.transform || "");
    const width = Math.max(18, text.length * fontSize * 0.58);
    const height = fontSize * 1.25;
    const x = attrNumber(tspanAttr, "x", attrNumber(attr, "x", 0))
      + attrNumber(tspanAttr, "dx", attrNumber(attr, "dx", 0));
    const y = attrNumber(tspanAttr, "y", attrNumber(attr, "y", 0))
      + attrNumber(tspanAttr, "dy", attrNumber(attr, "dy", 0));
    return {
      tag: "text",
      index,
      text,
      role,
      fill: tspanAttr.fill || attr.fill || "",
      stroke: tspanAttr.stroke || attr.stroke || "",
      fontFamily: tspanAttr["font-family"] || attr["font-family"] || "",
      box: transformedBox(matrix, x, y - fontSize, width, height)
    };
  }).filter((entry) => entry.text);

  const counts = {
    background: images.filter((entry) => entry.role === "template-background").length,
    teamLogo: images.filter((entry) => entry.role === "template-team-name").length,
    clipart: images.filter((entry) => entry.role === "template-clipart").length,
    playerIcon: images.filter((entry) => entry.role === "template-player-icon").length,
    playerText: texts.filter((entry) => entry.role === "template-player-text").length,
    yearText: texts.filter((entry) => entry.role === "template-year-text").length,
    textLayer: texts.length,
    imageLayer: images.length,
    totalLayer: images.length + texts.length
  };
  counts.headerText = counts.textLayer - counts.playerText - counts.yearText;
  counts.coachName = texts.filter((entry) => /coach/i.test(entry.text) && !/asst|assistant/i.test(entry.text)).length;
  counts.teamMomName = texts.filter((entry) => /team mom|mom\/dad|mom/i.test(entry.text)).length;

  return {
    viewBox,
    info,
    images,
    texts,
    counts,
    background,
    type: normalizeShape(info.type || info.name || "")
  };
}

function localSvgPath(templateSvg, layoutSvg) {
  const explicit = String(templateSvg || "");
  if (explicit) {
    const file = explicit.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
    for (const candidate of [file, path.join("public", file)]) {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved)) return resolved;
    }
  }
  const name = String(layoutSvg || filenameBase(templateSvg)).replace(/\.svg$/i, "");
  if (!name) return "";
  return path.resolve(SVG_DIR, `${name}.svg`);
}

function configNumber(config, key) {
  const value = Number(config?.[key] || 0);
  return Number.isFinite(value) ? value : 0;
}

function expectedTotalLayers(config) {
  return configNumber(config, "backgroundCount")
    + configNumber(config, "teamLogoCount")
    + configNumber(config, "clipartCount")
    + configNumber(config, "playerIconCount")
    + configNumber(config, "textLayerCount");
}

function compareCount(label, expected, actual, gate, severity, product, issues, warnings) {
  if (!Number.isFinite(expected) || expected < 0) return;
  if (expected !== actual) {
    const entry = `${label}-count-mismatch:expected-${expected}-actual-${actual}`;
    if (severity === "warn") warnings.push({ gate, code: entry });
    else issues.push({ gate, severity, code: entry, product });
  }
}

function addIssue(issues, gate, severity, code, product) {
  issues.push({ gate, severity, code, product });
}

function addWarning(warnings, gate, code) {
  warnings.push({ gate, code });
}

function gateResult(name, issues, warnings) {
  const gateIssues = issues.filter((issue) => issue.gate === name);
  const gateWarnings = warnings.filter((warning) => warning.gate === name);
  if (gateIssues.some((issue) => issue.severity === "critical")) return "critical";
  if (gateIssues.length) return "fail";
  if (gateWarnings.length) return "review";
  return "pass";
}

function designUrl(product) {
  const url = new URL("https://files-mentioned-by-the-user-shopify.vercel.app/");
  const config = product.layerConfig || {};
  const params = {
    productHandle: product.handle,
    productTitle: product.title,
    productImage: product.image,
    productId: product.id || "",
    variantId: product.variantId || "",
    price: product.price || "",
    image: product.image,
    product_title: product.title,
    product_id: product.id || "",
    variant_id: product.variantId || "",
    autoLoadProduct: "1",
    autoLayer: config.layoutSource === "svg-template" || product.templateSvg ? "png" : "png"
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value || "");
  return url.toString();
}

function basenameUrl(url) {
  return filenameBase(url).replace(/[-_]+1[0-9]{9,}$/g, "");
}

function summarizeProduct(product, sourceMap, templateMetaByName) {
  const issues = [];
  const warnings = [];
  const config = {
    ...(product.layerConfig || {}),
    ...(sourceMap?.layerConfig || {})
  };
  const objectFallback = isProductImageObjectFallback(sourceMap, config);
  const exactSourceReasons = (sourceMap?.matchReasons || []).some((reason) => /product-image-id=svg-id|real-source-svg-direct-product-image-id|visual-product-image=source-preview/.test(reason));
  const productShape = (exactSourceReasons && normalizeShape(sourceMap?.shape || sourceMap?.productShape || ""))
    || normalizeShape([product.title, product.handle].join(" "))
    || normalizeShape(product.shape || "");
  const productSport = inferSport([product.title, product.handle].join(" ")) || inferSport(product.tags);
  const templateSvg = sourceMap?.templateSvg || product.templateSvg || config.layoutSvgUrl || "";
  const layoutSvgName = String(config.layoutSvg || filenameBase(templateSvg)).replace(/\.svg$/i, "");
  const templateMeta = templateMetaByName.get(layoutSvgName) || {};
  const resolvedSvgPath = localSvgPath(templateSvg, layoutSvgName);
  let parsed = null;

  if (!sourceMap) {
    addIssue(issues, "source", "critical", "missing-source-svg-map:designer-uses-exact-product-image-fallback", product);
  } else {
    if (sourceMap.matchStatus !== "matched") {
      addIssue(issues, "source", "fail", `source-map-status-${sourceMap.matchStatus || "blank"}`, product);
    }
    if (Number(sourceMap.matchScore || 0) < 80) {
      addWarning(warnings, "source", `low-source-match-score:${sourceMap.matchScore || 0}`);
    }
    if (Number(sourceMap.matchMargin || 0) < 15 && !(sourceMap.matchReasons || []).some((reason) => /manual|product-image-id=svg-id/.test(reason))) {
      addWarning(warnings, "source", `low-source-match-margin:${sourceMap.matchMargin || 0}`);
    }
  }

  if (!templateSvg && !layoutSvgName) {
    addIssue(issues, "source", "critical", "missing-template-svg-reference", product);
  } else if (!fs.existsSync(resolvedSvgPath)) {
    addIssue(issues, "source", "critical", `missing-local-template-svg:${templateSvg || layoutSvgName}`, product);
  } else {
    parsed = parseSvg(fs.readFileSync(resolvedSvgPath, "utf8"), config);
  }

  const templateShape = normalizeShape(sourceMap?.shape || templateMeta.type || parsed?.type || "");
  const templateSport = inferSport([templateMeta.sport, templateMeta.sourceTitle, templateMeta.sourcePage, sourceMap?.sourceTemplatePage].join(" "));
  if (parsed && !objectFallback) {
    if (templateShape && productShape && templateShape !== productShape) {
      addIssue(issues, "layout", "critical", `shape-mismatch:product-${productShape}-svg-${templateShape}`, product);
    }
    if (templateSport && productSport && templateSport !== productSport) {
      if (exactSourceReasons) {
        addWarning(warnings, "source", `sport-mismatch-source-label:${productSport}-product-${templateSport}-source`);
      } else {
        addIssue(issues, "source", "fail", `sport-mismatch:product-${productSport}-svg-${templateSport}`, product);
      }
    }

    compareCount("background", configNumber(config, "backgroundCount"), parsed.counts.background, "layout", "critical", product, issues, warnings);
    compareCount("total-layer", configNumber(config, "layerCount") || expectedTotalLayers(config), parsed.counts.totalLayer, "layout", "fail", product, issues, warnings);

    if (!parsed.background || !parsed.background.href) {
      addIssue(issues, "layout", "critical", "missing-background-object", product);
    } else {
      const artboardArea = Math.max(1, parsed.viewBox.width * parsed.viewBox.height);
      const coverRatio = parsed.background.area / artboardArea;
      const minCover = productShape === "triangle" || productShape === "homeplatepennant" ? 0.28 : 0.48;
      if (coverRatio < minCover) {
        addIssue(issues, "layout", "fail", `background-too-small:${coverRatio.toFixed(2)}`, product);
      }
      if (parsed.background.index !== 0 && !/locked|background/.test(parsed.background.className)) {
        addWarning(warnings, "layout", `background-not-first-image:index-${parsed.background.index}`);
      }
    }

    compareCount("text-layer", configNumber(config, "textLayerCount"), parsed.counts.textLayer, "text", "fail", product, issues, warnings);
    compareCount("player-text", configNumber(config, "playerTextCount"), parsed.counts.playerText, "text", "fail", product, issues, warnings);
    compareCount("header-text", configNumber(config, "headerTextCount"), parsed.counts.headerText, "text", "fail", product, issues, warnings);
    compareCount("year-text", configNumber(config, "yearTextCount"), parsed.counts.yearText, "text", "fail", product, issues, warnings);
    compareCount("coach-name", configNumber(config, "coachNameCount"), parsed.counts.coachName, "text", "warn", product, issues, warnings);
    compareCount("team-mom-name", configNumber(config, "teamMomNameCount"), parsed.counts.teamMomName, "text", "warn", product, issues, warnings);

    compareCount("team-logo", configNumber(config, "teamLogoCount"), parsed.counts.teamLogo, "teamLogo", "fail", product, issues, warnings);
    compareCount("clipart", configNumber(config, "clipartCount"), parsed.counts.clipart, "clipart", "fail", product, issues, warnings);
    compareCount("player-icon", configNumber(config, "playerIconCount"), parsed.counts.playerIcon, "playerIcon", "fail", product, issues, warnings);

    const playerIconEntries = parsed.images.filter((entry) => entry.role === "template-player-icon");
    const playerIconHrefs = new Set(playerIconEntries.map((entry) => entry.href).filter(Boolean));
    if (configNumber(config, "playerIconCount") > 0 && !playerIconHrefs.size) {
      addIssue(issues, "playerIcon", "critical", "player-icons-have-no-source-object", product);
    }
    if (playerIconHrefs.has(parsed.background?.href)) {
      addIssue(issues, "playerIcon", "critical", "player-icons-use-background-url-tile-risk", product);
    }
    if (playerIconHrefs.size > 1) {
      addWarning(warnings, "playerIcon", `multiple-player-icon-sources:${playerIconHrefs.size}`);
    }
    if (parsed.counts.playerIcon && parsed.counts.playerText && parsed.counts.playerIcon !== parsed.counts.playerText) {
      addWarning(warnings, "playerIcon", `player-icon-text-count-differs:${parsed.counts.playerIcon}-icons-${parsed.counts.playerText}-texts`);
    }

    for (const role of ["template-team-name", "template-clipart"]) {
      const entry = parsed.images.find((image) => image.role === role);
      if (configNumber(config, role === "template-team-name" ? "teamLogoCount" : "clipartCount") > 0 && (!entry || !entry.href)) {
        addIssue(issues, role === "template-team-name" ? "teamLogo" : "clipart", "fail", `${role}-missing-source-href`, product);
      }
      if (entry && entry.href === parsed.background?.href) {
        addIssue(issues, role === "template-team-name" ? "teamLogo" : "clipart", "critical", `${role}-uses-background-url-tile-risk`, product);
      }
    }
  }

  if (objectFallback) {
    if (!configNumber(config, "layerCount")) {
      addIssue(issues, "layout", "fail", "object-fallback-missing-layer-count", product);
    }
    if (configNumber(config, "backgroundCount") > 0 && !config.backgroundUrl) {
      addIssue(issues, "layout", "critical", "object-fallback-missing-background-url", product);
    }
    if (configNumber(config, "teamLogoCount") > 0 && !config.logoUrl) {
      addWarning(warnings, "teamLogo", "object-fallback-missing-team-logo-url");
    }
    if (configNumber(config, "clipartCount") > 0 && !config.clipartUrl) {
      addWarning(warnings, "clipart", "object-fallback-missing-clipart-url");
    }
    if (configNumber(config, "playerIconCount") > 0 && !config.accessoryUrl) {
      addWarning(warnings, "playerIcon", "object-fallback-uses-product-crops-for-player-icons");
    }
  }

  const sourceContext = [
    templateMeta.sourceTitle,
    templateMeta.sourcePage,
    sourceMap?.sourceTemplatePage,
    parsed?.images.map((entry) => basenameUrl(entry.href)).join(" ")
  ].join(" ");
  const productContext = [
    product.title,
    product.imageAlt,
    filenameBase(product.image),
    product.handle
  ].join(" ");
  const productSourceOverlap = tokenOverlap(productContext, sourceContext);
  const trustedReasons = (sourceMap?.matchReasons || []).some((reason) => /manual|product-image-id=svg-id|slug-exact|title-exact/i.test(reason));
  if (sourceMap && !objectFallback && productSourceOverlap < 0.2 && !trustedReasons) {
    addWarning(warnings, "source", `low-product-to-svg-token-overlap:${productSourceOverlap.toFixed(2)}`);
  }

  const gates = {
    source: gateResult("source", issues, warnings),
    layout: gateResult("layout", issues, warnings),
    text: gateResult("text", issues, warnings),
    teamLogo: gateResult("teamLogo", issues, warnings),
    clipart: gateResult("clipart", issues, warnings),
    playerIcon: gateResult("playerIcon", issues, warnings)
  };
  if (!parsed) {
    for (const gate of ["layout", "text", "teamLogo", "clipart", "playerIcon"]) {
      gates[gate] = "blocked";
    }
  }
  const gateWeights = { source: 20, layout: 25, text: 20, teamLogo: 12, clipart: 10, playerIcon: 13 };
  const gateScores = Object.fromEntries(Object.entries(gates).map(([gate, status]) => {
    const weight = gateWeights[gate] || 0;
    if (status === "pass") return [gate, weight];
    if (status === "review") return [gate, weight * 0.75];
    if (status === "fail") return [gate, weight * 0.35];
    return [gate, 0];
  }));
  const score = Math.round(Object.values(gateScores).reduce((sum, value) => sum + value, 0) * 10) / 10;
  const status = issues.some((issue) => issue.severity === "critical")
    ? "critical"
    : issues.length
      ? "fail"
      : warnings.length
        ? "review"
        : "pass";

  return {
    product,
    sourceMap,
    config,
    parsed,
    templateMeta,
    templateSvg,
    layoutSvgName,
    resolvedSvgPath,
    productShape,
    productSport,
    templateShape,
    templateSport,
    productSourceOverlap,
    objectFallback,
    gates,
    gateScores,
    status,
    score,
    issues,
    warnings
  };
}

function issueKey(item) {
  return item.code.split(":")[0];
}

function countBy(items, keyFn) {
  return items.reduce((map, item) => {
    const key = keyFn(item) || "(blank)";
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => String(row[header] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)
  ].join("\n");
}

function rowForResult(result) {
  const parsed = result.parsed;
  const config = result.config || {};
  return {
    Handle: result.product.handle || "",
    Title: result.product.title || "",
    Status: result.product.status || "",
    Shape: result.productShape || "",
    Sport: result.productSport || "",
    "QA Status": result.status,
    "QA Score": result.score,
    "Source Gate": result.gates.source,
    "Layout Gate": result.gates.layout,
    "Text Gate": result.gates.text,
    "Team Logo Gate": result.gates.teamLogo,
    "Clipart Gate": result.gates.clipart,
    "Player Icon Gate": result.gates.playerIcon,
    "Template SVG": result.templateSvg || "",
    "Local SVG": result.resolvedSvgPath || "",
    "Source Page": result.sourceMap?.sourceTemplatePage || result.templateMeta.sourcePage || "",
    "Source Score": result.sourceMap?.matchScore || "",
    "Source Margin": result.sourceMap?.matchMargin || "",
    "Source Reasons": (result.sourceMap?.matchReasons || []).join("; "),
    "Editable Mode": result.sourceMap?.editableLayerMode || result.sourceMap?.sourceType || "",
    "Fully Editable": result.sourceMap?.fullyEditable ? "YES" : "NO",
    "Source SVG Editable": result.sourceMap?.sourceEditable ? "YES" : "NO",
    "Product/Source Token Overlap": result.productSourceOverlap.toFixed(2),
    "Expected Layers": config.layerCount || expectedTotalLayers(config),
    "SVG Layers": parsed?.counts.totalLayer ?? "",
    "Expected Text Layers": config.textLayerCount || "",
    "SVG Text Layers": parsed?.counts.textLayer ?? "",
    "Expected Player Icons": config.playerIconCount || "",
    "SVG Player Icons": parsed?.counts.playerIcon ?? "",
    "Expected Player Texts": config.playerTextCount || "",
    "SVG Player Texts": parsed?.counts.playerText ?? "",
    "Expected Team Logo": config.teamLogoCount || "",
    "SVG Team Logo": parsed?.counts.teamLogo ?? "",
    "Expected Clipart": config.clipartCount || "",
    "SVG Clipart": parsed?.counts.clipart ?? "",
    "Expected Background": config.backgroundCount || "",
    "SVG Background": parsed?.counts.background ?? "",
    "Issues": result.issues.map((item) => item.code).join("; "),
    "Warnings": result.warnings.map((item) => item.code).join("; "),
    "Product Image": result.product.image || "",
    "Design URL": designUrl(result.product)
  };
}

function qaTagsForResult(result) {
  const tags = [
    `tbd:graphic-qa:${result.status}`,
    `tbd:graphic-score:${String(Math.round(result.score)).padStart(3, "0")}`,
    `tbd:graphic-source:${result.gates.source}`,
    `tbd:graphic-layout:${result.gates.layout}`,
    `tbd:graphic-text:${result.gates.text}`,
    `tbd:graphic-logo:${result.gates.teamLogo}`,
    `tbd:graphic-clipart:${result.gates.clipart}`,
    `tbd:graphic-player-icon:${result.gates.playerIcon}`
  ];
  if (result.issues.some((issue) => issue.code.startsWith("missing-source-svg-map"))) tags.push("tbd:needs-source-svg");
  if (result.objectFallback) tags.push("tbd:editable-object-fallback", "tbd:needs-native-source-svg");
  if (result.status !== "pass") tags.push("tbd:needs-graphic-review");
  return tags.join(", ");
}

const GATE_CATEGORY = {
  source: "Template",
  layout: "Template",
  text: "Player Text",
  teamLogo: "Team Logo",
  clipart: "Clip Art",
  playerIcon: "Accessory"
};

function severityLabel(severity) {
  if (severity === "critical") return "Critical";
  if (severity === "warn") return "Minor";
  return "Major";
}

function resultLabel(status) {
  if (status === "pass") return "PASS";
  if (status === "review") return "NEEDS REVIEW";
  return "FAIL";
}

function sentenceFromCode(code) {
  return compact(String(code || "")
    .replace(/:[^;]+$/g, "")
    .replace(/-/g, " ")
    .replace(/\bsvg\b/gi, "SVG")
    .replace(/\burl\b/gi, "URL"));
}

function expectedActualFromCode(code) {
  const countMatch = String(code || "").match(/^(.+)-count-mismatch:expected-([0-9]+)-actual-([0-9]+)/);
  if (countMatch) {
    return {
      expected: `${countMatch[1]} count ${countMatch[2]}`,
      actual: `${countMatch[1]} count ${countMatch[3]}`
    };
  }
  const mismatch = String(code || "").match(/^([^:]+):expected-([^:;]+)-actual-([^:;]+)/);
  if (mismatch) {
    return {
      expected: mismatch[2],
      actual: mismatch[3]
    };
  }
  const shape = String(code || "").match(/^shape-mismatch:product-([^:;]+)-svg-([^:;]+)/);
  if (shape) {
    return {
      expected: `SVG shape ${shape[1]}`,
      actual: `SVG shape ${shape[2]}`
    };
  }
  const sport = String(code || "").match(/^sport-mismatch:product-([^:;]+)-svg-([^:;]+)/);
  if (sport) {
    return {
      expected: `SVG sport ${sport[1]}`,
      actual: `SVG sport ${sport[2]}`
    };
  }
  const background = String(code || "").match(/^background-too-small:([0-9.]+)/);
  if (background) {
    return {
      expected: "Background fills the printable artboard/mask",
      actual: `Background cover ratio ${background[1]}`
    };
  }
  return {
    expected: "Product render matches verified source SVG and layer config",
    actual: String(code || "")
  };
}

function recommendedFixForCode(code, gate) {
  if (/missing-source-svg-map|missing-template-svg-reference|missing-local-template-svg/.test(code)) {
    return "Map this product handle to its exact source SVG, download the SVG into public/svg-layer-templates, and update public/team-banner-source-svg-map.json.";
  }
  if (/shape-mismatch|sport-mismatch|low-product-to-svg-token-overlap/.test(code)) {
    return "Replace the mapped SVG with the exact TeamBannerSports design for this Shopify product; do not use title fallback when duplicate designs exist.";
  }
  if (/background-too-small|missing-background-object|background-not-first-image/.test(code)) {
    return "Use the real background object from the source SVG and make it cover the artboard/masked printable area.";
  }
  if (/player-icon|accessory/.test(code) || gate === "playerIcon") {
    return "Use the accessory/player-icon object from the SVG as an independent draggable layer, not a tile or crop from the full product image.";
  }
  if (/team-name|team-logo/.test(code) || gate === "teamLogo") {
    return "Use the exact team logo object from the source SVG and preserve its coordinates, scale, rotation, opacity, and layer order.";
  }
  if (/clipart/.test(code) || gate === "clipart") {
    return "Use the exact clip-art object from the source SVG and preserve its coordinates, scale, rotation, opacity, and layer order.";
  }
  if (/text|player|coach|mom|year/.test(code) || gate === "text") {
    return "Rebuild text layers from the SVG layout metadata so player names, coach/team-mom text, font, stroke, and positions match the product.";
  }
  return "Review the product source SVG, product layer config, and generated layer object list, then correct the mismatched object metadata.";
}

function issueDetail(item, result, isWarning = false) {
  const expectedActual = expectedActualFromCode(item.code);
  return {
    Severity: isWarning ? "Minor" : severityLabel(item.severity),
    Category: GATE_CATEGORY[item.gate] || "Product Object",
    Description: sentenceFromCode(item.code),
    Expected: expectedActual.expected,
    Actual: expectedActual.actual,
    Evidence: [
      `handle=${result.product.handle || ""}`,
      `productId=${result.product.id || ""}`,
      `localSvg=${result.resolvedSvgPath || ""}`,
      `sourcePage=${result.sourceMap?.sourceTemplatePage || result.templateMeta.sourcePage || ""}`,
      `gate=${item.gate}`,
      `code=${item.code}`
    ].filter(Boolean).join(" | "),
    "Recommended fix": recommendedFixForCode(item.code, item.gate)
  };
}

function detailedResult(result) {
  const issues = [
    ...result.issues.map((issue) => issueDetail(issue, result, false)),
    ...result.warnings.map((warning) => issueDetail({ ...warning, severity: "warn" }, result, true))
  ];
  return {
    "Test ID / product ID": result.product.id || result.product.handle || "",
    "Product handle": result.product.handle || "",
    "Product title": result.product.title || "",
    "Final image path": result.product.image || "",
    "Expected SVG template": result.templateSvg || result.layoutSvgName || "",
    "Local SVG path": result.resolvedSvgPath || "",
    Result: resultLabel(result.status),
    "QA score": result.score,
    "Editable mode": result.sourceMap?.editableLayerMode || result.sourceMap?.sourceType || "",
    "Fully editable": Boolean(result.sourceMap?.fullyEditable),
    "Native source SVG editable": Boolean(result.sourceMap?.sourceEditable),
    Gates: result.gates,
    "Source page": result.sourceMap?.sourceTemplatePage || result.templateMeta.sourcePage || "",
    "Product configuration JSON": {
      shape: result.productShape,
      sport: result.productSport,
      layerConfig: result.config || {}
    },
    "Parsed SVG metadata": result.parsed ? {
      viewBox: result.parsed.viewBox,
      counts: result.parsed.counts,
      templateShape: result.templateShape,
      templateSport: result.templateSport
    } : null,
    "Issues found": issues,
    "Recommended fix": issues[0]?.["Recommended fix"] || "No fix needed."
  };
}

fs.mkdirSync(outputDir, { recursive: true });

const productManifest = readJson(manifestPath, { products: [] });
const sourceMapData = readJson(sourceMapPath, { maps: {} });
const svgManifest = readJson(svgManifestPath, { templates: [] });
const products = productManifest.products || [];
const activeProducts = products
  .filter((product) => product.status === "active" && product.type !== "easify_addon_product")
  .filter((product) => {
    const shape = normalizeShape([product.title, product.handle].join(" ")) || normalizeShape([product.shape, product.tags, product.type].join(" "));
    const sport = inferSport([product.title, product.handle].join(" ")) || inferSport(product.tags);
    if (shapeFilter.length && !shapeFilter.includes(shape)) return false;
    if (sportFilter.length && !sportFilter.includes(sport)) return false;
    return true;
  });
const sourceMaps = Array.isArray(sourceMapData.maps)
  ? Object.fromEntries(sourceMapData.maps.filter((item) => item && item.handle).map((item) => [item.handle, item]))
  : sourceMapData.maps || {};
const templateMetaByName = new Map((svgManifest.templates || []).map((template) => [String(template.name || ""), template]));

const results = activeProducts.map((product) => summarizeProduct(product, sourceMaps[product.handle], templateMetaByName));
const rows = results.map(rowForResult);
const failedRows = rows.filter((row) => row["QA Status"] !== "pass");
const criticalRows = rows.filter((row) => row["QA Status"] === "critical");
const missingSourceRows = rows.filter((row) => String(row.Issues || "").includes("missing-source-svg-map"));
const objectFallbackRows = rows.filter((row) => row["Editable Mode"] === "product-image-object-fallback");
const tagRows = results.map((result) => ({
  Handle: result.product.handle,
  Title: result.product.title,
  "Graphic QA Tags": qaTagsForResult(result),
  "QA Status": result.status,
  "QA Score": result.score,
  Issues: result.issues.map((item) => item.code).join("; ")
}));
const detailedRows = results.map(detailedResult);

writeCsv(path.join(outputDir, "product-graphic-qa.csv"), rows);
writeCsv(path.join(outputDir, "product-graphic-qa-failures.csv"), failedRows);
writeCsv(path.join(outputDir, "product-graphic-qa-critical.csv"), criticalRows);
writeCsv(path.join(outputDir, "product-graphic-qa-needs-source-map.csv"), missingSourceRows);
writeCsv(path.join(outputDir, "product-graphic-qa-object-fallbacks.csv"), objectFallbackRows);
writeCsv(path.join(outputDir, "product-graphic-qa-tags.csv"), tagRows);
fs.writeFileSync(path.join(outputDir, "product-graphic-qa-detailed.json"), JSON.stringify(detailedRows, null, 2) + "\n");

const statusCounts = countBy(results, (result) => result.status);
const gateCounts = {};
for (const gate of ["source", "layout", "text", "teamLogo", "clipart", "playerIcon"]) {
  gateCounts[gate] = countBy(results, (result) => result.gates[gate]);
}
const allIssues = results.flatMap((result) => result.issues);
const allWarnings = results.flatMap((result) => result.warnings);
const issueCounts = countBy(allIssues, issueKey);
const warningCounts = countBy(allWarnings, issueKey);
const passRate = results.length ? (statusCounts.pass || 0) / results.length * 100 : 0;
const qaReadyRate = results.length ? ((statusCounts.pass || 0) + (statusCounts.review || 0)) / results.length * 100 : 0;
const verifiedSourceProducts = results.filter((result) => (
  Boolean(result.parsed)
  && result.sourceMap
  && String(result.sourceMap.matchStatus || "").toLowerCase() === "matched"
));
const exactSourceProducts = verifiedSourceProducts;
const nativeSourceSvgProducts = verifiedSourceProducts.filter((result) => !result.objectFallback && result.sourceMap?.sourceEditable !== false);
const objectFallbackProducts = results.filter((result) => result.objectFallback);
const fullyEditableObjectProducts = results.filter((result) => result.sourceMap?.fullyEditable);
const flattenedFallbackProducts = results.filter((result) => (
  /product-image.*fallback/i.test(String(result.sourceMap?.matchConfidence || result.sourceMap?.sourceType || ""))
  && !result.sourceMap?.fullyEditable
));
const exactSourceRate = results.length ? exactSourceProducts.length / results.length * 100 : 0;
const nativeSourceSvgRate = results.length ? nativeSourceSvgProducts.length / results.length * 100 : 0;
const fullyEditableObjectRate = results.length ? fullyEditableObjectProducts.length / results.length * 100 : 0;
const exactSourceMeetsTarget = exactSourceRate >= targetPassRate;
const qaReadyMeetsTarget = qaReadyRate >= targetPassRate;

const summary = {
  generatedAt: new Date().toISOString(),
  targetPassRate,
  manifestPath,
  sourceMapPath,
  svgManifestPath,
  outputDir,
  filters: {
    sport: sportFilter,
    shape: shapeFilter
  },
  totalProducts: products.length,
  activeDesignProducts: activeProducts.length,
  sourceMappedProducts: results.filter((result) => Boolean(result.sourceMap)).length,
  exactSourceProducts: exactSourceProducts.length,
  nativeSourceSvgProducts: nativeSourceSvgProducts.length,
  objectFallbackProducts: objectFallbackProducts.length,
  fullyEditableObjectProducts: fullyEditableObjectProducts.length,
  flattenedFallbackProducts: flattenedFallbackProducts.length,
  missingSourceMapProducts: missingSourceRows.length,
  statusCounts,
  gateCounts,
  issueCounts,
  warningCounts,
  passRate: Math.round(passRate * 100) / 100,
  qaReadyRate: Math.round(qaReadyRate * 100) / 100,
  exactSourceRate: Math.round(exactSourceRate * 100) / 100,
  nativeSourceSvgRate: Math.round(nativeSourceSvgRate * 100) / 100,
  fullyEditableObjectRate: Math.round(fullyEditableObjectRate * 100) / 100,
  exactSourceMeetsTarget,
  qaReadyMeetsTarget,
  meetsTarget: qaReadyMeetsTarget,
  outputFiles: {
    summary: path.join(outputDir, "product-graphic-qa-summary.json"),
    report: path.join(outputDir, "product-graphic-qa-report.md"),
    fullCsv: path.join(outputDir, "product-graphic-qa.csv"),
    failuresCsv: path.join(outputDir, "product-graphic-qa-failures.csv"),
    criticalCsv: path.join(outputDir, "product-graphic-qa-critical.csv"),
    needsSourceMapCsv: path.join(outputDir, "product-graphic-qa-needs-source-map.csv"),
    objectFallbacksCsv: path.join(outputDir, "product-graphic-qa-object-fallbacks.csv"),
    tagsCsv: path.join(outputDir, "product-graphic-qa-tags.csv")
    ,
    detailedJson: path.join(outputDir, "product-graphic-qa-detailed.json")
  },
  topFailures: failedRows.slice(0, 80).map((row) => ({
    handle: row.Handle,
    title: row.Title,
    status: row["QA Status"],
    score: row["QA Score"],
    sourceGate: row["Source Gate"],
    layoutGate: row["Layout Gate"],
    textGate: row["Text Gate"],
    teamLogoGate: row["Team Logo Gate"],
    clipartGate: row["Clipart Gate"],
    playerIconGate: row["Player Icon Gate"],
    issues: row.Issues
  }))
};

fs.writeFileSync(path.join(outputDir, "product-graphic-qa-summary.json"), JSON.stringify(summary, null, 2) + "\n");

const topIssueRows = Object.entries(issueCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([Issue, Count]) => ({ Issue, Count }));
const topWarningRows = Object.entries(warningCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([Warning, Count]) => ({ Warning, Count }));
const knownHandles = [
  "all-star-baseball-banner",
  "all-star-02-baseball-banner",
  "all-star-11-baseball-banner",
  "alligators-softball-banner-2",
  "alligators-2-softball-banner",
  "super-heroes-soccer-banner",
  "all-star-2-triangle-baseball-banners"
];
const knownRows = rows.filter((row) => knownHandles.includes(row.Handle));

const report = `# Product Graphic Accuracy QA

Generated: ${summary.generatedAt}

## Verdict

This audit checks every active Team Sport Banners product against the source SVG/object data that the design tool uses. It validates source mapping, layout/background, text layout, team logo, clipart, and player-icon object layers.

- Active design products: ${summary.activeDesignProducts}
- Source-mapped products: ${summary.sourceMappedProducts}
- Exact/no-guess visual products: ${summary.exactSourceProducts} (${summary.exactSourceRate}%)
- Native editable source-SVG products: ${summary.nativeSourceSvgProducts} (${summary.nativeSourceSvgRate}%)
- Editable object fallback products: ${summary.objectFallbackProducts}
- Fully editable object-layer products: ${summary.fullyEditableObjectProducts} (${summary.fullyEditableObjectRate}%)
- Flattened non-editable fallback products: ${summary.flattenedFallbackProducts}
- Missing source map products: ${summary.missingSourceMapProducts}
- Fully passing products: ${statusCounts.pass || 0} (${summary.passRate}%)
- Review-only products: ${statusCounts.review || 0}
- Failed products: ${statusCounts.fail || 0}
- Critical products: ${statusCounts.critical || 0}
- ${targetPassRate}% exact-source target met: ${summary.exactSourceMeetsTarget ? "YES" : "NO"}
- ${targetPassRate}% fail-free QA-ready target met: ${summary.qaReadyMeetsTarget ? "YES" : "NO"}

## QA Gates

${markdownTable(["Gate", "Pass", "Review", "Fail", "Critical", "Blocked"], Object.entries(gateCounts).map(([Gate, counts]) => ({
  Gate,
  Pass: counts.pass || 0,
  Review: counts.review || 0,
  Fail: counts.fail || 0,
  Critical: counts.critical || 0,
  Blocked: counts.blocked || 0
})))}

## Top Failure Types

${topIssueRows.length ? markdownTable(["Issue", "Count"], topIssueRows) : "No blocking issues found."}

## Top Review Warnings

${topWarningRows.length ? markdownTable(["Warning", "Count"], topWarningRows) : "No review warnings found."}

## Known Product Spot Checks

${knownRows.length ? markdownTable([
  "Handle",
  "Title",
  "QA Status",
  "QA Score",
  "Source Gate",
  "Layout Gate",
  "Text Gate",
  "Team Logo Gate",
  "Clipart Gate",
  "Player Icon Gate",
  "Issues"
], knownRows.map((row) => ({
  Handle: row.Handle,
  Title: row.Title,
  "QA Status": row["QA Status"],
  "QA Score": row["QA Score"],
  "Source Gate": row["Source Gate"],
  "Layout Gate": row["Layout Gate"],
  "Text Gate": row["Text Gate"],
  "Team Logo Gate": row["Team Logo Gate"],
  "Clipart Gate": row["Clipart Gate"],
  "Player Icon Gate": row["Player Icon Gate"],
  Issues: row.Issues
}))) : "Known products were not present in the current manifest."}

## Process

1. Load \`${PRODUCT_MANIFEST}\` for every Shopify product exported into the tool.
2. Load \`${SOURCE_MAP_PATH}\` so products use verified source SVGs instead of guessing from a flattened PNG.
3. Parse each local SVG in \`${SVG_DIR}\` and classify actual objects into background, team logo, clipart, player icon, player text, year text, and header text.
4. Compare SVG object counts and roles against each product's expected layer config.
5. Fail the product if it has no source SVG map, no local SVG, wrong shape/sport, missing background, mismatched text/player counts, missing team logo/clipart, or player icons that reuse the background image.
6. Produce CSVs for the full audit, failures, critical failures, source-map gaps, and Shopify QA tags.

## Output Files

- Full CSV: \`${summary.outputFiles.fullCsv}\`
- Failures CSV: \`${summary.outputFiles.failuresCsv}\`
- Critical CSV: \`${summary.outputFiles.criticalCsv}\`
- Needs source map CSV: \`${summary.outputFiles.needsSourceMapCsv}\`
- Editable object fallback CSV: \`${summary.outputFiles.objectFallbacksCsv}\`
- QA tags CSV: \`${summary.outputFiles.tagsCsv}\`
- Detailed per-product JSON: \`${summary.outputFiles.detailedJson}\`
- Summary JSON: \`${summary.outputFiles.summary}\`

## Rerun

\`\`\`bash
npm run qa:graphic
npm run qa:graphic:strict
\`\`\`

Strict mode exits non-zero until the pass rate is at least ${targetPassRate}%.
`;

fs.writeFileSync(path.join(outputDir, "product-graphic-qa-report.md"), report);

console.log(JSON.stringify(summary, null, 2));
if (strictMode && !summary.meetsTarget) {
  process.exitCode = 2;
}
