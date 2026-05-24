import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SVG_MANIFEST = "public/svg-layer-templates.json";
const SVG_DIR = "public/svg-layer-templates";
const PUBLIC_SOURCE_MAP = "public/team-banner-source-svg-map.json";
const PUBLIC_CANDIDATE_MAP = "public/team-banner-source-svg-candidates.json";
const OUTPUT_DIR = "outputs/source-svg-match-audit-20260523";
const ADMIN_DESIGN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";
const SOURCE_ORIGIN = "https://teambannersports.com";

const CATEGORY_SEEDS = [
  ["baseball", "rectangle", "/baseball-banners/hem-grommets-baseball-banners/"],
  ["baseball", "polepocket", "/baseball-banners/pole-pocket-baseball-banners/"],
  ["baseball", "triangle", "/baseball-banners/triangle-baseball-pennants/"],
  ["baseball", "homeplatepennant", "/baseball-banners/home-plate-baseball-pennants/"],
  ["softball", "rectangle", "/softball-banners/hem-grommets-softball-banners/"],
  ["softball", "polepocket", "/softball-banners/pole-pocket-softball-banners/"],
  ["softball", "triangle", "/softball-banners/triangle-softball-pennants/"],
  ["softball", "homeplatepennant", "/softball-banners/home-plate-softball-banners/"],
  ["soccer", "rectangle", "/soccer-banners/hem-grommets-soccer-banners/"],
  ["soccer", "polepocket", "/soccer-banners/pole-pocket-soccer-banners/"],
  ["soccer", "triangle", "/soccer-banners/triangle-soccer-pennants/"],
  ["soccer", "homeplatepennant", "/soccer-banners/home-plate-soccer-banners/"]
].map(([sport, type, url]) => ({ sport, type, url: new URL(url, SOURCE_ORIGIN).href }));

const args = new Set(process.argv.slice(2));
const shouldCrawl = !args.has("--local-only");
const shouldDownload = !args.has("--no-download");
const shouldApply = args.has("--apply");
const maxPagesArg = process.argv.find((arg) => arg.startsWith("--max-pages="));
const maxPagesPerCategory = maxPagesArg ? Number(maxPagesArg.split("=")[1]) : 80;
const tokenCache = new Map();

