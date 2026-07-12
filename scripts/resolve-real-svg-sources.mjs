import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SVG_DIR = "public/svg-layer-templates";
const SVG_MANIFEST = "public/svg-layer-templates.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const CANDIDATE_MAP_PATH = "public/team-banner-source-svg-candidates.json";
const OUTPUT_DIR = "outputs/real-svg-source-discovery-20260523";
const SITEMAP_URL = "https://teambannersports.com/sitemap.xml";
const SOURCE_ORIGIN = "https://teambannersports.com";
const ADMIN_DESIGN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";

const args = new Set(process.argv.slice(2));
const shouldDownloadAll = args.has("--download-all");
const shouldApply = args.has("--apply");
const shouldRefreshSitemap = !args.has("--local-only");
const maxDownloadArg = process.argv.find((arg) => arg.startsWith("--max-download="));
const maxDownload = maxDownloadArg ? Number(maxDownloadArg.split("=")[1]) : Infinity;

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
  if (/\bhomeplate\b|\bhome plate\b|\bhome\b|\bplate\b/.test(text)) return "homeplatepennant";
  if (/\btriangle\b|\bpennant\b/.test(text)) return "triangle";
  return "rectangle";
}

function filenameBase(value) {
  const raw = String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
  return decodeURIComponent(raw).replace(/\.[a-z0-9]+$/i, "");
}

function productImageDesignId(value) {
  const base = filenameBase(value);
  const match = base.match(/^([0-9]{10,})(?:$|[-_])/);
  return match ? match[1] : "";
}

function svgUrlForId(id) {
  return `${ADMIN_DESIGN_BASE}/${id}.svg`;
}

function localSvgPath(id) {
  return path.join(SVG_DIR, `${id}.svg`);
}

function publicSvgUrl(id) {
  return `/svg-layer-templates/${id}.svg`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function writeCsv(file, headers, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n") + "\n");
}

async function fetchText(url, { retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "TeamBannerDesignerSourceResolver/1.0" }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw lastError || new Error(`Could not fetch ${url}`);
}

function extractSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter(Boolean);
}

function extractAdminDesignIds(text) {
  const ids = new Set();
  const raw = String(text || "");
  const patterns = [
    /https:\/\/lct-designs\.s3\.us-west-1\.amazonaws\.com\/admin-designs\/([0-9]{10,})\.(?:svg|png|jpe?g)/gi,
    /https%3A%2F%2Flct-designs\.s3\.us-west-1\.amazonaws\.com%2Fadmin-designs%2F([0-9]{10,})\.(?:svg|png|jpe?g)/gi,
    /admin-designs\/([0-9]{10,})\.(?:svg|png|jpe?g)/gi
  ];
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) ids.add(match[1]);
  }
  return [...ids];
}

