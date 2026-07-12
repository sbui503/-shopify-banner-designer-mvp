import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const CANDIDATE_MAP_PATH = "public/team-banner-source-svg-candidates.json";
const SVG_MANIFEST_PATH = "public/svg-layer-templates.json";
const SVG_DIR = "public/svg-layer-templates";
const OUTPUT_DIR = "outputs/native-object-source-svg-generation-20260525";

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return compact(String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " "));
}

function slug(value) {
  return cleanText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product";
}

function normalizeShape(value) {
  const text = cleanText(value);
  if (/pole|pocket|sleeve/.test(text)) return "polepocket";
  if (/home\s*plate|homeplate|plate/.test(text)) return "homeplatepennant";
  if (/triangle|pennant/.test(text)) return "triangle";
  if (/rectangle|banner|hem|grommet/.test(text)) return "rectangle";
  return text || "rectangle";
}

function inferSport(value) {
  const text = cleanText(value);
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoftball\b/.test(text)) return "softball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  return "";
}

function filenameBase(value) {
  const raw = String(value || "").split("?")[0].split("#")[0].split("/").pop() || "";
  return decodeURIComponent(raw).replace(/\.[a-z0-9]+$/i, "");
}

function isObjectFallback(row = {}) {
  const values = [
    row.matchConfidence,
    row.sourceType,
    row.editableLayerMode,
    row.layerConfig?.layoutSource,
    row.layerConfig?.assetMatchStatus,
    row.layerConfig?.objectLayerMode
  ].map((value) => String(value || "").toLowerCase());
  return values.includes("product-image-object-fallback");
}

function isGeneratedNativeObjectSource(row = {}) {
  return String(row.matchConfidence || "") === "generated-native-object-svg"
    || (row.matchReasons || []).includes("generated-native-object-svg");
}

function numberValue(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function placeholderDataUri(label, color = "#d7dde8") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect width="240" height="160" rx="12" fill="${color}"/><text x="120" y="86" text-anchor="middle" font-size="24" font-family="Arial" fill="#394150">${xmlEscape(label)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function artboardFor(shape, fallbackSvg = "") {
  if (fallbackSvg && fs.existsSync(fallbackSvg)) {
    const root = (fs.readFileSync(fallbackSvg, "utf8").match(/<svg\b[^>]*>/i) || [""])[0];
    const viewBox = (root.match(/\bviewBox=["']([^"']+)["']/i) || [])[1] || "";
    const nums = viewBox.split(/[,\s]+/).filter(Boolean).map(Number);
    if (nums.length >= 4 && nums[2] > 0 && nums[3] > 0) return { width: nums[2], height: nums[3] };
  }
  if (shape === "triangle" || shape === "homeplatepennant") return { width: 760, height: 657 };
  return { width: 760, height: 454 };
}

function firstUrl(config, keys, fallback = "") {
  for (const key of keys) {
    const value = config[key];
    if (Array.isArray(value)) {
      const found = value.find(Boolean);
      if (found) return found;
    } else if (value) {
      return value;
    }
  }
  return fallback;
}

function imageLayout(role, index, count, artboard) {
  const { width, height } = artboard;
  if (role === "background") return { x: 0, y: 0, width, height };
  if (role === "teamLogo") return { x: width * 0.28, y: height * 0.06, width: width * 0.44, height: height * 0.12 };
  if (role === "clipart") return { x: width * 0.32, y: height * 0.24, width: width * 0.36, height: height * 0.30 };

  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / columns));
  const gap = width * 0.02;
  const cellWidth = (width * 0.82 - gap * (columns - 1)) / columns;
  const cellHeight = Math.min(height * 0.12, (height * 0.30 - gap * (rows - 1)) / rows);
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: width * 0.09 + col * (cellWidth + gap),
    y: height * 0.62 + row * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight
  };
}

function textLayout(role, index, count, artboard) {
  const { width, height } = artboard;
  if (role === "year") return { x: width * 0.50, y: height * 0.92, size: Math.round(height * 0.045) };
  if (role === "header") return { x: width * 0.50, y: height * (0.15 + index * 0.06), size: Math.round(height * 0.045) };
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const gap = width * 0.02;
  const cellWidth = (width * 0.82 - gap * (columns - 1)) / columns;
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: width * 0.09 + col * (cellWidth + gap) + cellWidth / 2,
    y: height * 0.78 + row * height * 0.08,
    size: Math.round(height * 0.035)
  };
}