const MANUAL_SOURCE_OVERRIDES = {
  // These two Shopify products use swapped naming compared with the source
  // template library. Keep them pinned to the visually verified SVGs so the
  // matcher does not choose the plausible but wrong slug-only result.
  "all-star-baseball-banner": {
    svg: "1641354165414",
    reason: "manual-visual-match:shopify-allstar-baseball-product",
    fallbackAssets: {
      backgroundUrl: "https://lct-designs.s3.us-west-1.amazonaws.com/assets/libs/935487f9716520789a9bc32ddef9d3cb.svg",
      backgroundSource: "svg-template-asset"
    }
  },
  "all-star-02-baseball-banner": {
    svg: "1641444115064",
    reason: "manual-visual-match:shopify-allstar2-baseball-product"
  }
};

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function deburr(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanText(value) {
  return compact(deburr(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/\b0+(\d+)\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " "));
}

function slug(value) {
  return cleanText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function tokenSet(value) {
  const cacheKey = String(value || "");
  if (tokenCache.has(cacheKey)) return tokenCache.get(cacheKey);
  const stop = new Set([
    "banner", "banners", "pennant", "pennants", "home", "plate", "homeplate",
    "hem", "grommets", "grommet", "pole", "pocket", "triangle", "baseball",
    "softball", "soccer", "custom", "team", "sports", "sport", "copy",
    "picture", "pictures", "image", "images", "background", "backgrounds"
  ]);
  const next = new Set(cleanText(value).split(" ").filter((token) => token && !stop.has(token)));
  tokenCache.set(cacheKey, next);
  return next;
}

function teamIdentityText(value) {
  return cleanText(value)
    .replace(/\b(?:baseball|softball|soccer|banner|banners|pennant|pennants|triangle|home|plate|homeplate|hem|grommets|grommet|pole|pocket)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamIdentitySlug(value) {
  return slug(teamIdentityText(value));
}

function overlapTokenSets(left, right) {
  if (!left.size || !right.size) return 0;
  const hits = [...left].filter((token) => right.has(token)).length;
  return hits / Math.max(left.size, right.size);
}

function overlapScore(a, b) {
  return overlapTokenSets(tokenSet(a), tokenSet(b));
}

function filenameBase(value) {
  const raw = String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
  return raw.replace(/\.[a-z0-9]+$/i, "");
}

function numericDesignId(value) {
  const base = filenameBase(value);
  const match = base.match(/^([0-9]{10,})(?:$|[-_])/) || String(value || "").match(/admin-designs\/([0-9]+)\.(?:svg|png)/i);
  return match ? match[1] : "";
}

function sourceDesignSlug(template) {
  const page = String(template.sourcePage || "");
  if (!page) return "";
  try {
    const last = new URL(page).pathname.split("/").filter(Boolean).pop() || "";
    return slug(last.replace(/-\d+$/g, ""));
  } catch {
    return "";
  }
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

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function resolveSourceUrl(url, base = SOURCE_ORIGIN) {
  try {
    return new URL(decodeHtml(url), base).href;
  } catch {
    return "";
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /\bhref=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    const href = resolveSourceUrl(match[1], baseUrl);
    if (href) links.push(href);
  }
  return [...new Set(links)];
}

function extractTeamBannerLinks(html, baseUrl) {
  return extractLinks(html, baseUrl)
    .filter((url) => /^https:\/\/teambannersports\.com\/team-banner\//i.test(url))
    .map((url) => url.replace(/\/$/, ""))
    .filter((url) => !/[?#]/.test(url));
}

function extractAdminSvgUrls(text) {
  const urls = new Set();
  const raw = String(text || "");
  const full = /https:\/\/lct-designs\.s3\.us-west-1\.amazonaws\.com\/admin-designs\/([0-9]+)\.(?:svg|png)/gi;
  const encoded = /https%3A%2F%2Flct-designs\.s3\.us-west-1\.amazonaws\.com%2Fadmin-designs%2F([0-9]+)\.(?:svg|png)/gi;
  const relative = /admin-designs\/([0-9]+)\.(?:svg|png)/gi;
  for (const match of raw.matchAll(full)) urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  for (const match of raw.matchAll(encoded)) urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  for (const match of raw.matchAll(relative)) urls.add(`${ADMIN_DESIGN_BASE}/${match[1]}.svg`);
  if (/^https?:\/\/.+\.svg(?:[?#].*)?$/i.test(raw.trim())) urls.add(raw.trim());
  return [...urls];
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
        headers: { "user-agent": "TeamBannerDesignerLayoutAudit/1.0" }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError || new Error(`Could not fetch ${url}`);
}

function pageTitle(html) {
  const h1 = (html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  return compact(decodeHtml((h1 || title || "").replace(/<[^>]+>/g, " ")));
}

function pageTags(html) {
  const tags = [];
  for (const match of html.matchAll(/Tags:\s*<\/?[^>]*>\s*([^<\n]+)/gi)) {
    tags.push(compact(decodeHtml(match[1])));
  }
  return [...new Set(tags.filter(Boolean))].join(" ");
}

function inferSport(text) {
  const clean = cleanText(text);
  if (/\bbaseball\b/.test(clean)) return "baseball";
  if (/\bsoftball\b/.test(clean) || /\bsofball\b/.test(clean)) return "softball";
  if (/\bsoccer\b/.test(clean)) return "soccer";
  return "";
}

function mapType(text) {
  const clean = cleanText(text);
  if (/\bpole\b|\bpocket\b/.test(clean)) return "polepocket";
  if (/\bhome\b|\bplate\b|\bhomeplate\b/.test(clean)) return "homeplatepennant";
  if (/\btriangle\b|\bpennant\b/.test(clean)) return "triangle";
  return "rectangle";
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

function svgImageTags(svg) {
  return [...svg.matchAll(/<image\b[^>]*>/gi)].map((match) => match[0]);
}

function imageHref(tag) {
  return (tag.match(/\b(?:xlink:href|href)=["']([^"']+)["']/i) || [])[1] || "";
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

function textRole(text) {
  const clean = compact(text);
  if (/^player$/i.test(clean)) return "player";
  if (/^year$/i.test(clean)) return "year";
  return "header";
}

function analyzeTemplateSvg(svg) {
  const imageEntries = svgImageTags(svg).map((tag, index) => {
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
  const hrefCounts = imageEntries.reduce((map, entry) => {
    if (entry.href) map.set(entry.href, (map.get(entry.href) || 0) + 1);
    return map;
  }, new Map());
  const background = imageEntries.find((entry) => /background|locked/.test(entry.className))
    || imageEntries.slice().sort((a, b) => b.area - a.area)[0]
    || imageEntries[0]
    || null;
  if (background) background.role = "background";

  const textContents = [...svg.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/gi)]
    .map((match) => compact(match[0].replace(/<[^>]+>/g, " ")))
    .filter(Boolean);
  const playerTextCount = textContents.filter((text) => textRole(text) === "player").length;
  const yearTextCount = textContents.filter((text) => textRole(text) === "year").length;
  const headerTextCount = textContents.filter((text) => textRole(text) === "header").length;

  const repeated = [...hrefCounts.entries()]
    .filter(([href, count]) => count > 1 && (!background || href !== background.href))
    .sort((a, b) => b[1] - a[1])[0] || ["", 0];
  if (repeated[1] > 1) {
    imageEntries
      .filter((entry) => entry.href === repeated[0] && entry !== background)
      .forEach((entry) => { entry.role = "playerIcon"; });
  }

  const artEntries = imageEntries
    .filter((entry) => entry.role === "svg-layer" && entry !== background)
    .sort((a, b) => b.area - a.area);
  const teamCandidate = artEntries
    .filter((entry) => entry.ratio > 1.25)
    .sort((a, b) => b.ratio - a.ratio)[0]
    || artEntries[0]
    || null;
  if (teamCandidate) teamCandidate.role = "teamLogo";

  const neededPlayerIcons = playerTextCount - imageEntries.filter((entry) => entry.role === "playerIcon").length;
  if (neededPlayerIcons > 0 && playerTextCount >= 2) {
    const playerCandidates = imageEntries
      .filter((entry) => entry.role === "svg-layer" && entry !== background)
      .sort((a, b) => a.area - b.area);
    if (playerCandidates.length >= neededPlayerIcons) {
      playerCandidates
        .slice(0, neededPlayerIcons)
        .forEach((entry) => { entry.role = "playerIcon"; });
    }
  }

  imageEntries
    .filter((entry) => entry.role === "svg-layer" && entry !== background)
    .forEach((entry) => { entry.role = "clipart"; });

  return {
    images: imageEntries,
    textContents,
    background,
    teamLogo: imageEntries.find((entry) => entry.role === "teamLogo") || null,
    clipart: imageEntries.filter((entry) => entry.role === "clipart"),
    playerIcons: imageEntries.filter((entry) => entry.role === "playerIcon"),
    playerTextCount,
    yearTextCount,
    headerTextCount
  };
}

function templateTitle(file, info, svg) {
  const hrefs = svgImageTags(svg).map(imageHref).filter(Boolean);
  const best = hrefs[0] || info.cover?.url || file;
  return compact(filenameBase(best)
    .replace(/[-_]+1[0-9]{9,}$/g, "")
    .replace(/[-_]+(?:background|banner|bg|hem|pole|pocket|triangle|home|plate|softball|baseball|soccer|acc|accessory|libs|assets)\b/gi, " ")
    .replace(/[-_]+/g, " ")) || file.replace(/\.svg$/i, "");
}

function readTemplateMeta(file, hint = {}) {
  const svg = fs.readFileSync(path.join(SVG_DIR, file), "utf8");
  const info = parseDataInfo(svg);
  const analysis = analyzeTemplateSvg(svg);
  const hrefs = analysis.images.map((entry) => entry.href).filter(Boolean);
  const playerCount = analysis.playerTextCount;
  const sourceText = [file, info.type, info.name, hint.title, hint.tags, hint.sourcePage, ...hrefs, ...analysis.textContents].join(" ");
  return {
    name: file.replace(/\.svg$/i, ""),
    title: templateTitle(file, info, svg),
    url: `/svg-layer-templates/${file}`,
    sourceUrl: hint.sourceUrl || `${ADMIN_DESIGN_BASE}/${file}`,
    sourcePage: hint.sourcePage || "",
    sourceTitle: hint.title || "",
    sourceTags: hint.tags || "",
    type: hint.type || mapType(info.type || sourceText),
    sport: hint.sport || inferSport(sourceText),
    playerCount,
    imageCount: analysis.images.length,
    textCount: analysis.textContents.length,
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

function templateRoleFallbackAssets(template) {
  if (!template || !template.name) return {};
  const file = path.join(SVG_DIR, `${template.name}.svg`);
  if (!fs.existsSync(file)) return {};
  const svg = fs.readFileSync(file, "utf8");
  const analysis = analyzeTemplateSvg(svg);
  return {
    ...(analysis.background?.href ? { backgroundUrl: analysis.background.href, backgroundSource: "svg-template-asset" } : {}),
    ...(analysis.teamLogo?.href ? { logoUrl: analysis.teamLogo.href, logoSource: "svg-template-asset" } : {}),
    ...(analysis.clipart[0]?.href ? { clipartUrl: analysis.clipart[0].href, clipartSource: "svg-template-asset" } : {}),
    ...(analysis.playerIcons[0]?.href ? { accessoryUrl: analysis.playerIcons[0].href, accessorySource: "svg-template-asset" } : {})
  };
}

function templateLayerCounts(template) {
  const imageCount = Number(template.imageCount || 0);
  const textCount = Number(template.textCount || 0);
  const playerCount = Number(template.playerCount || 0);
  const playerIconCount = Number(template.playerIconCount || 0);
  const yearTextCount = Number(template.yearTextCount || 0);
  const backgroundCount = Number(template.backgroundCount || (imageCount ? 1 : 0));
  const teamLogoCount = Number(template.teamLogoCount || (template.teamLogoUrl ? 1 : 0));
  const clipartCount = Number(template.clipartCount || 0);
  const headerTextCount = Number.isFinite(Number(template.headerTextCount))
    ? Number(template.headerTextCount)
    : Math.max(0, textCount - playerCount - yearTextCount);
  return {
    ...(imageCount || textCount ? { layerCount: imageCount + textCount } : {}),
    ...(playerCount ? { playerCount, playerTextCount: playerCount } : {}),
    ...(playerIconCount ? { playerIconCount } : {}),
    ...(textCount ? { textLayerCount: textCount } : {}),
    ...(textCount ? { headerTextCount, yearTextCount } : {}),
    ...(imageCount ? { backgroundCount, teamLogoCount, clipartCount } : {})
  };
}

async function crawlCategory(seed) {
  const pages = [];
  const templates = [];
  let nextUrl = seed.url;
  const seenPages = new Set();

  for (let page = 1; page <= maxPagesPerCategory && nextUrl && !seenPages.has(nextUrl); page += 1) {
    seenPages.add(nextUrl);
    let html = "";
    try {
      html = await fetchText(nextUrl);
    } catch (error) {
      pages.push({ url: nextUrl, sport: seed.sport, type: seed.type, status: "fetch-error", error: error.message });
      break;
    }
    const links = extractTeamBannerLinks(html, nextUrl);
    pages.push({ url: nextUrl, sport: seed.sport, type: seed.type, status: "ok", links: links.length });
    templates.push(...links.map((url) => ({ sourcePage: url, sport: seed.sport, type: seed.type, categoryUrl: seed.url })));
    const nextLink = extractLinks(html, nextUrl).find((url) => {
      const clean = url.replace(/\/$/, "");
      return clean.startsWith(seed.url.replace(/\/$/, "") + "/") && /\/[0-9]+$/.test(clean) && !seenPages.has(url);
    });
    if (nextLink) nextUrl = nextLink;
    else {
      const fallback = new URL(String(page + 1) + "/", seed.url).href;
      nextUrl = links.length ? fallback : "";
    }
  }

  return { pages, templates };
}

async function inspectSourceTemplate(entry) {
  try {
    const html = await fetchText(entry.sourcePage);
    const svgUrl = extractAdminSvgUrls(html)[0] || "";
    const title = pageTitle(html);
    const tags = pageTags(html);
    return { ...entry, svgUrl, title, tags, status: svgUrl ? "ok" : "missing-svg" };
  } catch (error) {
    return { ...entry, svgUrl: "", title: "", tags: "", status: "fetch-error", error: error.message };
  }
}

async function downloadSvg(svgUrl) {
  const file = filenameBase(svgUrl) + ".svg";
  const fullPath = path.join(SVG_DIR, file);
  if (fs.existsSync(fullPath)) return file;
  const svg = await fetchText(svgUrl);
  fs.writeFileSync(fullPath, svg);
  return file;
}

function productSport(product) {
  return inferSport([product.title, product.type, product.tags, product.handle].join(" "));
}

function productTeamKey(product) {
  const config = product.layerConfig || {};
  return cleanText(config.logoTitle || config.assetKey || product.title || product.handle);
}

function templateSearchText(template) {
  return [
    template.name,
    template.title,
    template.sourceTitle,
    template.sourceTags,
    template.sourcePage,
    template.backgroundUrl,
    template.playerIconUrl
  ].join(" ");
}

function prepareTemplate(template) {
  const searchText = templateSearchText(template);
  const sourceSlug = sourceDesignSlug(template);
  return {
    ...template,
    _searchText: searchText,
    _sourceSlug: sourceSlug,
    _teamSlug: teamIdentitySlug([sourceSlug, template.sourceTitle || template.title].join(" ")),
    _tokens: tokenSet(searchText)
  };
}

function prepareProduct(product) {
  const config = product.layerConfig || {};
  const productText = [product.title, product.handle, productTeamKey(product)].join(" ");
  const assetText = [config.assetKey, config.logoTitle, config.backgroundAssetName, config.logoAssetName, config.clipartAssetName, config.accessoryAssetName].join(" ");
  return {
    product,
    productId: numericDesignId(product.image),
    productSport: productSport(product),
    productSlug: slug(product.handle || product.title),
    teamSlug: teamIdentitySlug([product.handle, product.title, productTeamKey(product)].join(" ")),
    productTokens: tokenSet(productText),
    assetTokens: tokenSet(assetText),
    playerTarget: Math.max(Number(config.playerIconCount || 0), Number(config.playerTextCount || 0), Number(config.playerCount || 0))
  };
}

function shapeCompatible(productShape, templateType) {
  const shape = String(productShape || "").toLowerCase();
  const type = String(templateType || "").toLowerCase();
  if (!shape || !type) return false;
  if (shape === type) return true;
  if ((shape === "homeplate" || shape === "homeplatepennant") && (type === "homeplate" || type === "homeplatepennant")) return true;
  if (shape === "rectangle" && type === "polepocket") return false;
  return false;
}

function scoreTemplate(productMeta, template) {
  const { product } = productMeta;
  const productId = productMeta.productId;
  const templateId = template.name;
  const exactId = Boolean(productId && productId === templateId);
  const productSportValue = productMeta.productSport;
  let score = 0;
  const reasons = [];

  if (exactId) {
    score += 120;
    reasons.push("product-image-id=svg-id");
  }
  const productSlug = productMeta.productSlug;
  const sourceSlug = template._sourceSlug || "";
  const exactSourceSlug = Boolean(productSlug && sourceSlug && productSlug === sourceSlug);
  if (exactSourceSlug) {
    score += 70;
    reasons.push("source-page-slug-exact");
  }
  const teamSlugExact = Boolean(productMeta.teamSlug && template._teamSlug && productMeta.teamSlug === template._teamSlug);
  if (teamSlugExact) {
    score += 54;
    reasons.push("team-slug-exact");
  }

  const titleOverlap = overlapTokenSets(productMeta.productTokens, template._tokens || tokenSet(templateSearchText(template)));
  score += Math.round(titleOverlap * 52);
  if (titleOverlap >= 0.55) reasons.push(`title-overlap:${titleOverlap.toFixed(2)}`);

  if (productSportValue && productSportValue === template.sport) {
    score += 22;
    reasons.push("sport-match");
  }
  if (shapeCompatible(product.shape, template.type)) {
    score += 24;
    reasons.push("shape-match");
  }

  const playerTarget = productMeta.playerTarget;
  if (playerTarget && Number(template.playerCount || 0) === playerTarget) {
    score += 16;
    reasons.push("player-count-match");
  } else if (playerTarget && template.playerCount) {
    score -= Math.min(22, Math.abs(playerTarget - template.playerCount) * 3);
    reasons.push(`player-count-diff:${playerTarget}-${template.playerCount}`);
  }

  const assetOverlap = overlapTokenSets(productMeta.assetTokens, template._tokens || tokenSet(templateSearchText(template)));
  score += Math.round(assetOverlap * 42);
  if (assetOverlap >= 0.5) reasons.push(`asset-overlap:${assetOverlap.toFixed(2)}`);

  return { score, reasons, exactId, exactSourceSlug, teamSlugExact };
}

function candidateTemplates(productMeta, templates, byName, bySourceSlug) {
  if (productMeta.productId && byName.has(productMeta.productId)) return [byName.get(productMeta.productId)];
  const exactSlugMatches = productMeta.productSlug ? bySourceSlug.get(productMeta.productSlug) || [] : [];
  if (exactSlugMatches.length) return exactSlugMatches;
  const product = productMeta.product;
  const sameShapeSport = templates.filter((template) => (
    shapeCompatible(product.shape, template.type)
    && (!productMeta.productSport || !template.sport || productMeta.productSport === template.sport)
  ));
  const productTokens = new Set([...productMeta.productTokens, ...productMeta.assetTokens]);
  const tokenMatched = sameShapeSport.filter((template) => [...productTokens].some((token) => template._tokens && template._tokens.has(token)));
  if (tokenMatched.length) return tokenMatched;
  return sameShapeSport.length ? sameShapeSport : templates;
}

function bestMatch(product, templates, indexes) {
  const productMeta = prepareProduct(product);
  const override = MANUAL_SOURCE_OVERRIDES[product.handle || ""];
  if (override && indexes.byName.has(override.svg)) {
    const template = indexes.byName.get(override.svg);
    const scored = scoreTemplate(productMeta, template);
    return {
      template,
      score: Math.max(999, scored.score),
      reasons: [override.reason, ...scored.reasons],
      exactId: scored.exactId,
      exactSourceSlug: scored.exactSourceSlug,
      margin: 999,
      status: "matched",
      runnerUp: null
    };
  }
  const candidates = candidateTemplates(productMeta, templates, indexes.byName, indexes.bySourceSlug);
  const scored = candidates.map((template) => ({ template, ...scoreTemplate(productMeta, template) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  const next = scored[1] || null;
  if (!best) return null;
  const margin = best.score - (next ? next.score : 0);
  const manualMatch = best.reasons.some((reason) => /manual-visual-match/i.test(reason));
  const strongSourcePageMatch = Boolean(
    best.exactSourceSlug
    && best.score >= 120
    && margin >= 20
    && best.reasons.some((reason) => reason === "sport-match")
    && best.reasons.some((reason) => reason === "shape-match")
    && best.reasons.some((reason) => reason === "player-count-match")
  );
  if (strongSourcePageMatch && !best.reasons.includes("source-page-verified-match")) {
    best.reasons.push("source-page-verified-match");
  }
  const exactSourceMatch = Boolean(best.exactId || manualMatch || strongSourcePageMatch);
  const status = exactSourceMatch && best.score >= 92 && margin >= 8 ? "matched"
    : best.score >= 72 && margin >= 8 ? "review"
      : "candidate";
  return { ...best, margin, status, runnerUp: next };
}

function layerMapFromMatch(product, match, { includeTemplateAssets = true } = {}) {
  const template = match.template;
  const override = MANUAL_SOURCE_OVERRIDES[product.handle || ""];
  const templateLayerConfig = includeTemplateAssets
    ? { ...templateLayerCounts(template), ...templateRoleFallbackAssets(template) }
    : templateLayerCounts(template);
  const overrideLayerConfig = override ? (override.fallbackAssets || {}) : {};
  const assetMatchStatus = match.status === "matched" ? "svg-template" : `svg-template-${match.status}`;
  return {
    handle: product.handle,
    title: product.title,
    shape: match.status === "matched" ? (template.type || product.shape) : product.shape,
    productShape: product.shape,
    sourceShape: template.type || "",
    templateSvg: template.url,
    sourceTemplatePage: template.sourcePage,
    sourceTemplateSvg: template.sourceUrl,
    matchStatus: match.status,
    matchScore: match.score,
    matchMargin: match.margin,
    matchReasons: match.reasons,
    matchConfidence: match.status === "matched" ? "verified" : match.status === "review" ? "needs-review" : "candidate",
    productImage: product.image,
    productUrl: product.url || `https://teamsportbanners.com/products/${product.handle}`,
    layerConfig: {
      ...(product.layerConfig || {}),
      ...templateLayerConfig,
      ...overrideLayerConfig,
      layoutSource: "svg-template",
      layoutSvg: template.name,
      layoutSvgUrl: template.url,
      assetMatchStatus
    }
  };
}

async function main() {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(PRODUCT_MANIFEST, "utf8"));
  const products = Array.isArray(manifest.products) ? manifest.products : [];
  const sourcePageByUrl = new Map();
  const crawlPages = [];

  if (shouldCrawl) {
    for (const seed of CATEGORY_SEEDS) {
      const result = await crawlCategory(seed);
      crawlPages.push(...result.pages);
      for (const entry of result.templates) {
        if (!sourcePageByUrl.has(entry.sourcePage)) sourcePageByUrl.set(entry.sourcePage, entry);
      }
    }

    const sourceEntries = [];
    const allPages = [...sourcePageByUrl.values()];
    for (let index = 0; index < allPages.length; index += 1) {
      sourceEntries.push(await inspectSourceTemplate(allPages[index]));
      if ((index + 1) % 100 === 0) console.log(`Inspected ${index + 1}/${allPages.length} source template pages`);
    }

    const hintsByFile = new Map();
    for (const entry of sourceEntries) {
      if (!entry.svgUrl) continue;
      const file = shouldDownload ? await downloadSvg(entry.svgUrl) : filenameBase(entry.svgUrl) + ".svg";
      hintsByFile.set(file, {
        sourceUrl: entry.svgUrl,
        sourcePage: entry.sourcePage,
        title: entry.title,
        tags: entry.tags,
        sport: entry.sport,
        type: entry.type
      });
    }

    const existingManifest = fs.existsSync(SVG_MANIFEST) ? JSON.parse(fs.readFileSync(SVG_MANIFEST, "utf8")) : { templates: [] };
    for (const template of existingManifest.templates || []) {
      const file = filenameBase(template.url) + ".svg";
      if (!hintsByFile.has(file)) {
        hintsByFile.set(file, {
          sourceUrl: template.sourceUrl,
          sourcePage: template.sourcePage,
          title: template.sourceTitle || template.title,
          tags: template.sourceTags || "",
          sport: template.sport,
          type: template.type
        });
      }
    }

    const templates = fs.readdirSync(SVG_DIR)
      .filter((file) => /\.svg$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => readTemplateMeta(file, hintsByFile.get(file) || {}));
    fs.writeFileSync(SVG_MANIFEST, JSON.stringify({ templates }, null, 2) + "\n");

    writeCsv(path.join(OUTPUT_DIR, "source-crawl-pages.csv"), ["url", "sport", "type", "status", "links", "error"], crawlPages);
    writeCsv(path.join(OUTPUT_DIR, "source-template-pages.csv"), [
      "sourcePage", "sport", "type", "status", "svgUrl", "title", "tags", "categoryUrl", "error"
    ], sourceEntries);
  } else {
    const existingManifest = fs.existsSync(SVG_MANIFEST) ? JSON.parse(fs.readFileSync(SVG_MANIFEST, "utf8")) : { templates: [] };
    const hintsByFile = new Map();
    for (const template of existingManifest.templates || []) {
      const file = filenameBase(template.url) + ".svg";
      hintsByFile.set(file, {
        sourceUrl: template.sourceUrl,
        sourcePage: template.sourcePage,
        title: template.sourceTitle || template.title,
        tags: template.sourceTags || "",
        sport: template.sport,
        type: template.type
      });
    }
    const templates = fs.readdirSync(SVG_DIR)
      .filter((file) => /\.svg$/i.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((file) => readTemplateMeta(file, hintsByFile.get(file) || {}));
    fs.writeFileSync(SVG_MANIFEST, JSON.stringify({ templates }, null, 2) + "\n");
  }

  const svgManifest = JSON.parse(fs.readFileSync(SVG_MANIFEST, "utf8"));
  const templates = (svgManifest.templates || []).filter((template) => template.url).map(prepareTemplate);
  const byName = new Map(templates.map((template) => [template.name, template]));
  const bySourceSlug = templates.reduce((map, template) => {
    if (!template._sourceSlug) return map;
    const list = map.get(template._sourceSlug) || [];
    list.push(template);
    map.set(template._sourceSlug, list);
    return map;
  }, new Map());
  const indexes = { byName, bySourceSlug };
  const logRows = [];
  const maps = [];
  const allProductMaps = [];

  for (const product of products) {
    const match = bestMatch(product, templates, indexes);
    const row = {
      handle: product.handle,
      title: product.title,
      productUrl: product.url || `https://teamsportbanners.com/products/${product.handle}`,
      productImage: product.image,
      productShape: product.shape,
      productSport: productSport(product),
      expectedPlayers: Math.max(Number(product.layerConfig?.playerIconCount || 0), Number(product.layerConfig?.playerTextCount || 0), Number(product.layerConfig?.playerCount || 0)),
      matchStatus: match ? match.status : "missing",
      score: match ? match.score : 0,
      margin: match ? match.margin : 0,
      layoutSvg: match ? match.template.name : "",
      layoutSvgUrl: match ? match.template.url : "",
      sourceTemplatePage: match ? match.template.sourcePage : "",
      sourceTemplateSvg: match ? match.template.sourceUrl : "",
      sourceTitle: match ? match.template.sourceTitle || match.template.title : "",
      sourceSport: match ? match.template.sport : "",
      sourceType: match ? match.template.type : "",
      sourcePlayers: match ? match.template.playerCount : "",
      reasons: match ? match.reasons.join(";") : "",
      runnerUpSvg: match?.runnerUp?.template?.name || "",
      runnerUpScore: match?.runnerUp?.score || ""
    };
    logRows.push(row);
    if (match && match.template) {
      const fullMap = layerMapFromMatch(product, match, { includeTemplateAssets: true });
      allProductMaps.push(fullMap);
      if (match.status === "matched") maps.push(fullMap);
    }
  }

  writeCsv(path.join(OUTPUT_DIR, "product-svg-match-log.csv"), [
    "handle", "title", "productUrl", "productImage", "productShape", "productSport", "expectedPlayers",
    "matchStatus", "score", "margin", "layoutSvg", "layoutSvgUrl", "sourceTemplatePage", "sourceTemplateSvg",
    "sourceTitle", "sourceSport", "sourceType", "sourcePlayers", "reasons", "runnerUpSvg", "runnerUpScore"
  ], logRows);
  writeCsv(path.join(OUTPUT_DIR, "products-needing-source-svg-review.csv"), [
    "handle", "title", "productUrl", "productShape", "productSport", "expectedPlayers",
    "matchStatus", "score", "margin", "layoutSvg", "sourceTemplatePage", "reasons", "runnerUpSvg", "runnerUpScore"
  ], logRows.filter((row) => row.matchStatus !== "matched"));

  const verifiedMaps = maps;
  const completeMaps = allProductMaps;
  const matchedCount = verifiedMaps.length;
  const reviewCount = logRows.filter((row) => row.matchStatus === "review").length;
  const candidateCount = logRows.filter((row) => row.matchStatus === "candidate").length;
  const missingCount = logRows.filter((row) => !row.layoutSvg).length;
  const sourceMap = {
    generatedAt: new Date().toISOString(),
    source: "teambannersports.com",
    productCount: products.length,
    mappedCount: completeMaps.length,
    matchedCount,
    verifiedMatchedCount: matchedCount,
    reviewCount,
    candidateCount,
    missingCount,
    productionPolicy: "This file now contains one best SVG map entry for every product that has a candidate. The design tool only uses matchStatus=matched entries by default; review/candidate entries are present for QA completeness and exact-image fallback safety.",
    maps: completeMaps
  };
  const candidateMap = {
    generatedAt: sourceMap.generatedAt,
    source: "teambannersports.com",
    productCount: products.length,
    mappedCount: completeMaps.length,
    matchedCount,
    reviewCount,
    candidateCount,
    missingCount,
    productionPolicy: "This file contains the best SVG candidate for every product. Review/candidate rows are not treated as verified.",
    maps: completeMaps
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "team-banner-source-svg-map.json"), JSON.stringify(sourceMap, null, 2) + "\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "team-banner-source-svg-candidates.json"), JSON.stringify(candidateMap, null, 2) + "\n");
  fs.writeFileSync(PUBLIC_SOURCE_MAP, JSON.stringify(sourceMap, null, 2) + "\n");
  fs.writeFileSync(PUBLIC_CANDIDATE_MAP, JSON.stringify(candidateMap, null, 2) + "\n");

  if (shouldApply) {
    const byHandle = new Map(verifiedMaps.map((map) => [map.handle, map]));
    const nextProducts = products.map((product) => {
      const map = byHandle.get(product.handle);
      if (!map) return product;
      return {
        ...product,
        templateSvg: map.templateSvg,
        layerConfig: {
          ...(product.layerConfig || {}),
          layoutSource: "svg-template",
          layoutSvg: map.layerConfig.layoutSvg,
          layoutSvgUrl: map.templateSvg,
          assetMatchStatus: "svg-template"
        }
      };
    });
    fs.writeFileSync(PRODUCT_MANIFEST, JSON.stringify({ ...manifest, generatedAt: new Date().toISOString(), products: nextProducts }, null, 2) + "\n");
  }

  const summary = {
    products: products.length,
    templates: templates.length,
    matched: matchedCount,
    review: reviewCount,
    candidate: candidateCount,
    missing: missingCount,
    allProductMaps: allProductMaps.length,
    outputDir: OUTPUT_DIR,
    publicSourceMap: PUBLIC_SOURCE_MAP,
    publicCandidateMap: PUBLIC_CANDIDATE_MAP
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