function extractTeamBannerLinks(text, baseUrl) {
  const links = new Set();
  for (const match of String(text || "").matchAll(/\bhref=["']([^"']*\/team-banner\/[^"']+)["']/gi)) {
    try {
      links.add(new URL(decodeHtml(match[1]), baseUrl).href.replace(/\/$/, ""));
    } catch {
      // Ignore malformed links.
    }
  }
  return [...links];
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
  const next = Number.parseFloat(String(attr[name]).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(next) ? next : fallback;
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

function transformedArea(matrix, width, height) {
  return Math.abs((matrix[0] * matrix[3] - matrix[1] * matrix[2]) * width * height);
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

function imageTags(svg) {
  return [...String(svg || "").matchAll(/<image\b[^>]*>/gi)].map((match) => match[0]);
}

function imageHref(tag) {
  const attr = attrs(tag);
  return attr.href || attr["xlink:href"] || "";
}

function textRole(text) {
  const clean = compact(text);
  if (/^player$/i.test(clean)) return "player";
  if (/^year$/i.test(clean)) return "year";
  return "header";
}

function analyzeTemplateSvg(svg) {
  const images = imageTags(svg).map((tag, index) => {
    const attr = attrs(tag);
    const href = attr.href || attr["xlink:href"] || "";
    const width = attrNumber(attr, "width", 1);
    const height = attrNumber(attr, "height", 1);
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

  const hrefCounts = images.reduce((map, entry) => {
    if (entry.href) map.set(entry.href, (map.get(entry.href) || 0) + 1);
    return map;
  }, new Map());

  const background = images.find((entry) => /background|locked/.test(entry.className))
    || images.slice().sort((a, b) => b.area - a.area)[0]
    || images[0]
    || null;
  if (background) background.role = "background";

  const texts = [...String(svg || "").matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)]
    .map((match) => compact(match[0].replace(/<[^>]+>/g, " ")))
    .filter(Boolean);
  const playerTextCount = texts.filter((text) => textRole(text) === "player").length;
  const yearTextCount = texts.filter((text) => textRole(text) === "year").length;
  const headerTextCount = texts.filter((text) => textRole(text) === "header").length;

  const repeated = [...hrefCounts.entries()]
    .filter(([href, count]) => count > 1 && (!background || href !== background.href))
    .sort((a, b) => b[1] - a[1])[0] || ["", 0];
  if (repeated[1] > 1) {
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
    teamLogo: images.find((entry) => entry.role === "teamLogo") || null,
    clipart: images.filter((entry) => entry.role === "clipart"),
    playerIcons: images.filter((entry) => entry.role === "playerIcon"),
    playerTextCount,
    yearTextCount,
    headerTextCount
  };
}

function templateTitle(file, info, svg) {
  const hrefs = imageTags(svg).map(imageHref).filter(Boolean);
  const best = hrefs[0] || info.cover?.url || file;
  return compact(filenameBase(best)
    .replace(/[-_]+1[0-9]{9,}$/g, "")
    .replace(/[-_]+(?:background|banner|bg|hem|pole|pocket|triangle|home|plate|softball|baseball|soccer|acc|accessory|libs|assets)\b/gi, " ")
    .replace(/[-_]+/g, " ")) || file.replace(/\.svg$/i, "");
}

function readTemplateMeta(file, sourceHint = {}) {
  const svg = fs.readFileSync(path.join(SVG_DIR, file), "utf8");
  const info = parseDataInfo(svg);
  const analysis = analyzeTemplateSvg(svg);
  const hrefs = analysis.images.map((entry) => entry.href).filter(Boolean);
  const text = [file, info.type, info.name, sourceHint.title, sourceHint.sourcePage, ...hrefs, ...analysis.texts].join(" ");
  const id = file.replace(/\.svg$/i, "");
  return {
    name: id,
    title: templateTitle(file, info, svg),
    url: publicSvgUrl(id),
    sourceUrl: sourceHint.sourceUrl || svgUrlForId(id),
    sourcePage: sourceHint.sourcePage || "",
    sourceTitle: sourceHint.title || "",
    sourceCategoryUrl: sourceHint.categoryUrl || "",
    type: sourceHint.type || mapType(info.type || text),
    sport: sourceHint.sport || inferSport(text),
    playerCount: analysis.playerTextCount,
    imageCount: analysis.images.length,
    textCount: analysis.texts.length,
    headerTextCount: analysis.headerTextCount,
    yearTextCount: analysis.yearTextCount,
    backgroundCount: analysis.background ? 1 : 0,
    teamLogoCount: analysis.teamLogo ? 1 : 0,
    clipartCount: analysis.clipart.length,
    backgroundUrl: analysis.background?.href || hrefs[0] || "",
    teamLogoUrl: analysis.teamLogo?.href || "",
    clipartUrl: analysis.clipart[0]?.href || "",
    playerIconUrl: analysis.playerIcons[0]?.href || "",
    playerIconCount: analysis.playerIcons.length
  };
}

function templateLayerCounts(template) {
  const imageCount = Number(template.imageCount || 0);
  const textCount = Number(template.textCount || 0);
  const playerCount = Number(template.playerCount || 0);
  const playerIconCount = Number(template.playerIconCount || 0);
  const yearTextCount = Number(template.yearTextCount || 0);
  const headerTextCount = Number.isFinite(Number(template.headerTextCount))
    ? Number(template.headerTextCount)
    : Math.max(0, textCount - playerCount - yearTextCount);
  return {
    layerCount: imageCount + textCount,
    backgroundCount: Number(template.backgroundCount || (imageCount ? 1 : 0)),
    teamLogoCount: Number(template.teamLogoCount || (template.teamLogoUrl ? 1 : 0)),
    clipartCount: Number(template.clipartCount || 0),
    playerCount,
    playerIconCount,
    playerTextCount: playerCount,
    textLayerCount: textCount,
    headerTextCount,
    yearTextCount
  };
}

function sourceLayerConfig(existing, template) {
  return {
    ...(existing || {}),
    ...templateLayerCounts(template),
    ...(template.backgroundUrl ? { backgroundUrl: template.backgroundUrl, backgroundSource: "svg-template-asset" } : {}),
    ...(template.teamLogoUrl ? { logoUrl: template.teamLogoUrl, logoSource: "svg-template-asset" } : {}),
    ...(template.clipartUrl ? { clipartUrl: template.clipartUrl, clipartSource: "svg-template-asset" } : {}),
    ...(template.playerIconUrl ? { accessoryUrl: template.playerIconUrl, accessorySource: "svg-template-asset" } : {}),
    layoutSource: "svg-template",
    layoutSvg: template.name,
    layoutSvgUrl: template.url,
    assetMatchStatus: "svg-template-direct-product-image-id",
    objectLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    needsSourceSvg: false
  };
}

function promoteMapRow(row, product, template, sourceIndex) {
  return {
    ...row,
    handle: row.handle || product.handle,
    title: row.title || product.title,
    shape: template.type || row.productShape || row.shape || product.shape,
    productShape: row.productShape || product.shape,
    sourceShape: template.type || "",
    templateSvg: template.url,
    sourceTemplatePage: sourceIndex.get(template.name)?.sourcePage || template.sourcePage || row.sourceTemplatePage || "",
    sourceTemplateSvg: template.sourceUrl || svgUrlForId(template.name),
    matchStatus: "matched",
    matchScore: Math.max(Number(row.matchScore || 0), 1000),
    matchMargin: Math.max(Number(row.matchMargin || 0), 1000),
    matchReasons: [
      "real-source-svg-direct-product-image-id",
      ...(Array.isArray(row.matchReasons) ? row.matchReasons.filter((reason) => !/fallback|missing|nearest/i.test(reason)) : [])
    ],
    matchConfidence: "verified",
    sourceType: "source-svg",
    editableLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    visualExact: true,
    needsSourceSvg: false,
    productImage: row.productImage || product.image,
    productUrl: row.productUrl || product.url || `https://teamsportbanners.com/products/${product.handle}`,
    layerConfig: sourceLayerConfig(row.layerConfig || product.layerConfig || {}, template)
  };
}

async function collectSourceIndex() {
  const sourceIndex = new Map();
  const pages = [];
  if (!shouldRefreshSitemap) return { sourceIndex, pages, adminIds: new Set() };

  const sitemap = await fetchText(SITEMAP_URL);
  const locs = extractSitemapLocs(sitemap);
  const categoryUrls = locs.filter((url) => (
    /(baseball-banners|softball-banners|soccer-banners)/.test(url)
    && !/\/team-banner\//.test(url)
  ));
  const adminIds = new Set();

  for (const categoryUrl of categoryUrls) {
    try {
      const html = await fetchText(categoryUrl);
      const ids = extractAdminDesignIds(html);
      const teamLinks = extractTeamBannerLinks(html, categoryUrl);
      const sport = inferSport(categoryUrl);
      const type = mapType(categoryUrl);
      for (const id of ids) {
        adminIds.add(id);
        const previous = sourceIndex.get(id) || {};
        sourceIndex.set(id, {
          id,
          sourceUrl: svgUrlForId(id),
          categoryUrl: previous.categoryUrl || categoryUrl,
          sourcePage: previous.sourcePage || teamLinks.find((link) => cleanText(link).includes(cleanText(id))) || "",
          sport: previous.sport || sport,
          type: previous.type || type
        });
      }
      pages.push({ url: categoryUrl, status: "ok", adminIds: ids.length, teamLinks: teamLinks.length });
    } catch (error) {
      pages.push({ url: categoryUrl, status: "fetch-error", error: error.message, adminIds: 0, teamLinks: 0 });
    }
  }

  return { sourceIndex, pages, adminIds };
}

async function downloadSvg(id) {
  const file = localSvgPath(id);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return { id, status: "exists", file };
  const svg = await fetchText(svgUrlForId(id));
  if (!/<svg[\s>]/i.test(svg)) throw new Error(`Downloaded ${id} is not SVG`);
  fs.mkdirSync(SVG_DIR, { recursive: true });
  fs.writeFileSync(file, svg);
  return { id, status: "downloaded", file };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SVG_DIR, { recursive: true });

  const productManifest = JSON.parse(fs.readFileSync(PRODUCT_MANIFEST, "utf8"));
  const products = Array.isArray(productManifest.products) ? productManifest.products : [];
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const sourceMap = JSON.parse(fs.readFileSync(SOURCE_MAP_PATH, "utf8"));
  const candidateMap = fs.existsSync(CANDIDATE_MAP_PATH) ? JSON.parse(fs.readFileSync(CANDIDATE_MAP_PATH, "utf8")) : null;
  const sourceRows = Array.isArray(sourceMap.maps) ? sourceMap.maps : Object.values(sourceMap.maps || {});
  const candidateRows = candidateMap && Array.isArray(candidateMap.maps) ? candidateMap.maps : [];

  const { sourceIndex, pages, adminIds } = await collectSourceIndex();
  const localBefore = new Set(fs.readdirSync(SVG_DIR).filter((file) => file.endsWith(".svg")).map((file) => file.replace(/\.svg$/i, "")));
  const fallbackRows = sourceRows.filter((row) => (
    row.editableLayerMode === "product-image-object-fallback"
    || row.matchConfidence === "product-image-object-fallback"
    || row.sourceType === "product-image-object-fallback"
  ));
  const directFallbacks = fallbackRows
    .map((row) => {
      const product = productsByHandle.get(row.handle) || {};
      const id = productImageDesignId(row.productImage || product.image);
      return { row, product, id };
    })
    .filter((entry) => entry.id);

  const idsToDownload = new Set();
  if (shouldDownloadAll) {
    for (const id of adminIds) {
      if (!localBefore.has(id)) idsToDownload.add(id);
    }
  }
  for (const entry of directFallbacks) idsToDownload.add(entry.id);

  const downloadRows = [];
  let downloadedCount = 0;
  for (const id of idsToDownload) {
    if (downloadedCount >= maxDownload) {
      downloadRows.push({ id, status: "skipped-max-download", sourceUrl: svgUrlForId(id) });
      continue;
    }
    try {
      const result = await downloadSvg(id);
      downloadRows.push({ id, status: result.status, sourceUrl: svgUrlForId(id) });
      if (result.status === "downloaded") downloadedCount += 1;
    } catch (error) {
      downloadRows.push({ id, status: "download-error", error: error.message, sourceUrl: svgUrlForId(id) });
    }
  }

  const localAfter = new Set(fs.readdirSync(SVG_DIR).filter((file) => file.endsWith(".svg")).map((file) => file.replace(/\.svg$/i, "")));
  const templates = [...localAfter]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((id) => {
      const hint = sourceIndex.get(id) || {};
      return readTemplateMeta(`${id}.svg`, {
        sourceUrl: svgUrlForId(id),
        sourcePage: hint.sourcePage || "",
        categoryUrl: hint.categoryUrl || "",
        sport: hint.sport || "",
        type: hint.type || ""
      });
    });
  const templatesById = new Map(templates.map((template) => [template.name, template]));

  const resolved = [];
  const unresolved = [];
  const updatedRows = sourceRows.map((row) => {
    const product = productsByHandle.get(row.handle);
    const id = productImageDesignId(row.productImage || product?.image);
    const isFallback = (
      row.editableLayerMode === "product-image-object-fallback"
      || row.matchConfidence === "product-image-object-fallback"
      || row.sourceType === "product-image-object-fallback"
    );
    if (!product || !isFallback || !id || !templatesById.has(id)) {
      if (isFallback) {
        unresolved.push({
          handle: row.handle,
          title: row.title,
          id,
          reason: !id ? "no-numeric-product-image-id" : !templatesById.has(id) ? "source-svg-not-downloaded" : "not-fallback",
          productImage: row.productImage || product?.image || ""
        });
      }
      return row;
    }
    const template = templatesById.get(id);
    resolved.push({
      handle: row.handle,
      title: row.title,
      id,
      templateSvg: template.url,
      sourceTemplateSvg: template.sourceUrl,
      sourceTemplatePage: sourceIndex.get(id)?.sourcePage || "",
      playerCount: template.playerCount,
      layerCount: template.imageCount + template.textCount
    });
    return promoteMapRow(row, product, template, sourceIndex);
  });

  const updatedCandidateRows = candidateRows.map((row) => {
    const product = productsByHandle.get(row.handle);
    const id = productImageDesignId(row.productImage || product?.image);
    const isFallback = (
      row.editableLayerMode === "product-image-object-fallback"
      || row.matchConfidence === "product-image-object-fallback"
      || row.sourceType === "product-image-object-fallback"
    );
    if (!product || !isFallback || !id || !templatesById.has(id)) return row;
    return promoteMapRow(row, product, templatesById.get(id), sourceIndex);
  });

  const updatedProducts = products.map((product) => {
    const id = productImageDesignId(product.image);
    if (!id || !templatesById.has(id)) return product;
    const rowWasResolved = resolved.some((entry) => entry.handle === product.handle);
    if (!rowWasResolved) return product;
    const template = templatesById.get(id);
    return {
      ...product,
      templateSvg: template.url,
      layerConfig: {
        ...(product.layerConfig || {}),
        ...sourceLayerConfig(product.layerConfig || {}, template),
        layoutSvgUrl: template.url
      }
    };
  });

  const countRows = (rows) => rows.reduce((acc, row) => {
    const key = row.editableLayerMode || row.matchConfidence || row.sourceType || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const nextSourceMap = {
    ...sourceMap,
    generatedAt: new Date().toISOString(),
    sourceEditableCount: updatedRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
    objectFallbackCount: updatedRows.filter((row) => row.editableLayerMode === "product-image-object-fallback").length,
    flattenedFallbackCount: updatedRows.filter((row) => /flattened/i.test(row.editableLayerMode || row.matchConfidence || "")).length,
    maps: updatedRows
  };
  const nextCandidateMap = candidateMap ? {
    ...candidateMap,
    generatedAt: nextSourceMap.generatedAt,
    sourceEditableCount: updatedCandidateRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
    objectFallbackCount: updatedCandidateRows.filter((row) => row.editableLayerMode === "product-image-object-fallback").length,
    flattenedFallbackCount: updatedCandidateRows.filter((row) => /flattened/i.test(row.editableLayerMode || row.matchConfidence || "")).length,
    maps: updatedCandidateRows
  } : null;

  fs.writeFileSync(SVG_MANIFEST, JSON.stringify({ templates }, null, 2) + "\n");
  writeCsv(path.join(OUTPUT_DIR, "downloaded-real-svg-sources.csv"), ["id", "status", "sourceUrl", "error"], downloadRows);
  writeCsv(path.join(OUTPUT_DIR, "resolved-product-source-svgs.csv"), [
    "handle", "title", "id", "templateSvg", "sourceTemplateSvg", "sourceTemplatePage", "playerCount", "layerCount"
  ], resolved);
  writeCsv(path.join(OUTPUT_DIR, "unresolved-product-source-svgs.csv"), [
    "handle", "title", "id", "reason", "productImage"
  ], unresolved);
  writeCsv(path.join(OUTPUT_DIR, "source-category-pages.csv"), ["url", "status", "adminIds", "teamLinks", "error"], pages);

  const summary = {
    generatedAt: nextSourceMap.generatedAt,
    apply: shouldApply,
    downloaded: downloadRows.filter((row) => row.status === "downloaded").length,
    downloadErrors: downloadRows.filter((row) => row.status === "download-error").length,
    sitemapAdminIds: adminIds.size,
    localSvgBefore: localBefore.size,
    localSvgAfter: localAfter.size,
    fallbackBefore: fallbackRows.length,
    directFallbacks: directFallbacks.length,
    resolvedToRealSourceSvg: resolved.length,
    unresolvedFallbacksAfterDirectPass: unresolved.length,
    sourceMapCountsAfter: countRows(updatedRows),
    outputs: {
      outputDir: OUTPUT_DIR,
      downloaded: path.join(OUTPUT_DIR, "downloaded-real-svg-sources.csv"),
      resolved: path.join(OUTPUT_DIR, "resolved-product-source-svgs.csv"),
      unresolved: path.join(OUTPUT_DIR, "unresolved-product-source-svgs.csv")
    }
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  if (shouldApply) {
    fs.writeFileSync(SOURCE_MAP_PATH, JSON.stringify(nextSourceMap, null, 2) + "\n");
    if (nextCandidateMap) fs.writeFileSync(CANDIDATE_MAP_PATH, JSON.stringify(nextCandidateMap, null, 2) + "\n");
    fs.writeFileSync(PRODUCT_MANIFEST, JSON.stringify({ ...productManifest, generatedAt: nextSourceMap.generatedAt, products: updatedProducts }, null, 2) + "\n");
  } else {
    fs.writeFileSync(path.join(OUTPUT_DIR, "team-banner-source-svg-map.preview.json"), JSON.stringify(nextSourceMap, null, 2) + "\n");
    if (nextCandidateMap) fs.writeFileSync(path.join(OUTPUT_DIR, "team-banner-source-svg-candidates.preview.json"), JSON.stringify(nextCandidateMap, null, 2) + "\n");
    fs.writeFileSync(path.join(OUTPUT_DIR, "team-banner-products.preview.json"), JSON.stringify({ ...productManifest, generatedAt: nextSourceMap.generatedAt, products: updatedProducts }, null, 2) + "\n");
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