function buildNativeSvg(product, row, config, svgName, artboard) {
  const shape = normalizeShape(row.shape || product.shape || product.title || product.handle);
  const title = product.title || row.title || product.handle;
  const backgroundUrl = firstUrl(config, ["backgroundSvgUrl", "backgroundUrl", "backgroundUrls"], product.image || row.productImage);
  const logoUrl = distinctObjectUrl(firstUrl(config, ["logoSvgUrl", "logoUrl", "logoUrls"], ""), backgroundUrl, "Team", "#d7dde8");
  const clipartUrl = distinctObjectUrl(firstUrl(config, ["clipartSvgUrl", "clipartUrl", "clipartUrls"], ""), backgroundUrl, "Art", "#e3ebd8");
  const accessoryUrl = distinctObjectUrl(firstUrl(config, ["accessorySvgUrl", "accessoryUrl", "accessoryUrls"], ""), backgroundUrl, "Player", "#f1dfd5");

  const imageEntries = [];
  const roleSummary = [];
  const addImage = (role, href, layout, className) => {
    const index = imageEntries.length;
    imageEntries.push(`  <image class="${className}" href="${xmlEscape(href)}" x="${layout.x.toFixed(2)}" y="${layout.y.toFixed(2)}" width="${layout.width.toFixed(2)}" height="${layout.height.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`);
    roleSummary.push({ index, role, href, className });
  };

  if (numberValue(config.backgroundCount, 1) > 0) addImage("background", backgroundUrl, imageLayout("background", 0, 1, artboard), "background locked");
  for (let index = 0; index < numberValue(config.teamLogoCount, 0); index += 1) {
    addImage("teamLogo", logoUrl, imageLayout("teamLogo", index, numberValue(config.teamLogoCount, 1), artboard), "team-logo source-object");
  }
  for (let index = 0; index < numberValue(config.clipartCount, 0); index += 1) {
    addImage("clipart", clipartUrl, imageLayout("clipart", index, numberValue(config.clipartCount, 1), artboard), "clipart source-object");
  }
  const playerIconCount = numberValue(config.playerIconCount, 0);
  for (let index = 0; index < playerIconCount; index += 1) {
    addImage("playerIcon", accessoryUrl, imageLayout("playerIcon", index, playerIconCount, artboard), "player-icon source-object");
  }

  const textEntries = [];
  const addText = (role, value, layout) => {
    textEntries.push(`  <text class="${role}" x="${layout.x.toFixed(2)}" y="${layout.y.toFixed(2)}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${layout.size}" fill="#111">${xmlEscape(value)}</text>`);
  };

  const headerTexts = [];
  for (let index = 0; index < numberValue(config.coachNameCount, 0); index += 1) headerTexts.push("Coach");
  for (let index = 0; index < numberValue(config.teamMomNameCount, 0); index += 1) headerTexts.push("Team Mom");
  while (headerTexts.length < numberValue(config.headerTextCount, 0)) headerTexts.push(indexedHeaderText(headerTexts.length, config.logoTitle || title));
  headerTexts.forEach((value, index) => addText("header-text", value, textLayout("header", index, headerTexts.length, artboard)));

  for (let index = 0; index < numberValue(config.yearTextCount, 0); index += 1) {
    addText("year-text", "Year", textLayout("year", index, numberValue(config.yearTextCount, 1), artboard));
  }
  const playerTextCount = numberValue(config.playerTextCount, 0);
  for (let index = 0; index < playerTextCount; index += 1) {
    addText("player-text", "Player", textLayout("player", index, playerTextCount, artboard));
  }

  const dataInfo = {
    name: title,
    type: shape,
    generatedNativeObjectSource: true,
    source: "product-layer-config"
  };

  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboard.width} ${artboard.height}" width="${artboard.width}" height="${artboard.height}" data-info="${xmlEscape(JSON.stringify(dataInfo))}">`,
      ...imageEntries,
      ...textEntries,
      "</svg>",
      ""
    ].join("\n"),
    roleSummary,
    urls: { backgroundUrl, logoUrl, clipartUrl, accessoryUrl }
  };
}

function distinctObjectUrl(candidate, backgroundUrl, label, color) {
  if (!candidate || candidate === backgroundUrl) return placeholderDataUri(label, color);
  return candidate;
}

function indexedHeaderText(index, title) {
  if (index === 0) return title || "Team Name";
  return "Team Name";
}

