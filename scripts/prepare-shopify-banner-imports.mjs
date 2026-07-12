import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SVG_DIR = path.join(PUBLIC_DIR, "svg-layer-templates");
const OUTPUT_DIR = path.join(ROOT, "outputs", "shopify-import-ready-20260523");

const DEFAULT_POLE_CSV = "/tmp/codex-remote-attachments/019e3c2b-c637-7f10-aa03-0a2a8b8bd4df/8FDCC48C-FC45-4877-A8DC-CE0508697921/1-shopify_pole_pocket_banners_with_seo.csv";
const DEFAULT_HEM_CSV = "/tmp/codex-remote-attachments/019e3c2b-c637-7f10-aa03-0a2a8b8bd4df/8FDCC48C-FC45-4877-A8DC-CE0508697921/2-shopify_hem_grommet_baseball_banners.csv";

const CATEGORIES = {
  poleBaseball: {
    key: "pole-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/pole-pocket-baseball-banners",
    type: "Pole Pocket Baseball Banner",
    bannerType: "Pole Pocket",
    sport: "Baseball",
    collectionTag: "pole-pocket-baseball"
  },
  poleSoftball: {
    key: "pole-softball",
    baseUrl: "https://teambannersports.com/softball-banners/pole-pocket-softball-banners",
    type: "Pole Pocket Softball Banner",
    bannerType: "Pole Pocket",
    sport: "Softball",
    collectionTag: "pole-pocket-softball"
  },
  poleSoccer: {
    key: "pole-soccer",
    baseUrl: "https://teambannersports.com/soccer-banners/pole-pocket-soccer-banners",
    type: "Pole Pocket Soccer Banner",
    bannerType: "Pole Pocket",
    sport: "Soccer",
    collectionTag: "pole-pocket-soccer"
  },
  hemBaseball: {
    key: "hem-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/hem-grommets-baseball-banners",
    type: "Hem & Grommet Baseball Banner",
    bannerType: "Hem & Grommet",
    sport: "Baseball",
    collectionTag: "hem-grommet-baseball"
  }
};

const MANUAL_SOURCE_ALIASES = {
  "pole-pocket-tiger-softball": "tigers-softball-banner",
  "hem-grommet-bratz-baseball": "bratz-baseball-banner"
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    poleCsv: DEFAULT_POLE_CSV,
    hemCsv: DEFAULT_HEM_CSV,
    outputDir: OUTPUT_DIR,
    patchPublicMaps: true,
    downloadImages: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--pole-csv") options.poleCsv = args[++i];
    else if (arg === "--hem-csv") options.hemCsv = args[++i];
    else if (arg === "--output-dir") options.outputDir = path.resolve(args[++i]);
    else if (arg === "--no-patch") options.patchPublicMaps = false;
    else if (arg === "--download-images") options.downloadImages = true;
  }
  return options;
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
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

function designSlugFromHref(href = "") {
  return String(href).split("?")[0].split("/").filter(Boolean).pop()?.replace(/-\d+$/, "") || "";
}

function looseKey(value = "") {
  return slugify(value)
    .replace(/-/g, "")
    .replace(/banners?$/i, "");
}

function teamNameFromTitle(title = "") {
  return String(title)
    .replace(/\s*[-–]\s*/g, " ")
    .replace(/\b(Baseball|Softball|Soccer|Banner|Banners|Pole|Pocket|Hem|Grommet|Grommets)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
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

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Codex TeamBannerSports import validator" } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} ${url}`);
  return response.text();
}

async function scrapeCategory(category) {
  const designs = [];
  for (let page = 1; page <= 40; page += 1) {
    const url = page === 1 ? category.baseUrl : `${category.baseUrl}/${page}`;
    let html = "";
    try {
      html = await fetchText(url);
    } catch (error) {
      if (page === 1) throw error;
      break;
    }

    const matches = [...html.matchAll(/class="design-thumb-link" href="([^"]+)"[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"[\s\S]*?class="btn btn-live" href="([^"]+)"/g)];
    if (!matches.length && page > 1) break;

    for (const match of matches) {
      const detailPath = decodeHtml(match[1]);
      const image = decodeHtml(match[2]);
      const alt = decodeHtml(match[3]);
      const livePath = decodeHtml(match[4]);
      const sourceSvg = new URL(livePath, category.baseUrl).href.match(/[?&]u=([^&]+)/)
        ? decodeURIComponent(new URL(livePath, category.baseUrl).searchParams.get("u"))
        : new URL(livePath, category.baseUrl).href;
      const id = sourceSvg.match(/admin-designs\/(\d+)\.svg/i)?.[1] || "";
      const designSlug = designSlugFromHref(detailPath);
      const sourceTitle = titleCaseFromSlug(designSlug);
      designs.push({
        ...category,
        sourceTitle,
        sourceKey: slugify(sourceTitle),
        looseKey: looseKey(sourceTitle),
        detailUrl: new URL(detailPath, category.baseUrl).href,
        sourceImage: image,
        sourceSvg,
        sourceId: id,
        alt,
        pageUrl: url
      });
    }
  }
  return designs;
}

