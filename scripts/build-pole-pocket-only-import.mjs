import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SVG_DIR = path.join(PUBLIC_DIR, "svg-layer-templates");
const OUTPUT_DIR = path.join(ROOT, "outputs", "shopify-import-ready-20260523");
const TEMPLATE_CSV = "/Users/si/Downloads/Team Sport Banner Product template - Sheet1.csv";
const SHOPIFY_FILES_BASE = "https://cdn.shopify.com/s/files/1/0649/3844/2958/files/";

const CATEGORIES = [
  {
    key: "pole-pocket-baseball",
    baseUrl: "https://teambannersports.com/baseball-banners/pole-pocket-baseball-banners",
    sport: "Baseball",
    typeLabel: "Pole Pocket Baseball Banner",
    skuPrefix: "PPB"
  },
  {
    key: "pole-pocket-softball",
    baseUrl: "https://teambannersports.com/softball-banners/pole-pocket-softball-banners",
    sport: "Softball",
    typeLabel: "Pole Pocket Softball Banner",
    skuPrefix: "PPSB"
  },
  {
    key: "pole-pocket-soccer",
    baseUrl: "https://teambannersports.com/soccer-banners/pole-pocket-soccer-banners",
    sport: "Soccer",
    typeLabel: "Pole Pocket Soccer Banner",
    skuPrefix: "PPSC"
  }
];

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

function teamNameFromTitle(title = "") {
  return String(title)
    .replace(/\s*[-–]\s*/g, " ")
    .replace(/\b(Baseball|Softball|Soccer|Banner|Banners|Pole|Pocket|Hem|Grommet|Grommets)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function designSlugFromHref(href = "") {
  return String(href).split("?")[0].split("/").filter(Boolean).pop()?.replace(/-\d+$/, "") || "";
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

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "Codex TeamBannerSports pole-pocket import builder" } });
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
      const livePath = decodeHtml(match[4]);
      const liveUrl = new URL(livePath, category.baseUrl);
      const sourceSvg = liveUrl.searchParams.get("u") ? decodeURIComponent(liveUrl.searchParams.get("u")) : liveUrl.href;
      const sourceId = sourceSvg.match(/admin-designs\/(\d+)\.svg/i)?.[1] || "";
      if (!sourceId) continue;
      const detailUrl = new URL(detailPath, category.baseUrl).href;
      const sourceTitle = titleCaseFromSlug(designSlugFromHref(detailPath));
      designs.push({
        ...category,
        sourceId,
        sourceTitle,
        sourceImage: image,
        sourceSvg,
        detailUrl,
        pageUrl: url
      });
    }
  }
  return designs;
}

async function downloadFile(url, file) {
  if (!url || fs.existsSync(file)) return { status: "skipped", file };
  const response = await fetch(url, { headers: { "user-agent": "Codex TeamBannerSports pole-pocket import builder" } });
  if (!response.ok) return { status: "failed", file, statusCode: response.status };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return { status: "downloaded", file };
}

async function downloadAssets(designs) {
  const imageDir = path.join(OUTPUT_DIR, "images");
  fs.mkdirSync(SVG_DIR, { recursive: true });
  fs.mkdirSync(imageDir, { recursive: true });
  const unique = [...new Map(designs.map((design) => [design.sourceId, design])).values()];
  const results = [];
  for (let i = 0; i < unique.length; i += 8) {
    const chunk = unique.slice(i, i + 8);
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
  return [
    team,
    "pole pocket",
    design.sport.toLowerCase(),
    "customizable",
    "team banner",
    "tbd:layered",
    "tbd:shape:polepocket",
    "tbd:background:1",
    "tbd:layout-source:svg-template",
    `tbd:layout-svg:${design.sourceId}`,
    `tbd:source-svg:${design.sourceSvg}`,
    `tbd:source-image:${design.sourceImage}`,
    `tbd:source-page:${design.detailUrl}`,
    `tbd:collection:${design.key}`,
    "tbd:banner-type:pole-pocket",
    `tbd:sport:${design.sport.toLowerCase()}`,
    `tbd:team-logo-title:${team}`,
    "tbd:asset-match:complete"
  ];
}

function rowFromDesign(headers, templateDefaults, design, index, usedHandles) {
  const title = design.sourceTitle;
  const team = teamNameFromTitle(title);
  const baseHandle = `pole-pocket-${slugify(title).replace(/-banners?$/, "")}`;
  let handle = baseHandle;
  if (usedHandles.has(handle)) handle = `${baseHandle}-${design.sourceId}`;
  usedHandles.add(handle);
  const body = `Customizable ${design.sport.toLowerCase()} pole pocket banner for ${team}. Printed on heavy-duty vinyl with vibrant, weather-resistant inks. Fits standard poles with top and bottom pole pockets. Perfect for dugouts, fences, and team photos. Fast 1-3 day shipping.`;
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
    "Variant Grams": "0",
    "Variant Inventory Tracker": "shopify",
    "Variant Inventory Policy": templateDefaults["Variant Inventory Policy"] || "deny",
    "Variant Fulfillment Service": "manual",
    "Variant Price": templateDefaults["Variant Price"] || "79.99",
    "Variant Compare At Price": templateDefaults["Variant Compare At Price"] || "119",
    "Variant Requires Shipping": "TRUE",
    "Variant Taxable": "TRUE",
    "Image Src": shopifyImageUrl(design.sourceId),
    "Image Position": "1",
    "Image Alt Text": `${team} - ${design.sport} - Pole Pocket Banner`,
    "Gift Card": templateDefaults["Gift Card"] || "FALSE",
    "SEO Title": `Custom ${team} Pole Pocket ${design.sport} Banner | Team Sport Banners`,
    "SEO Description": `Get your custom ${team} ${design.sport.toLowerCase()} pole pocket banner. Durable vinyl, full-color print, and fast shipping. Design your team banner today!`,
    "Google Shopping / Custom Product": templateDefaults["Google Shopping / Custom Product"] || "",
    "Google: Custom Product (product.metafields.mm-google-shopping.custom_product)": templateDefaults["Google: Custom Product (product.metafields.mm-google-shopping.custom_product)"] || "",
    "Condition (product.metafields.shopify.condition)": templateDefaults["Condition (product.metafields.shopify.condition)"] || "excellent-ex; graded; very-good-vg",
    "Sport (product.metafields.shopify.sport)": design.sport,
    "Variant Image": shopifyImageUrl(design.sourceId),
    "Variant Weight Unit": templateDefaults["Variant Weight Unit"] || "lb",
    "Status": "active"
  };
  return Object.fromEntries(headers.map((header) => [header, row[header] || ""]));
}

function loadJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function patchPublicMaps(rowsByDesign) {
  const productsFile = path.join(PUBLIC_DIR, "team-banner-products.json");
  const sourceMapFile = path.join(PUBLIC_DIR, "team-banner-source-svg-map.json");
  const candidatesFile = path.join(PUBLIC_DIR, "team-banner-source-svg-candidates.json");
  const productsData = loadJson(productsFile, { products: [] });
  const byHandle = new Map((productsData.products || []).map((product) => [product.handle, product]));

  for (const { row, design } of rowsByDesign) {
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
      shape: "polepocket",
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
    });
  }
  fs.writeFileSync(productsFile, `${JSON.stringify({ ...productsData, products: [...byHandle.values()], count: byHandle.size, updatedForPolePocketAllPagesAt: new Date().toISOString() }, null, 2)}\n`);

  for (const file of [sourceMapFile, candidatesFile]) {
    const data = loadJson(file, { maps: [] });
    const byMapHandle = new Map((data.maps || []).map((entry) => [entry.handle || entry.productHandle, entry]));
    for (const { row, design } of rowsByDesign) {
      const layerConfig = byHandle.get(row.Handle)?.layerConfig || {};
      byMapHandle.set(row.Handle, {
        handle: row.Handle,
        productHandle: row.Handle,
        title: row.Title,
        titleSlug: slugify(row.Title),
        shape: "polepocket",
        productShape: "polepocket",
        templateSvg: `/svg-layer-templates/${design.sourceId}.svg`,
        sourceTemplatePage: design.detailUrl,
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
        layerConfig
      });
    }
    fs.writeFileSync(file, `${JSON.stringify({ ...data, maps: [...byMapHandle.values()], count: byMapHandle.size, updatedForPolePocketAllPagesAt: new Date().toISOString() }, null, 2)}\n`);
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const template = readCsvObjects(TEMPLATE_CSV);
  const headers = template.headers;
  const templateDefaults = template.rows[0] || {};
  const scraped = (await Promise.all(CATEGORIES.map(scrapeCategory))).flat();
  const designs = [...new Map(scraped.map((design) => [design.sourceId, design])).values()];
  const usedHandles = new Set();
  const rowsByDesign = designs.map((design, index) => {
    const row = rowFromDesign(headers, templateDefaults, design, index, usedHandles);
    return { row, design };
  });
  const rows = rowsByDesign.map(({ row }) => row);
  const outputCsv = path.join(OUTPUT_DIR, "shopify_pole_pocket_all_pages_team_sport_banners_vendor.csv");
  fs.writeFileSync(outputCsv, csvStringify(headers, rows));

  const groupedDir = path.join(OUTPUT_DIR, "images-by-banner-type-pole-pocket-all-pages");
  fs.rmSync(groupedDir, { recursive: true, force: true });
  await downloadAssets(designs);
  const folderCounts = new Map();
  for (const { design } of rowsByDesign) {
    const source = path.join(OUTPUT_DIR, "images", `${design.sourceId}.png`);
    if (!fs.existsSync(source)) continue;
    const folder = `${design.key}`;
    const targetDir = path.join(groupedDir, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(source, path.join(targetDir, `${design.sourceId}.png`));
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
  }
  patchPublicMaps(rowsByDesign);

  const summary = {
    generatedAt: new Date().toISOString(),
    outputCsv,
    groupedImageDir: groupedDir,
    products: rows.length,
    sourceDesigns: designs.length,
    folders: Object.fromEntries([...folderCounts.entries()].sort()),
    sourcePagesChecked: CATEGORIES.map((category) => category.baseUrl),
    note: "Hem-grommet products are excluded. Baseball source pages currently contain products on pages 1-5; pages 6+ return 404."
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "pole-pocket-all-pages-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
