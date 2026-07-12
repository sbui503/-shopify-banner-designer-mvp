import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SVG_DIR = path.join(PUBLIC_DIR, "svg-layer-templates");
const OUTPUT_DIR = path.join(ROOT, "outputs", "shopify-import-ready-20260524-shapes");
const TEMPLATE_CSV = "/Users/si/Downloads/Team Sport Banner Product template - Sheet1.csv";
const SHOPIFY_FILES_BASE = "https://cdn.shopify.com/s/files/1/0649/3844/2958/files/";

const CATEGORIES = [
  {
    key: "hem-grommet-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/hem-grommets-baseball-banners",
    sport: "Baseball",
    sourceSport: "baseball",
    shape: "rectangle",
    bannerType: "hem-grommet",
    typeLabel: "Hem & Grommet Baseball Banner",
    titleSuffix: "Baseball Banner",
    collectionTag: "hem-grommet-baseball",
    skuPrefix: "HGB",
    price: "79.99",
    compareAt: "119"
  },
  {
    key: "hem-grommet-softball",
    baseUrl: "https://teambannersports.com/softball-banners/hem-grommets-softball-banners",
    sport: "Softball",
    sourceSport: "softball",
    shape: "rectangle",
    bannerType: "hem-grommet",
    typeLabel: "Hem & Grommet Softball Banner",
    titleSuffix: "Softball Banner",
    collectionTag: "hem-grommet-softball",
    skuPrefix: "HGSB",
    price: "79.99",
    compareAt: "119"
  },
  {
    key: "hem-grommet-soccer",
    baseUrl: "https://teambannersports.com/soccer-banners/hem-grommets-soccer-banners",
    sport: "Soccer",
    sourceSport: "soccer",
    shape: "rectangle",
    bannerType: "hem-grommet",
    typeLabel: "Hem & Grommet Soccer Banner",
    titleSuffix: "Soccer Banner",
    collectionTag: "hem-grommet-soccer",
    skuPrefix: "HGSC",
    price: "79.99",
    compareAt: "119"
  },
  {
    key: "triangle-softball",
    baseUrl: "https://teambannersports.com/softball-banners/triangle-softball-banners",
    sport: "Softball",
    sourceSport: "softball",
    shape: "triangle",
    bannerType: "triangle",
    typeLabel: "Triangle Softball Pennant",
    titleSuffix: "Triangle Softball Pennant",
    collectionTag: "triangle-softball",
    skuPrefix: "TSB",
    price: "9.99",
    compareAt: "15.99"
  },
  {
    key: "triangle-soccer",
    baseUrl: "https://teambannersports.com/soccer-banners/triangle-soccer-banners",
    sport: "Soccer",
    sourceSport: "soccer",
    shape: "triangle",
    bannerType: "triangle",
    typeLabel: "Triangle Soccer Pennant",
    titleSuffix: "Triangle Soccer Pennant",
    collectionTag: "triangle-soccer",
    skuPrefix: "TSC",
    price: "9.99",
    compareAt: "15.99"
  },
  {
    key: "home-plate-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/home-plate-baseball-pennants",
    sport: "Baseball",
    sourceSport: "baseball",
    shape: "homeplatepennant",
    bannerType: "home-plate",
    typeLabel: "Home Plate Baseball Pennant",
    titleSuffix: "Home Plate Baseball Pennant",
    collectionTag: "home-plate-baseball",
    skuPrefix: "HPB",
    price: "9.99",
    compareAt: "15.99"
  },
  {
    key: "home-plate-softball",
    baseUrl: "https://teambannersports.com/softball-banners/home-plate-softball-banners",
    sport: "Softball",
    sourceSport: "softball",
    shape: "homeplatepennant",
    bannerType: "home-plate",
    typeLabel: "Home Plate Softball Pennant",
    titleSuffix: "Home Plate Softball Pennant",
    collectionTag: "home-plate-softball",
    skuPrefix: "HPSB",
    price: "9.99",
    compareAt: "15.99"
  },
  {
    key: "home-plate-soccer",
    baseUrl: "https://teambannersports.com/soccer-banners/home-plate-soccer-banners",
    sport: "Soccer",
    sourceSport: "soccer",
    shape: "homeplatepennant",
    bannerType: "home-plate",
    typeLabel: "Home Plate Soccer Pennant",
    titleSuffix: "Home Plate Soccer Pennant",
    collectionTag: "home-plate-soccer",
    skuPrefix: "HPSC",
    price: "9.99",
    compareAt: "15.99"
  }
];