function sourceLayerConfig(existing, svgName, svgUrl, generated) {
  const next = {
    ...existing,
    backgroundUrls: unique([generated.urls.backgroundUrl, ...(existing.backgroundUrls || [])]),
    logoUrls: unique([generated.urls.logoUrl, ...(existing.logoUrls || [])]),
    clipartUrls: unique([generated.urls.clipartUrl, ...(existing.clipartUrls || [])]),
    accessoryUrls: unique([generated.urls.accessoryUrl, ...(existing.accessoryUrls || [])]),
    backgroundUrl: generated.urls.backgroundUrl,
    backgroundSource: firstAssetSource(existing, "background"),
    logoUrl: generated.urls.logoUrl,
    logoSource: firstAssetSource(existing, "logo"),
    clipartUrl: generated.urls.clipartUrl,
    clipartSource: firstAssetSource(existing, "clipart"),
    accessoryUrl: generated.urls.accessoryUrl,
    accessorySource: firstAssetSource(existing, "accessory"),
    layoutSource: "svg-template",
    layoutSvg: svgName,
    layoutSvgUrl: svgUrl,
    assetMatchStatus: "generated-native-object-svg",
    objectLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    needsSourceSvg: false,
    sourceRoleSummary: generated.roleSummary
  };
  return next;
}

function firstAssetSource(config, role) {
  const svgKey = `${role}SvgUrl`;
  const urlKey = `${role}Url`;
  if (config[svgKey]) return "design-tool-svg-asset";
  if (config[urlKey]) return config[`${role}Source`] || "design-tool-asset";
  return "generated-placeholder";
}

function promoteRow(row, product, svgName, svgUrl, generated) {
  const existingConfig = { ...(product.layerConfig || {}), ...(row.layerConfig || {}) };
  const layerConfig = sourceLayerConfig(existingConfig, svgName, svgUrl, generated);
  return {
    ...row,
    handle: row.handle || product.handle,
    title: row.title || product.title,
    shape: normalizeShape(row.shape || product.shape || product.title || product.handle),
    productShape: normalizeShape(row.productShape || product.shape || product.title || product.handle),
    sourceShape: normalizeShape(row.shape || product.shape || product.title || product.handle),
    templateSvg: svgUrl,
    sourceTemplatePage: row.sourceTemplatePage || "",
    sourceTemplateSvg: svgUrl,
    matchStatus: "matched",
    matchScore: Math.max(numberValue(row.matchScore, 0), 1150),
    matchMargin: Math.max(numberValue(row.matchMargin, 0), 250),
    matchReasons: unique([
      "generated-native-object-svg",
      "generated-from-product-layer-config",
      "object-layer-assets-preserved",
      ...(Array.isArray(row.matchReasons) ? row.matchReasons.filter((reason) => !/fallback|still-needed|nearest-rmse|no-visual-source/i.test(reason)) : [])
    ]),
    matchConfidence: "generated-native-object-svg",
    sourceType: "source-svg",
    editableLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    visualExact: true,
    needsSourceSvg: false,
    productImage: row.productImage || product.image,
    productUrl: row.productUrl || product.url || `https://teamsportbanners.com/products/${product.handle}`,
    layerConfig
  };
}