function indexDesigns(designs) {
  const exact = new Map();
  const loose = new Map();
  designs.forEach((design) => {
    if (!exact.has(design.sourceKey)) exact.set(design.sourceKey, design);
    if (!loose.has(design.looseKey)) loose.set(design.looseKey, design);
  });
  return { exact, loose };
}

function bestMatchProduct(product, indexes) {
  const exactKey = slugify(product.Title);
  const direct = indexes.exact.get(exactKey);
  if (direct) return { design: direct, reason: "exact-title" };
  const loose = indexes.loose.get(looseKey(product.Title));
  if (loose) return { design: loose, reason: "loose-title" };
  return { design: null, reason: "missing" };
}

function manualAliasDesign(product) {
  const aliasHandle = MANUAL_SOURCE_ALIASES[product.Handle];
  if (!aliasHandle) return null;
  const mapData = loadJson(path.join(PUBLIC_DIR, "team-banner-source-svg-map.json"), { maps: [] });
  const source = (mapData.maps || []).find((entry) => entry.handle === aliasHandle || entry.productHandle === aliasHandle);
  if (!source) return null;
  const sourceId = String(source.templateSvg || source.layerConfig?.layoutSvgUrl || "")
    .split("/")
    .pop()
    .replace(/\.svg$/i, "");
  const sport = /softball/i.test(product.Title) ? "Softball" : /soccer/i.test(product.Title) ? "Soccer" : "Baseball";
  const bannerType = /pole/i.test(product.Type) ? "Pole Pocket" : /hem/i.test(product.Type) ? "Hem & Grommet" : "Hem & Grommet";
  return {
    key: `manual-alias-${aliasHandle}`,
    type: product.Type,
    bannerType,
    sport,
    collectionTag: bannerType === "Pole Pocket" ? `pole-pocket-${sport.toLowerCase()}` : `hem-grommet-${sport.toLowerCase()}`,
    sourceTitle: source.title || product.Title,
    sourceKey: slugify(source.title || product.Title),
    looseKey: looseKey(source.title || product.Title),
    detailUrl: source.sourceTemplatePage || source.productUrl || "",
    sourceImage: source.productImage || "",
    sourceSvg: source.sourceTemplateSvg || source.sourceSvgUrl || "",
    sourceId,
    alt: source.title || product.Title,
    pageUrl: source.sourceTemplatePage || "",
    layerConfig: source.layerConfig,
    aliasHandle
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

function designTags(design, productTitle = "") {
  const team = teamNameFromTitle(productTitle || design.sourceTitle);
  return [
    "tbd:layered",
    "tbd:shape:banner",
    "tbd:background:1",
    "tbd:layout-source:svg-template",
    `tbd:layout-svg:${design.sourceId}`,
    `tbd:source-svg:${design.sourceSvg}`,
    `tbd:source-image:${design.sourceImage}`,
    `tbd:source-page:${design.detailUrl}`,
    `tbd:collection:${design.collectionTag}`,
    `tbd:banner-type:${design.bannerType.toLowerCase().replace(/\s*&\s*/g, "-").replace(/\s+/g, "-")}`,
    `tbd:sport:${design.sport.toLowerCase()}`,
    `tbd:team-logo-title:${team}`,
    "tbd:asset-match:complete"
  ];
}

function enrichExistingCsv(input, sourceIndexes, bannerType) {
  const seenHandles = new Set();
  const dedupedRows = [];
  const reportRows = [];
  const enrichedRows = input.rows.map((row) => {
    const firstForHandle = !seenHandles.has(row.Handle);
    seenHandles.add(row.Handle);
    const { design, reason } = bestMatchProduct(row, sourceIndexes);
    const aliasDesign = design ? null : manualAliasDesign(row);
    const finalDesign = design || aliasDesign;
    const finalReason = design ? reason : aliasDesign ? `manual-alias:${aliasDesign.aliasHandle}` : reason;
    const next = { ...row };
    if (finalDesign) {
      next["Image Src"] = firstForHandle ? finalDesign.sourceImage : "";
      next["Image Position"] = firstForHandle ? "1" : "";
      next["Image Alt Text"] = next["Image Alt Text"] || `${teamNameFromTitle(next.Title)} - ${finalDesign.sport} - ${finalDesign.bannerType} Banner`;
      next.Tags = appendTags(next.Tags, designTags(finalDesign, next.Title));
    }
    if (firstForHandle) {
      dedupedRows.push(next);
      reportRows.push({
        handle: next.Handle,
        title: next.Title,
        bannerType,
        result: finalDesign ? "matched" : "missing-source",
        reason: finalReason,
        sourceId: finalDesign?.sourceId || "",
        sourceImage: finalDesign?.sourceImage || "",
        sourceSvg: finalDesign?.sourceSvg || "",
        sourcePage: finalDesign?.detailUrl || ""
      });
    }
    return next;
  });
  return { enrichedRows, dedupedRows, reportRows };
}

function generatedSoccerRows(designs, headers) {
  return designs.map((design, index) => {
    const title = design.sourceTitle;
    const team = teamNameFromTitle(title);
    const handle = `pole-pocket-${slugify(title).replace(/-banner$/, "")}`;
    return {
      "Handle": handle,
      "Title": title,
      "Body (HTML)": `Customizable soccer pole pocket banner for ${team}. Printed on heavy-duty 13oz vinyl with vibrant, weather-resistant inks. Fits standard poles with top and bottom pole pockets. Perfect for dugouts, fences, and team photos. Fast 1-3 day shipping.`,
      "Vendor": "Team Banner Sports",
      "Product Category": "",
      "Type": design.type,
      "Tags": appendTags(`${team}, pole pocket, soccer, customizable, team banner`, designTags(design, title)),
      "Published": "TRUE",
      "Option1 Name": "Title",
      "Option1 Value": "Default Title",
      "Variant SKU": `PPS-${String(index + 1).padStart(4, "0")}`,
      "Variant Grams": "0",
      "Variant Inventory Tracker": "shopify",
      "Variant Inventory Qty": "100",
      "Variant Inventory Policy": "continue",
      "Variant Fulfillment Service": "manual",
      "Variant Price": "69.99",
      "Variant Compare At Price": "89.99",
      "Variant Requires Shipping": "TRUE",
      "Variant Taxable": "TRUE",
      "Status": "active",
      "Image Src": design.sourceImage,
      "Image Position": "1",
      "Image Alt Text": `${team} - Soccer - Pole Pocket Banner`,
      "SEO Title": `Custom ${team} Pole Pocket Soccer Banner | Team Banner Sports`,
      "SEO Description": `Get your custom ${team} soccer pole pocket banner. Durable vinyl, full-color print, 1-3 day shipping. Design your team banner today!`
    };
  }).map((row) => Object.fromEntries(headers.map((header) => [header, row[header] || ""])));
}

async function downloadFile(url, file) {
  if (!url || fs.existsSync(file)) return { status: "skipped", file };
  const response = await fetch(url, { headers: { "user-agent": "Codex TeamBannerSports import validator" } });
  if (!response.ok) return { status: "failed", file, statusCode: response.status };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return { status: "downloaded", file };
}

async function downloadSvgs(designs) {
  fs.mkdirSync(SVG_DIR, { recursive: true });
  const unique = [...new Map(designs.filter((d) => d.sourceId && d.sourceSvg).map((d) => [d.sourceId, d])).values()];
  const results = [];
  for (let i = 0; i < unique.length; i += 6) {
    const chunk = unique.slice(i, i + 6);
    const settled = await Promise.all(chunk.map((design) => downloadFile(design.sourceSvg, path.join(SVG_DIR, `${design.sourceId}.svg`))));
    results.push(...settled);
  }
  return results;
}

async function maybeDownloadImages(designs, outputDir) {
  const imageDir = path.join(outputDir, "images");
  const unique = [...new Map(designs.filter((d) => d.sourceId && d.sourceImage).map((d) => [d.sourceId, d])).values()];
  const results = [];
  for (let i = 0; i < unique.length; i += 8) {
    const chunk = unique.slice(i, i + 8);
    const settled = await Promise.all(chunk.map((design) => downloadFile(design.sourceImage, path.join(imageDir, `${design.sourceId}.png`))));
    results.push(...settled);
  }
  return results;
}

function loadJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function productEntryFromDesign(handle, title, type, tags, price, compareAtPrice, design) {
  return {
    handle,
    title,
    titleSlug: slugify(title),
    type,
    tags,
    productCategory: "Arts & Entertainment > Hobbies & Creative Arts > Collectibles > Sports Collectibles > Sports Fan Accessories > Banners",
    vendor: "TEAM SPORT BANNERS",
    sku: "",
    price,
    compareAtPrice,
    image: design.sourceImage,
    imageAlt: `${teamNameFromTitle(title)} - ${design.sport} - ${design.bannerType} Banner`,
    url: `https://teamsportbanners.com/products/${handle}`,
    path: `/products/${handle}`,
    status: "active",
    shape: "rectangle",
    layerConfig: {
      layoutSource: "svg-template",
      layoutSvg: design.sourceId,
      layoutSvgUrl: `/svg-layer-templates/${design.sourceId}.svg`,
      assetMatchStatus: "team-banner-sports-import",
      objectLayerMode: "source-svg",
      fullyEditable: true,
      sourceEditable: true,
      needsSourceSvg: false
    },
    templateSvg: `/svg-layer-templates/${design.sourceId}.svg`
  };
}

function sourceMapEntryFromDesign(product, design, reason) {
  return {
    handle: product.handle,
    productHandle: product.handle,
    title: product.title,
    titleSlug: product.titleSlug,
    shape: "rectangle",
    productShape: "rectangle",
    templateSvg: product.templateSvg,
    sourceTemplatePage: design.detailUrl,
    sourceSvgUrl: design.sourceSvg,
    productImage: design.sourceImage,
    productUrl: product.url,
    matchStatus: "matched",
    matchScore: 1200,
    matchMargin: 999,
    matchConfidence: "import-exact-source",
    matchReasons: [reason, "product-image-id=svg-id", "team-banner-sports-import"],
    sourceType: "source-svg",
    editableLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    needsSourceSvg: false,
    layerConfig: { ...product.layerConfig }
  };
}

function patchPublicMaps(allProducts) {
  const productsFile = path.join(PUBLIC_DIR, "team-banner-products.json");
  const sourceMapFile = path.join(PUBLIC_DIR, "team-banner-source-svg-map.json");
  const candidatesFile = path.join(PUBLIC_DIR, "team-banner-source-svg-candidates.json");

  const productsData = loadJson(productsFile, { products: [] });
  const byHandle = new Map((productsData.products || []).map((product) => [product.handle, product]));
  allProducts.forEach((product) => byHandle.set(product.handle, { ...(byHandle.get(product.handle) || {}), ...product }));
  fs.writeFileSync(productsFile, `${JSON.stringify({ ...productsData, products: [...byHandle.values()], count: byHandle.size, updatedForShopifyImportAt: new Date().toISOString() }, null, 2)}\n`);

  for (const file of [sourceMapFile, candidatesFile]) {
    const data = loadJson(file, { maps: [] });
    const byMapHandle = new Map((data.maps || []).map((entry) => [entry.handle || entry.productHandle, entry]));
    allProducts.forEach((product) => {
      const design = product.__sourceDesign;
      byMapHandle.set(product.handle, sourceMapEntryFromDesign(product, design, product.__matchReason || "exact-import-handle"));
    });
    fs.writeFileSync(file, `${JSON.stringify({ ...data, maps: [...byMapHandle.values()], count: byMapHandle.size, updatedForShopifyImportAt: new Date().toISOString() }, null, 2)}\n`);
  }
}

function productsFromRows(rows, reports, typeFallback) {
  const byHandle = new Map();
  for (const row of rows) {
    if (!row["Image Src"] || byHandle.has(row.Handle)) continue;
    const report = reports.find((item) => item.handle === row.Handle);
    if (!report || report.result !== "matched") continue;
    byHandle.set(row.Handle, {
      row,
      report
    });
  }
  return [...byHandle.values()].map(({ row, report }) => {
    const design = {
      sourceId: report.sourceId,
      sourceImage: report.sourceImage,
      sourceSvg: report.sourceSvg,
      detailUrl: report.sourcePage,
      sport: row.Type.includes("Softball") ? "Softball" : row.Type.includes("Soccer") ? "Soccer" : "Baseball",
      bannerType: row.Type.includes("Pole") ? "Pole Pocket" : row.Type.includes("Hem") ? "Hem & Grommet" : typeFallback,
      type: row.Type
    };
    const product = productEntryFromDesign(row.Handle, row.Title, row.Type, row.Tags, row["Variant Price"], row["Variant Compare At Price"], design);
    product.__sourceDesign = design;
    product.__matchReason = report.reason;
    return product;
  });
}

async function main() {
  const options = parseArgs();
  fs.mkdirSync(options.outputDir, { recursive: true });

  const [
    poleBaseball,
    poleSoftball,
    poleSoccer,
    hemBaseball
  ] = await Promise.all([
    scrapeCategory(CATEGORIES.poleBaseball),
    scrapeCategory(CATEGORIES.poleSoftball),
    scrapeCategory(CATEGORIES.poleSoccer),
    scrapeCategory(CATEGORIES.hemBaseball)
  ]);

  const poleCsv = readCsvObjects(options.poleCsv);
  const hemCsv = readCsvObjects(options.hemCsv);
  const poleIndexes = indexDesigns([...poleBaseball, ...poleSoftball]);
  const hemIndexes = indexDesigns(hemBaseball);

  const pole = enrichExistingCsv(poleCsv, poleIndexes, "Pole Pocket");
  const hem = enrichExistingCsv(hemCsv, hemIndexes, "Hem & Grommet");
  const soccerRows = generatedSoccerRows(poleSoccer, poleCsv.headers);

  const allOutputRows = [
    ...pole.dedupedRows,
    ...hem.dedupedRows,
    ...soccerRows
  ];

  fs.writeFileSync(path.join(options.outputDir, "shopify_pole_pocket_banners_import_ready.csv"), csvStringify(poleCsv.headers, pole.enrichedRows));
  fs.writeFileSync(path.join(options.outputDir, "shopify_pole_pocket_banners_import_ready_deduped.csv"), csvStringify(poleCsv.headers, pole.dedupedRows));
  fs.writeFileSync(path.join(options.outputDir, "shopify_hem_grommet_baseball_banners_import_ready.csv"), csvStringify(hemCsv.headers, hem.enrichedRows));
  fs.writeFileSync(path.join(options.outputDir, "shopify_hem_grommet_baseball_banners_import_ready_deduped.csv"), csvStringify(hemCsv.headers, hem.dedupedRows));
  fs.writeFileSync(path.join(options.outputDir, "shopify_pole_pocket_soccer_banners_generated.csv"), csvStringify(poleCsv.headers, soccerRows));
  fs.writeFileSync(path.join(options.outputDir, "shopify_three_collection_banner_import_ready.csv"), csvStringify(poleCsv.headers, allOutputRows));

  const reportHeaders = ["handle", "title", "bannerType", "result", "reason", "sourceId", "sourceImage", "sourceSvg", "sourcePage"];
  const reportRows = [
    ...pole.reportRows,
    ...hem.reportRows,
    ...soccerRows.map((row) => {
      const id = String(row.Tags || "").match(/tbd:layout-svg:([^,]+)/)?.[1] || "";
      const sourceSvg = String(row.Tags || "").match(/tbd:source-svg:([^,]+)/)?.[1] || "";
      const sourcePage = String(row.Tags || "").match(/tbd:source-page:([^,]+)/)?.[1] || "";
      return {
        handle: row.Handle,
        title: row.Title,
        bannerType: "Pole Pocket Soccer",
        result: "matched",
        reason: "generated-from-source-category",
        sourceId: id,
        sourceImage: row["Image Src"],
        sourceSvg,
        sourcePage
      };
    })
  ];
  fs.writeFileSync(path.join(options.outputDir, "shopify_import_design_match_report.csv"), csvStringify(reportHeaders, reportRows));

  const matchedDesigns = [
    ...pole.reportRows,
    ...hem.reportRows,
    ...reportRows.filter((row) => row.bannerType === "Pole Pocket Soccer")
  ]
    .filter((row) => row.result === "matched")
    .map((row) => ({
      sourceId: row.sourceId,
      sourceImage: row.sourceImage,
      sourceSvg: row.sourceSvg,
      detailUrl: row.sourcePage
    }));
  const svgDownloads = await downloadSvgs(matchedDesigns);
  const imageDownloads = options.downloadImages ? await maybeDownloadImages(matchedDesigns, options.outputDir) : [];

  const publicProducts = [
    ...productsFromRows(pole.dedupedRows, pole.reportRows, "Pole Pocket"),
    ...productsFromRows(hem.dedupedRows, hem.reportRows, "Hem & Grommet"),
    ...soccerRows.map((row) => {
      const design = {
        sourceId: String(row.Tags || "").match(/tbd:layout-svg:([^,]+)/)?.[1] || "",
        sourceImage: row["Image Src"],
        sourceSvg: String(row.Tags || "").match(/tbd:source-svg:([^,]+)/)?.[1] || "",
        detailUrl: String(row.Tags || "").match(/tbd:source-page:([^,]+)/)?.[1] || "",
        sport: "Soccer",
        bannerType: "Pole Pocket",
        type: row.Type
      };
      const product = productEntryFromDesign(row.Handle, row.Title, row.Type, row.Tags, row["Variant Price"], row["Variant Compare At Price"], design);
      product.__sourceDesign = design;
      product.__matchReason = "generated-from-source-category";
      return product;
    })
  ].filter((product) => product.templateSvg && product.__sourceDesign?.sourceImage);

  if (options.patchPublicMaps) {
    patchPublicMaps(publicProducts);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: options.outputDir,
    sourceCounts: {
      poleBaseball: poleBaseball.length,
      poleSoftball: poleSoftball.length,
      poleSoccer: poleSoccer.length,
      hemBaseball: hemBaseball.length
    },
    csvProducts: {
      polePocket: new Set(poleCsv.rows.map((row) => row.Handle)).size,
      hemGrommet: new Set(hemCsv.rows.map((row) => row.Handle)).size,
      generatedPolePocketSoccer: soccerRows.length,
      mergedImportProducts: new Set(allOutputRows.map((row) => row.Handle)).size
    },
    matched: {
      polePocket: pole.reportRows.filter((row) => row.result === "matched").length,
      hemGrommet: hem.reportRows.filter((row) => row.result === "matched").length,
      generatedPolePocketSoccer: soccerRows.length
    },
    missing: {
      polePocket: pole.reportRows.filter((row) => row.result !== "matched"),
      hemGrommet: hem.reportRows.filter((row) => row.result !== "matched")
    },
    svgDownloads: {
      downloaded: svgDownloads.filter((item) => item.status === "downloaded").length,
      skipped: svgDownloads.filter((item) => item.status === "skipped").length,
      failed: svgDownloads.filter((item) => item.status === "failed")
    },
    imageDownloads: {
      enabled: options.downloadImages,
      downloaded: imageDownloads.filter((item) => item.status === "downloaded").length,
      skipped: imageDownloads.filter((item) => item.status === "skipped").length,
      failed: imageDownloads.filter((item) => item.status === "failed")
    },
    publicMapProductsAddedOrUpdated: options.patchPublicMaps ? publicProducts.length : 0,
    outputFiles: {
      polePocket: path.join(options.outputDir, "shopify_pole_pocket_banners_import_ready.csv"),
      polePocketDeduped: path.join(options.outputDir, "shopify_pole_pocket_banners_import_ready_deduped.csv"),
      hemGrommet: path.join(options.outputDir, "shopify_hem_grommet_baseball_banners_import_ready.csv"),
      hemGrommetDeduped: path.join(options.outputDir, "shopify_hem_grommet_baseball_banners_import_ready_deduped.csv"),
      polePocketSoccer: path.join(options.outputDir, "shopify_pole_pocket_soccer_banners_generated.csv"),
      merged: path.join(options.outputDir, "shopify_three_collection_banner_import_ready.csv"),
      report: path.join(options.outputDir, "shopify_import_design_match_report.csv")
    }
  };

  fs.writeFileSync(path.join(options.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