const DISCOVERY_ONLY_CATEGORIES = [
  {
    key: "triangle-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/triangle-baseball-pennants",
    sport: "Baseball",
    sourceSport: "baseball",
    shape: "triangle",
    bannerType: "triangle",
    typeLabel: "Triangle Baseball Pennant",
    titleSuffix: "Triangle Baseball Pennant",
    collectionTag: "triangle-baseball"
  }
];

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/([a-z])([0-9])/g, "$1-$2")
    .replace(/([0-9])([a-z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromSlug(value = "") {
  return slugify(value)
    .split("-")
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ")
    .replace(/\bAnd\b/g, "&");
}

function compact(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function designSlugFromHref(href = "") {
  return String(href).split("?")[0].split("/").filter(Boolean).pop()?.replace(/-\d+$/, "") || "";
}

function inferSport(value = "") {
  const clean = String(value || "").toLowerCase();
  if (/\bbaseball\b/.test(clean)) return "baseball";
  if (/\bsoftball\b/.test(clean) || /\bsofball\b/.test(clean)) return "softball";
  if (/\bsoccer\b/.test(clean)) return "soccer";
  if (/\bbasketball\b/.test(clean)) return "basketball";
  return "";
}

function teamNameFromTitle(title = "") {
  return String(title)
    .replace(/\s*[-–]\s*/g, " ")
    .replace(/\b(Baseball|Softball|Soccer|Basketball|Banner|Banners|Pennant|Pennants|Pole|Pocket|Hem|Grommet|Grommets|Triangle|Home|Plate|Homeplate)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productTitleFromDesign(design) {
  const team = teamNameFromTitle(design.sourceTitle);
  if (!team) return design.sourceTitle || design.typeLabel;
  if (design.shape === "rectangle") return `${team} ${design.titleSuffix}`;
  return `${team} - ${design.titleSuffix}`;
}

function csvParse(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (char === "\"") quoted = false;
      else field += char;
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value = "") {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function csvStringify(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))
  ].join("\n") + "\n";
}

function readCsvObjects(file) {
  const rows = csvParse(fs.readFileSync(file, "utf8"));
  const headers = rows.shift();
  return {
    headers,
    rows: rows
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])))
  };
}

function appendTags(existingTags = "", add = []) {
  const seen = new Set();
  const tags = [];
  for (const value of String(existingTags).split(",").map((tag) => tag.trim()).filter(Boolean).concat(add)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(value);
    }
  }
  return tags.join(", ");
}

function shopifyImageUrl(sourceId) {
  return `${SHOPIFY_FILES_BASE}${sourceId}.png`;
}

function sourceSvgId(sourceSvg = "") {
  const text = String(sourceSvg || "");
  const admin = text.match(/admin-designs\/(\d+)\.svg/i);
  if (admin) return admin[1];
  const decoded = decodeURIComponent(text);
  const file = decoded.split("?")[0].split("#")[0].split("/").pop() || "";
  return slugify(file.replace(/\.svg$/i, ""));
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Codex TeamBannerSports source shape import builder" }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  return response.text();
}

