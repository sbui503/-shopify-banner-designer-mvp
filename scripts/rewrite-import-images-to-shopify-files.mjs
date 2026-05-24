import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_DIR = path.join(ROOT, "outputs", "shopify-import-ready-20260523");
const SHOPIFY_FILES_BASE = process.env.SHOPIFY_FILES_BASE || "https://cdn.shopify.com/s/files/1/0649/3844/2958/files/";

const IMPORT_CSVS = [
  "shopify_pole_pocket_banners_import_ready.csv",
  "shopify_pole_pocket_banners_import_ready_deduped.csv",
  "shopify_hem_grommet_baseball_banners_import_ready.csv",
  "shopify_hem_grommet_baseball_banners_import_ready_deduped.csv",
  "shopify_pole_pocket_soccer_banners_generated.csv",
  "shopify_three_collection_banner_import_ready.csv"
];

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

function readCsv(file) {
  const rows = csvParse(fs.readFileSync(file, "utf8"));
  const headers = rows.shift();
  return {
    headers,
    rows: rows
      .filter((row) => row.some((cell) => String(cell || "").trim()))
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])))
  };
}

function shopifyImageUrl(sourceId) {
  const base = SHOPIFY_FILES_BASE.endsWith("/") ? SHOPIFY_FILES_BASE : `${SHOPIFY_FILES_BASE}/`;
  return `${base}${sourceId}.png`;
}

function loadJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function rewriteCsvs(reportRows) {
  const sourceByHandle = new Map(reportRows.map((row) => [row.handle, row.sourceId]).filter(([, sourceId]) => sourceId));
  const outputFiles = [];
  for (const name of IMPORT_CSVS) {
    const file = path.join(OUTPUT_DIR, name);
    if (!fs.existsSync(file)) continue;
    const csv = readCsv(file);
    const rows = csv.rows.map((row) => {
      if (!row["Image Src"]) return row;
      const sourceId = sourceByHandle.get(row.Handle);
      return sourceId ? { ...row, "Image Src": shopifyImageUrl(sourceId) } : row;
    });
    const outputName = name.replace(/\.csv$/i, "_shopify_files.csv");
    const outputFile = path.join(OUTPUT_DIR, outputName);
    fs.writeFileSync(outputFile, csvStringify(csv.headers, rows));
    outputFiles.push(outputFile);
  }
  return outputFiles;
}

function patchDesignerMaps(reportRows) {
  const imageByHandle = new Map(
    reportRows
      .filter((row) => row.handle && row.sourceId)
      .map((row) => [row.handle, shopifyImageUrl(row.sourceId)])
  );
  const updateEntry = (entry) => {
    const handle = entry.handle || entry.productHandle;
    const image = imageByHandle.get(handle);
    if (!image) return entry;
    const layerConfig = entry.layerConfig ? { ...entry.layerConfig, backgroundUrl: entry.layerConfig.backgroundUrl || image } : entry.layerConfig;
    return {
      ...entry,
      image: entry.image ? image : entry.image,
      productImage: entry.productImage ? image : entry.productImage,
      layerConfig
    };
  };

  const productsFile = path.join(PUBLIC_DIR, "team-banner-products.json");
  const productsData = loadJson(productsFile, { products: [] });
  const products = (productsData.products || []).map((product) => {
    const image = imageByHandle.get(product.handle);
    if (!image) return product;
    return { ...product, image, layerConfig: product.layerConfig ? { ...product.layerConfig, backgroundUrl: product.layerConfig.backgroundUrl || image } : product.layerConfig };
  });
  writeJson(productsFile, { ...productsData, products, updatedForShopifyFileImagesAt: new Date().toISOString() });

  for (const name of ["team-banner-source-svg-map.json", "team-banner-source-svg-candidates.json"]) {
    const file = path.join(PUBLIC_DIR, name);
    const data = loadJson(file, { maps: [] });
    writeJson(file, { ...data, maps: (data.maps || []).map(updateEntry), updatedForShopifyFileImagesAt: new Date().toISOString() });
  }
}

function main() {
  const report = readCsv(path.join(OUTPUT_DIR, "shopify_import_design_match_report.csv"));
  const matchedRows = report.rows.filter((row) => row.result === "matched" && row.sourceId);
  const outputFiles = rewriteCsvs(matchedRows);
  patchDesignerMaps(matchedRows);
  const imageDir = path.join(OUTPUT_DIR, "images");
  const localImageCount = fs.existsSync(imageDir) ? fs.readdirSync(imageDir).filter((file) => /\.png$/i.test(file)).length : 0;
  const summary = {
    generatedAt: new Date().toISOString(),
    shopifyFilesBase: SHOPIFY_FILES_BASE,
    matchedRows: matchedRows.length,
    localImageCount,
    outputFiles
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "shopify-files-url-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main();