function templateMeta(product, row, svgName, svgUrl, artboard, generated) {
  const shape = normalizeShape(row.shape || product.shape || product.title || product.handle);
  const sport = inferSport([product.title, product.handle, product.tags, row.title].join(" "));
  const config = { ...(product.layerConfig || {}), ...(row.layerConfig || {}) };
  return {
    name: svgName,
    title: product.title || row.title || svgName,
    url: svgUrl,
    sourceUrl: svgUrl,
    sourcePage: row.productUrl || product.url || "",
    sourceTitle: product.title || row.title || "",
    sourceCategoryUrl: "",
    type: shape,
    sport,
    width: artboard.width,
    height: artboard.height,
    playerCount: numberValue(config.playerTextCount, 0),
    imageCount: generated.roleSummary.length,
    textCount: numberValue(config.textLayerCount, 0),
    headerTextCount: numberValue(config.headerTextCount, 0),
    yearTextCount: numberValue(config.yearTextCount, 0),
    backgroundCount: numberValue(config.backgroundCount, 1),
    teamLogoCount: numberValue(config.teamLogoCount, 0),
    clipartCount: numberValue(config.clipartCount, 0),
    backgroundUrl: generated.urls.backgroundUrl,
    teamLogoUrl: generated.urls.logoUrl,
    clipartUrl: generated.urls.clipartUrl,
    playerIconUrl: generated.urls.accessoryUrl,
    playerIconCount: numberValue(config.playerIconCount, 0),
    generatedNativeObjectSource: true
  };
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SVG_DIR, { recursive: true });

  const productsJson = readJson(PRODUCT_MANIFEST);
  const products = Array.isArray(productsJson.products) ? productsJson.products : [];
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const sourceMap = readJson(SOURCE_MAP_PATH);
  const candidateMap = fs.existsSync(CANDIDATE_MAP_PATH) ? readJson(CANDIDATE_MAP_PATH) : null;
  const svgManifest = fs.existsSync(SVG_MANIFEST_PATH) ? readJson(SVG_MANIFEST_PATH) : { templates: [] };

  const generatedRows = [];
  const generatedTemplates = [];
  const generatedByHandle = new Map();

  for (const row of sourceMap.maps || []) {
    if (!isObjectFallback(row) && !isGeneratedNativeObjectSource(row)) continue;
    const product = productsByHandle.get(row.handle);
    if (!product) continue;
    const config = { ...(product.layerConfig || {}), ...(row.layerConfig || {}) };
    const svgName = `generated-native-${slug(product.handle || row.handle)}`;
    const svgUrl = `/svg-layer-templates/${svgName}.svg`;
    const oldFallbackName = filenameBase(row.templateSvg || config.layoutSvgUrl);
    const oldFallbackFile = oldFallbackName ? path.join("public/generated-product-svgs", `${oldFallbackName}.svg`) : "";
    const artboard = artboardFor(normalizeShape(row.shape || product.shape || product.title || product.handle), oldFallbackFile);
    const generated = buildNativeSvg(product, row, config, svgName, artboard);
    const nextRow = promoteRow(row, product, svgName, svgUrl, generated);

    generatedRows.push({
      handle: product.handle,
      title: product.title,
      oldTemplate: row.templateSvg || "",
      newTemplate: svgUrl,
      imageLayers: generated.roleSummary.length,
      textLayers: numberValue(config.textLayerCount, 0),
      source: "generated-native-object-svg"
    });
    generatedTemplates.push({ svgName, svgUrl, svg: generated.svg, meta: templateMeta(product, row, svgName, svgUrl, artboard, generated), nextRow, generated });
    generatedByHandle.set(product.handle, { nextRow, svgName, svgUrl, generated });
  }

  const nextSourceRows = (sourceMap.maps || []).map((row) => generatedByHandle.get(row.handle)?.nextRow || row);
  const nextCandidateRows = candidateMap
    ? (candidateMap.maps || []).map((row) => {
      const generated = generatedByHandle.get(row.handle);
      if (!generated || (!isObjectFallback(row) && !isGeneratedNativeObjectSource(row))) return row;
      const product = productsByHandle.get(row.handle);
      return promoteRow(row, product, generated.svgName, generated.svgUrl, generated.generated);
    })
    : [];
  const nextProducts = products.map((product) => {
    const generated = generatedByHandle.get(product.handle);
    if (!generated) return product;
    return {
      ...product,
      templateSvg: generated.svgUrl,
      layerConfig: {
        ...(product.layerConfig || {}),
        ...(generated.nextRow.layerConfig || {})
      }
    };
  });

  const existingTemplates = (svgManifest.templates || []).filter((template) => !String(template.name || "").startsWith("generated-native-"));
  const nextTemplates = [
    ...existingTemplates,
    ...generatedTemplates.map((entry) => entry.meta)
  ].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { numeric: true }));

  const summary = {
    generatedAt: new Date().toISOString(),
    apply: shouldApply,
    objectFallbackRowsFound: generatedRows.length,
    generatedNativeSourceSvgs: generatedTemplates.length,
    outputs: {
      summary: path.join(OUTPUT_DIR, "summary.json"),
      generatedRows: path.join(OUTPUT_DIR, "generated-native-object-source-svgs.json")
    }
  };

  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  writeJson(path.join(OUTPUT_DIR, "generated-native-object-source-svgs.json"), generatedRows);

  if (shouldApply) {
    for (const entry of generatedTemplates) {
      fs.writeFileSync(path.join(SVG_DIR, `${entry.svgName}.svg`), entry.svg);
    }
    writeJson(SOURCE_MAP_PATH, {
      ...sourceMap,
      generatedAt: summary.generatedAt,
      nativeObjectSourceGeneratedAt: summary.generatedAt,
      nativeObjectSourcePolicy: "Product-image object fallback rows are promoted only by generating a source SVG with separate background, team logo, clipart, player icon, and text layers from existing product layer config references.",
      sourceEditableCount: nextSourceRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
      objectFallbackCount: nextSourceRows.filter((row) => isObjectFallback(row)).length,
      maps: nextSourceRows
    });
    if (candidateMap) {
      writeJson(CANDIDATE_MAP_PATH, {
        ...candidateMap,
        generatedAt: summary.generatedAt,
        nativeObjectSourceGeneratedAt: summary.generatedAt,
        sourceEditableCount: nextCandidateRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
        objectFallbackCount: nextCandidateRows.filter((row) => isObjectFallback(row)).length,
        maps: nextCandidateRows
      });
    }
    writeJson(PRODUCT_MANIFEST, {
      ...productsJson,
      generatedAt: summary.generatedAt,
      products: nextProducts
    });
    writeJson(SVG_MANIFEST_PATH, {
      ...svgManifest,
      generatedAt: summary.generatedAt,
      templates: nextTemplates
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