function extractDesignCards(html, baseUrl) {
  const starts = [...html.matchAll(/<a\b[^>]*class="[^"]*\bdesign-thumb-link\b[^"]*"[^>]*>/g)];
  const cards = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index || 0;
    const end = starts[i + 1]?.index || html.length;
    const segment = html.slice(start, end);
    const anchor = starts[i][0];
    const detailPath = decodeHtml((anchor.match(/\bhref="([^"]+)"/i) || [])[1] || "");
    const imgTag = (segment.match(/<img\b[^>]*>/i) || [])[0] || "";
    const sourceImage = decodeHtml((imgTag.match(/\bsrc="([^"]+)"/i) || [])[1] || "");
    const alt = decodeHtml((imgTag.match(/\balt="([^"]*)"/i) || [])[1] || "");
    const liveAnchor = (segment.match(/<a\b[^>]*class="[^"]*\bbtn\b[^"]*\bbtn-live\b[^"]*"[^>]*>/i) || [])[0] || "";
    const livePath = decodeHtml((liveAnchor.match(/\bhref="([^"]+)"/i) || [])[1] || "");
    if (!detailPath || !sourceImage || !livePath) continue;
    const liveUrl = new URL(livePath, baseUrl);
    const sourceSvg = liveUrl.searchParams.get("u") ? decodeURIComponent(liveUrl.searchParams.get("u")) : liveUrl.href;
    cards.push({
      detailUrl: new URL(detailPath, baseUrl).href,
      sourceImage,
      sourceSvg,
      sourceId: sourceSvgId(sourceSvg),
      alt,
      sourceTitle: titleCaseFromSlug(designSlugFromHref(detailPath))
    });
  }
  return cards;
}

async function scrapeCategory(category) {
  const designs = [];
  const skipped = [];
  for (let page = 1; page <= 80; page += 1) {
    const url = page === 1 ? category.baseUrl : `${category.baseUrl}/${page}`;
    let html = "";
    try {
      html = await fetchText(url);
    } catch (error) {
      if (page === 1) {
        skipped.push({ category: category.key, pageUrl: url, reason: String(error.message || error) });
      }
      break;
    }
    const cards = extractDesignCards(html, url);
    if (!cards.length && page > 1) break;
    for (const card of cards) {
      const sportEvidence = [
        card.sourceTitle,
        card.alt,
        card.detailUrl,
        card.sourceImage,
        card.sourceSvg
      ].join(" ");
      const detectedSport = inferSport(sportEvidence);
      if (detectedSport && detectedSport !== category.sourceSport) {
        skipped.push({
          category: category.key,
          pageUrl: url,
          sourceTitle: card.sourceTitle,
          sourceSvg: card.sourceSvg,
          detectedSport,
          reason: `source-sport-${detectedSport}-does-not-match-${category.sourceSport}`
        });
        continue;
      }
      if (!/admin-designs\/\d+\.svg/i.test(card.sourceSvg)) {
        skipped.push({
          category: category.key,
          pageUrl: url,
          sourceTitle: card.sourceTitle,
          sourceSvg: card.sourceSvg,
          detectedSport: detectedSport || "",
          reason: "source-svg-is-not-lct-admin-design"
        });
        continue;
      }
      designs.push({
        ...category,
        ...card,
        sourceSport: category.sourceSport,
        detectedSport: detectedSport || category.sourceSport,
        pageUrl: url
      });
    }
  }
  return { designs, skipped };
}

async function downloadFile(url, file, retries = 3) {
  if (!url || fs.existsSync(file)) return { status: "skipped", file };
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "Codex TeamBannerSports source shape import builder" } });
      if (!response.ok) return { status: "failed", file, statusCode: response.status, url };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return { status: "downloaded", file };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  return { status: "failed", file, url, error: String(lastError?.message || lastError || "download failed") };
}

async function downloadAssets(designs) {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  const imageDir = path.join(OUTPUT_DIR, "images");
  fs.mkdirSync(imageDir, { recursive: true });
  const unique = [...new Map(designs.map((design) => [design.sourceId, design])).values()];
  const results = [];
  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const settled = await Promise.all(chunk.flatMap((design) => [
      downloadFile(design.sourceSvg, path.join(SVG_DIR, `${design.sourceId}.svg`)),
      downloadFile(design.sourceImage, path.join(imageDir, `${design.sourceId}.png`))
    ]));
    results.push(...settled);
  }
  return results;
}

function designTags(design, title) {
  const team = teamNameFromTitle(title);
  const bannerLabel = design.bannerType.replace(/-/g, " ");
  return [
    team,
    bannerLabel,
    design.sport.toLowerCase(),
    "customizable",
    "team banner",
    "tbd:layered",
    `tbd:shape:${design.shape}`,
    "tbd:background:1",
    "tbd:layout-source:svg-template",
    `tbd:layout-svg:${design.sourceId}`,
    `tbd:source-svg:${design.sourceSvg}`,
    `tbd:source-image:${design.sourceImage}`,
    `tbd:source-page:${design.detailUrl}`,
    `tbd:collection:${design.collectionTag}`,
    `tbd:banner-type:${design.bannerType}`,
    `tbd:sport:${design.sport.toLowerCase()}`,
    `tbd:team-logo-title:${team}`,
    "tbd:asset-match:complete"
  ];
}

function rowFromDesign(headers, templateDefaults, design, index, usedHandles) {
  const title = productTitleFromDesign(design);
  const team = teamNameFromTitle(title);
  const handleBaseTitle = slugify(title).replace(/-banners?$/, "");
  const baseHandle = `${design.bannerType}-${handleBaseTitle}`;
  let handle = baseHandle;
  if (usedHandles.has(handle)) handle = `${baseHandle}-${design.sourceId}`;
  usedHandles.add(handle);
  const descriptionType = design.typeLabel.toLowerCase();
  const body = `Customizable ${descriptionType} for ${team}. Printed on heavy-duty vinyl with vibrant, weather-resistant inks. Open the designer to edit the source layout, team name/logo, clip art, accessories, and text layers. Fast 1-3 day shipping.`;
  const imageUrl = shopifyImageUrl(design.sourceId);
  const row = {
    ...templateDefaults,
    "Handle": handle,
    "Title": title,
    "Body (HTML)": body,
    "Vendor": "TEAM SPORT BANNERS",
    "Product Category": templateDefaults["Product Category"] || "Arts & Entertainment > Hobbies & Creative Arts > Collectibles > Sports Collectibles > Sports Fan Accessories > Banners",
    "Type": "Banner",
    "Tags": appendTags("", designTags(design, title)),
    "Published": "TRUE",
    "Option1 Name": "Title",
    "Option1 Value": "Default Title",
    "Variant SKU": `${design.skuPrefix}-${String(index + 1).padStart(4, "0")}`,
    "Variant Grams": templateDefaults["Variant Grams"] || "0",
    "Variant Inventory Tracker": "shopify",
    "Variant Inventory Policy": templateDefaults["Variant Inventory Policy"] || "deny",
    "Variant Fulfillment Service": "manual",
    "Variant Price": design.price,
    "Variant Compare At Price": design.compareAt,
    "Variant Requires Shipping": "TRUE",
    "Variant Taxable": "TRUE",
    "Image Src": imageUrl,
    "Image Position": "1",
    "Image Alt Text": `${team} - ${design.sport} - ${design.typeLabel}`,
    "Gift Card": templateDefaults["Gift Card"] || "FALSE",
    "SEO Title": `Custom ${team} ${design.typeLabel} | Team Sport Banners`,
    "SEO Description": `Get your custom ${team} ${design.typeLabel.toLowerCase()}. Durable vinyl, full-color print, and fast shipping. Design your team banner today!`,
    "Google Shopping / Custom Product": templateDefaults["Google Shopping / Custom Product"] || "",
    "Google: Custom Product (product.metafields.mm-google-shopping.custom_product)": templateDefaults["Google: Custom Product (product.metafields.mm-google-shopping.custom_product)"] || "",
    "Condition (product.metafields.shopify.condition)": templateDefaults["Condition (product.metafields.shopify.condition)"] || "excellent-ex; graded; very-good-vg",
    "Sport (product.metafields.shopify.sport)": design.sport,
    "Variant Image": imageUrl,
    "Variant Weight Unit": templateDefaults["Variant Weight Unit"] || "lb",
    "Status": "active"
  };
  return Object.fromEntries(headers.map((header) => [header, row[header] || ""]));
}

function loadJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function readSvgStats(sourceId, design) {
  const file = path.join(SVG_DIR, `${sourceId}.svg`);
  if (!fs.existsSync(file)) return {};
  const svg = fs.readFileSync(file, "utf8");
  const imageMatches = [...svg.matchAll(/<image\b[^>]*>/gi)].map((match) => match[0]);
  const textMatches = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((match) => match[1].replace(/<[^>]+>/g, " "));
  const imageHrefs = imageMatches
    .map((tag) => (tag.match(/\b(?:href|xlink:href)="([^"]+)"/i) || [])[1] || "")
    .filter(Boolean);
  const playerTexts = textMatches.filter((text) => /\bplayer\b/i.test(text)).length;
  const yearTexts = textMatches.filter((text) => /\byear\b/i.test(text)).length;
  const coachTexts = textMatches.filter((text) => /\bcoach\b/i.test(text)).length;
  const teamMomTexts = textMatches.filter((text) => /\bteam\s*mom\b/i.test(text)).length;
  return {
    playerCount: playerTexts,
    playerTextCount: playerTexts,
    playerIconCount: Math.max(0, imageHrefs.length - 2),
    imageCount: imageHrefs.length,
    textCount: textMatches.length,
    headerTextCount: coachTexts + teamMomTexts,
    yearTextCount: yearTexts,
    coachNameCount: coachTexts,
    teamMomNameCount: teamMomTexts,
    backgroundCount: imageHrefs.length ? 1 : 0,
    teamLogoCount: imageHrefs.length > 1 ? 1 : 0,
    clipartCount: Math.max(0, imageHrefs.length - 2),
    backgroundUrl: imageHrefs[0] || "",
    teamLogoUrl: imageHrefs[1] || "",
    clipartUrl: imageHrefs[2] || "",
    type: design.shape,
    sport: design.sport.toLowerCase()
  };
}

function patchSvgManifest(designs) {
  const file = path.join(PUBLIC_DIR, "svg-layer-templates.json");
  const data = loadJson(file, { templates: [] });
  const byName = new Map((data.templates || []).map((entry) => [String(entry.name), entry]));
  for (const design of designs) {
    const stats = readSvgStats(design.sourceId, design);
    byName.set(design.sourceId, {
      ...(byName.get(design.sourceId) || {}),
      name: design.sourceId,
      title: teamNameFromTitle(design.sourceTitle).toLowerCase(),
      url: `/svg-layer-templates/${design.sourceId}.svg`,
      sourceUrl: design.sourceSvg,
      sourcePage: design.detailUrl,
      sourceTitle: design.sourceTitle,
      sourceCategoryUrl: design.pageUrl,
      type: design.shape,
      sport: design.sport.toLowerCase(),
      ...stats
    });
  }
  fs.writeFileSync(file, `${JSON.stringify({ ...data, templates: [...byName.values()], layerNormalizedAt: data.layerNormalizedAt || "", updatedForSourceShapeImportsAt: new Date().toISOString() }, null, 2)}\n`);
}

function patchPublicMaps(rowsByDesign) {
  const productsFile = path.join(PUBLIC_DIR, "team-banner-products.json");
  const sourceMapFile = path.join(PUBLIC_DIR, "team-banner-source-svg-map.json");
  const candidatesFile = path.join(PUBLIC_DIR, "team-banner-source-svg-candidates.json");
  const productsData = loadJson(productsFile, { products: [] });
  const byHandle = new Map((productsData.products || []).map((product) => [product.handle, product]));

  for (const { row, design } of rowsByDesign) {
    const stats = readSvgStats(design.sourceId, design);
    const layerConfig = {
      ...(byHandle.get(row.Handle)?.layerConfig || {}),
      layoutSource: "svg-template",
      layoutSvg: design.sourceId,
      layoutSvgUrl: `/svg-layer-templates/${design.sourceId}.svg`,
      assetMatchStatus: "team-banner-sports-import",
      objectLayerMode: "source-svg",
      fullyEditable: true,
      sourceEditable: true,
      needsSourceSvg: false,
      layerCount: (stats.imageCount || 0) + (stats.textCount || 0),
      backgroundCount: stats.backgroundCount || 1,
      teamLogoCount: stats.teamLogoCount || 0,
      clipartCount: stats.clipartCount || 0,
      playerCount: stats.playerCount || 0,
      playerIconCount: stats.playerIconCount || 0,
      playerTextCount: stats.playerTextCount || 0,
      textLayerCount: stats.textCount || 0,
      headerTextCount: stats.headerTextCount || 0,
      coachNameCount: stats.coachNameCount || 0,
      teamMomNameCount: stats.teamMomNameCount || 0,
      yearTextCount: stats.yearTextCount || 0,
      backgroundUrl: stats.backgroundUrl || "",
      backgroundSource: stats.backgroundUrl ? "svg-template-asset" : "",
      logoUrl: stats.teamLogoUrl || "",
      logoSource: stats.teamLogoUrl ? "svg-template-asset" : "",
      clipartUrl: stats.clipartUrl || "",
      clipartSource: stats.clipartUrl ? "svg-template-asset" : "",
      accessoryUrl: stats.clipartUrl || "",
      accessorySource: stats.clipartUrl ? "svg-template-asset" : ""
    };
    byHandle.set(row.Handle, {
      ...(byHandle.get(row.Handle) || {}),
      handle: row.Handle,
      title: row.Title,
      titleSlug: slugify(row.Title),
      type: row.Type,
      tags: row.Tags,
      productCategory: row["Product Category"],
      vendor: row.Vendor,
      sku: row["Variant SKU"],
      price: row["Variant Price"],
      compareAtPrice: row["Variant Compare At Price"],
      image: row["Image Src"],
      imageAlt: row["Image Alt Text"],
      url: `https://teamsportbanners.com/products/${row.Handle}`,
      path: `/products/${row.Handle}`,
      status: row.Status,
      shape: design.shape,
      layerConfig,
      templateSvg: `/svg-layer-templates/${design.sourceId}.svg`
    });
  }
  fs.writeFileSync(productsFile, `${JSON.stringify({ ...productsData, products: [...byHandle.values()], count: byHandle.size, updatedForSourceShapeImportsAt: new Date().toISOString() }, null, 2)}\n`);

  for (const file of [sourceMapFile, candidatesFile]) {
    const data = loadJson(file, { maps: [] });
    const byMapHandle = new Map((data.maps || []).map((entry) => [entry.handle || entry.productHandle, entry]));
    for (const { row, design } of rowsByDesign) {
      const product = byHandle.get(row.Handle);
      byMapHandle.set(row.Handle, {
        handle: row.Handle,
        productHandle: row.Handle,
        title: row.Title,
        titleSlug: slugify(row.Title),
        shape: design.shape,
        productShape: design.shape,
        sourceShape: design.shape,
        templateSvg: `/svg-layer-templates/${design.sourceId}.svg`,
        sourceTemplatePage: design.detailUrl,
        sourceTemplateSvg: design.sourceSvg,
        sourceSvgUrl: design.sourceSvg,
        productImage: row["Image Src"],
        productUrl: `https://teamsportbanners.com/products/${row.Handle}`,
        matchStatus: "matched",
        matchScore: 1200,
        matchMargin: 999,
        matchConfidence: "import-exact-source",
        matchReasons: ["source-category-generated", "product-image-id=svg-id", "team-banner-sports-import"],
        sourceType: "source-svg",
        editableLayerMode: "source-svg",
        fullyEditable: true,
        sourceEditable: true,
        needsSourceSvg: false,
        layerConfig: product.layerConfig
      });
    }
    fs.writeFileSync(file, `${JSON.stringify({ ...data, maps: [...byMapHandle.values()], count: byMapHandle.size, updatedForSourceShapeImportsAt: new Date().toISOString() }, null, 2)}\n`);
  }
}

function writeGroupedImages(rowsByDesign) {
  const groupedDir = path.join(OUTPUT_DIR, "images-by-banner-type");
  fs.rmSync(groupedDir, { recursive: true, force: true });
  const folderCounts = new Map();
  for (const { design } of rowsByDesign) {
    const source = path.join(OUTPUT_DIR, "images", `${design.sourceId}.png`);
    if (!fs.existsSync(source)) continue;
    const targetDir = path.join(groupedDir, design.key);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(source, path.join(targetDir, `${design.sourceId}.png`));
    folderCounts.set(design.key, (folderCounts.get(design.key) || 0) + 1);
  }
  return { groupedDir, folderCounts };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const template = readCsvObjects(TEMPLATE_CSV);
  const headers = template.headers;
  const templateDefaults = template.rows[0] || {};
  const scrapeResults = await Promise.all([...CATEGORIES, ...DISCOVERY_ONLY_CATEGORIES].map(scrapeCategory));
  const allSkipped = scrapeResults.flatMap((result) => result.skipped || []);
  const importDesigns = scrapeResults
    .slice(0, CATEGORIES.length)
    .flatMap((result) => result.designs || []);
  const designs = [...new Map(importDesigns.map((design) => [design.sourceId, design])).values()];
  const usedHandles = new Set();
  const rowsByDesign = designs.map((design, index) => {
    const row = rowFromDesign(headers, templateDefaults, design, index, usedHandles);
    return { row, design };
  });
  const rows = rowsByDesign.map(({ row }) => row);

  const combinedCsv = path.join(OUTPUT_DIR, "shopify_triangle_homeplate_hem_all_pages_team_sport_banners_vendor.csv");
  fs.writeFileSync(combinedCsv, csvStringify(headers, rows));

  const rowsByKey = new Map();
  for (const item of rowsByDesign) {
    if (!rowsByKey.has(item.design.key)) rowsByKey.set(item.design.key, []);
    rowsByKey.get(item.design.key).push(item.row);
  }
  const csvByKey = {};
  for (const [key, keyRows] of rowsByKey.entries()) {
    const file = path.join(OUTPUT_DIR, `shopify_${key.replace(/-/g, "_")}_team_sport_banners_vendor.csv`);
    fs.writeFileSync(file, csvStringify(headers, keyRows));
    csvByKey[key] = file;
  }

  const downloadResults = await downloadAssets(designs);
  const { groupedDir, folderCounts } = writeGroupedImages(rowsByDesign);
  patchPublicMaps(rowsByDesign);
  patchSvgManifest(designs);

  const skipHeaders = ["category", "pageUrl", "sourceTitle", "sourceSvg", "detectedSport", "reason"];
  const skippedCsv = path.join(OUTPUT_DIR, "source-shape-import-skipped.csv");
  fs.writeFileSync(skippedCsv, csvStringify(skipHeaders, allSkipped.map((item) => Object.fromEntries(skipHeaders.map((header) => [header, item[header] || ""])))));

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    combinedCsv,
    csvByKey,
    groupedImageDir: groupedDir,
    products: rows.length,
    sourceDesigns: designs.length,
    folders: Object.fromEntries([...folderCounts.entries()].sort()),
    categories: Object.fromEntries(CATEGORIES.map((category) => [
      category.key,
      rowsByDesign.filter((item) => item.design.key === category.key).length
    ])),
    skipped: {
      count: allSkipped.length,
      csv: skippedCsv,
      byReason: allSkipped.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {})
    },
    downloads: {
      svgDownloaded: downloadResults.filter((item) => item.file.endsWith(".svg") && item.status === "downloaded").length,
      svgSkipped: downloadResults.filter((item) => item.file.endsWith(".svg") && item.status === "skipped").length,
      imageDownloaded: downloadResults.filter((item) => item.file.endsWith(".png") && item.status === "downloaded").length,
      imageSkipped: downloadResults.filter((item) => item.file.endsWith(".png") && item.status === "skipped").length,
      failed: downloadResults.filter((item) => item.status === "failed")
    },
    note: "Baseball triangle source category currently points to non-admin basketball SVG files, so it is listed in the skipped CSV instead of being imported as a mismatched product source."
  };
  const summaryFile = path.join(OUTPUT_DIR, "source-shape-import-summary.json");
  fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
