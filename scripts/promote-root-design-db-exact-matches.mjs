import fs from "node:fs";
import path from "node:path";

const PRODUCT_MANIFEST = "public/team-banner-products.json";
const SOURCE_MAP_PATH = "public/team-banner-source-svg-map.json";
const CANDIDATE_MAP_PATH = "public/team-banner-source-svg-candidates.json";
const SVG_MANIFEST_PATH = "public/svg-layer-templates.json";
const SVG_DIR = "public/svg-layer-templates";
const OUTPUT_DIR = `outputs/root-svg-exact-promotion-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const DEFAULT_DB_DUMPS = [
  "outputs/true-source-svg-discovery-20260525/designs.teambannersports_com.json",
  "outputs/root-svg-research-20260525/teamsportbanners.designs.json"
];

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

const STOP_WORDS = new Set([
  "baseball",
  "softball",
  "sofball",
  "soccer",
  "banner",
  "banners",
  "triangle",
  "pennant",
  "home",
  "plate",
  "homeplate",
  "pole",
  "pocket",
  "hem",
  "grommet",
  "rectangle",
  "team",
  "teams",
  "sports",
  "sport",
  "create",
  "custom",
  "picture",
  "pictures",
  "image",
  "images",
  "photo",
  "photos",
  "order",
  "individual",
  "great",
  "orange",
  "county",
  "template",
  "templates",
  "poses",
  "cost",
  "field",
  "homemade"
]);

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

function normalizedIdentity(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (/^0+[0-9]+$/.test(token) ? String(Number(token)) : token))
    .filter((token) => !STOP_WORDS.has(token))
    .join(" ");
}

function inferSportOne(value) {
  const text = cleanText(value);
  if (/\bsoftball\b|\bsofball\b/.test(text)) return "softball";
  if (/\bbaseball\b/.test(text)) return "baseball";
  if (/\bsoccer\b/.test(text)) return "soccer";
  return "";
}

function inferSport(values) {
  for (const value of values) {
    const sport = inferSportOne(value);
    if (sport) return sport;
  }
  return "";
}

function inferShapeOne(value) {
  const text = cleanText(value);
  if (/\bpole\b|\bpocket\b/.test(text)) return "polepocket";
  if (/\bhome\s+plate\b|\bhomeplate\b/.test(text)) return "homeplatepennant";
  if (/\btriangle\b|\bpennant\b/.test(text)) return "triangle";
  if (/\bhem\b|\bgrommet\b|\brectangle\b|\bbanner\b/.test(text)) return "rectangle";
  return "";
}

function inferShapeDoc(doc = {}) {
  return inferShapeOne(doc.type)
    || inferShapeOne(doc.label)
    || inferShapeOne(doc.tags)
    || inferShapeOne(doc.svg_url);
}

function filenameBase(value) {
  const raw = String(value || "").split("?", 1)[0].split("#", 1)[0].replace(/\/+$/g, "");
  const base = decodeURIComponent(raw.split("/").pop() || "");
  return base.replace(/\.[a-z0-9]+$/i, "");
}

function adminIdFromUrl(url) {
  return String(url || "").match(/admin-designs\/([0-9]{10,})\.svg/i)?.[1] || "";
}

function localTemplateName(doc = {}) {
  const adminId = adminIdFromUrl(doc.svg_url);
  if (adminId) return adminId;
  return `legacy-${doc._id}`;
}

function publicTemplateUrl(templateName) {
  return `/svg-layer-templates/${encodeURIComponent(templateName)}.svg`;
}

function isGeneratedNative(value) {
  return /(^|\/)generated-native-/i.test(String(value || ""));
}

function existingLocalTemplate(templateName) {
  return templateName && fs.existsSync(path.join(SVG_DIR, `${templateName}.svg`));
}

function loadDocs() {
  const docs = [];
  const seen = new Set();
  for (const dump of DEFAULT_DB_DUMPS) {
    const data = readJson(dump, { docs: [] });
    for (const doc of data.docs || []) {
      if (!doc.svg_url) continue;
      const templateName = localTemplateName(doc);
      const key = `${templateName}:${doc.svg_url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      docs.push({
        dump,
        doc,
        templateName,
        templateSvg: publicTemplateUrl(templateName),
        sourceTemplateSvg: doc.svg_url,
        label: doc.label || "",
        identity: normalizedIdentity(doc.label || doc.tags || ""),
        sport: inferSport([doc.label, doc.tags, doc.alt, doc.svg_url]),
        shape: inferShapeDoc(doc),
        localExists: existingLocalTemplate(templateName)
      });
    }
  }
  return docs;
}

function chooseBestDoc(docs) {
  return docs
    .slice()
    .sort((a, b) => {
      const adminDelta = Number(Boolean(adminIdFromUrl(b.sourceTemplateSvg))) - Number(Boolean(adminIdFromUrl(a.sourceTemplateSvg)));
      if (adminDelta) return adminDelta;
      const localDelta = Number(b.localExists) - Number(a.localExists);
      if (localDelta) return localDelta;
      return String(a.templateName).localeCompare(String(b.templateName), undefined, { numeric: true });
    })[0] || null;
}

function sourceLayerConfig(row, docMatch, templateMeta = {}) {
  const existing = row.layerConfig || {};
  const layoutSvg = docMatch.templateName;
  return {
    ...existing,
    layoutSource: "svg-template",
    layoutSvg,
    layoutSvgUrl: docMatch.templateSvg,
    assetMatchStatus: "root-design-db-label-shape-sport-exact",
    objectLayerMode: "source-svg",
    sourceEditable: true,
    needsSourceSvg: false,
    backgroundUrl: templateMeta.backgroundUrl || existing.backgroundUrl,
    logoUrl: templateMeta.teamLogoUrl || existing.logoUrl,
    clipartUrl: templateMeta.clipartUrl || existing.clipartUrl,
    playerIconUrl: templateMeta.playerIconUrl || existing.playerIconUrl,
    playerIconCount: Number.isFinite(Number(templateMeta.playerIconCount)) ? templateMeta.playerIconCount : existing.playerIconCount,
    playerCount: Number.isFinite(Number(templateMeta.playerCount)) ? templateMeta.playerCount : existing.playerCount,
    textLayerCount: Number.isFinite(Number(templateMeta.textCount)) ? templateMeta.textCount : existing.textLayerCount,
    headerTextCount: Number.isFinite(Number(templateMeta.headerTextCount)) ? templateMeta.headerTextCount : existing.headerTextCount,
    yearTextCount: Number.isFinite(Number(templateMeta.yearTextCount)) ? templateMeta.yearTextCount : existing.yearTextCount,
    backgroundCount: Number.isFinite(Number(templateMeta.backgroundCount)) ? templateMeta.backgroundCount : existing.backgroundCount,
    teamLogoCount: Number.isFinite(Number(templateMeta.teamLogoCount)) ? templateMeta.teamLogoCount : existing.teamLogoCount,
    clipartCount: Number.isFinite(Number(templateMeta.clipartCount)) ? templateMeta.clipartCount : existing.clipartCount
  };
}

function promoteRow(row, docMatch, templateMetaByName) {
  const templateMeta = templateMetaByName.get(docMatch.templateName) || {};
  const score = Math.max(Number(row.matchScore || 0), 1000);
  const margin = Math.max(Number(row.matchMargin || 0), 250);
  const reasons = new Set([
    "root-design-db-label-shape-sport-exact",
    `root-design-db:${docMatch.dump}`,
    `root-design-label:${docMatch.label}`,
    ...(Array.isArray(row.matchReasons) ? row.matchReasons : [])
  ]);

  for (const reason of [...reasons]) {
    if (/source-svg-still-needed|nearest-rmse|no-visual-source|fallback|generated-native/i.test(reason)) {
      reasons.delete(reason);
    }
  }

  return {
    ...row,
    shape: docMatch.shape || row.shape,
    productShape: row.productShape || row.shape || docMatch.shape,
    sourceShape: docMatch.shape || row.sourceShape,
    templateSvg: docMatch.templateSvg,
    sourceTemplateSvg: docMatch.sourceTemplateSvg,
    sourceTemplatePage: row.sourceTemplatePage || "",
    matchStatus: "matched",
    matchScore: score,
    matchMargin: margin,
    matchReasons: [...reasons],
    matchConfidence: "root-design-db-label-shape-sport-exact",
    sourceType: "source-svg",
    editableLayerMode: "source-svg",
    fullyEditable: true,
    sourceEditable: true,
    needsSourceSvg: false,
    layerConfig: sourceLayerConfig(row, docMatch, templateMeta)
  };
}

function productIdentity(product, row) {
  return normalizedIdentity(product?.title || row.title || row.handle);
}

function productSport(product, row) {
  return inferSport([product?.title, row.title, row.handle, product?.tags]);
}

function productShape(product, row) {
  return row.productShape
    || row.shape
    || product?.shape
    || inferShapeOne([product?.title, row.title, row.handle].join(" "));
}

function findMatches(sourceRows, productsByHandle, docs) {
  const exactRows = [];
  const unresolvedRows = [];
  for (const row of sourceRows) {
    if (row.matchStatus === "matched") continue;
    if (isGeneratedNative(row.templateSvg) || isGeneratedNative(row.sourceTemplateSvg)) continue;

    const product = productsByHandle.get(row.handle) || {};
    if (product.status && product.status !== "active") continue;

    const identity = productIdentity(product, row);
    const sport = productSport(product, row);
    const shape = productShape(product, row);
    const candidates = docs.filter((doc) => (
      doc.localExists
      && doc.identity === identity
      && doc.shape === shape
      && (!sport || doc.sport === sport)
    ));
    const chosen = chooseBestDoc(candidates);
    if (chosen) {
      exactRows.push({
        handle: row.handle,
        title: product.title || row.title,
        identity,
        sport,
        shape,
        chosen,
        candidates
      });
    } else {
      unresolvedRows.push({
        handle: row.handle,
        title: product.title || row.title,
        identity,
        sport,
        shape,
        currentTemplate: row.templateSvg || "",
        currentSource: row.sourceTemplateSvg || "",
        matchStatus: row.matchStatus || ""
      });
    }
  }
  return { exactRows, unresolvedRows };
}

function writeCsv(file, headers, rows) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))
  ].join("\n") + "\n");
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const productsJson = readJson(PRODUCT_MANIFEST, { products: [] });
  const products = productsJson.products || [];
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const sourceMap = readJson(SOURCE_MAP_PATH, { maps: [] });
  const candidateMap = readJson(CANDIDATE_MAP_PATH, { maps: [] });
  const svgManifest = readJson(SVG_MANIFEST_PATH, { templates: [] });
  const templateMetaByName = new Map((svgManifest.templates || []).map((template) => [template.name, template]));
  const docs = loadDocs();

  const { exactRows, unresolvedRows } = findMatches(sourceMap.maps || [], productsByHandle, docs);
  const exactByHandle = new Map(exactRows.map((entry) => [entry.handle, entry]));

  const nextSourceRows = (sourceMap.maps || []).map((row) => {
    const match = exactByHandle.get(row.handle);
    return match ? promoteRow(row, match.chosen, templateMetaByName) : row;
  });
  const nextCandidateRows = (candidateMap.maps || []).map((row) => {
    const match = exactByHandle.get(row.handle);
    return match ? promoteRow(row, match.chosen, templateMetaByName) : row;
  });

  const promotedRows = exactRows.map((entry) => ({
    handle: entry.handle,
    title: entry.title,
    identity: entry.identity,
    sport: entry.sport,
    shape: entry.shape,
    templateSvg: entry.chosen.templateSvg,
    sourceTemplateSvg: entry.chosen.sourceTemplateSvg,
    sourceLabel: entry.chosen.label,
    sourceDbDump: entry.chosen.dump,
    candidateCount: entry.candidates.length
  }));

  const summary = {
    generatedAt: new Date().toISOString(),
    apply: shouldApply,
    dbDumps: DEFAULT_DB_DUMPS,
    sourceRows: (sourceMap.maps || []).length,
    exactRootMatches: exactRows.length,
    unresolvedNeedsRoot: unresolvedRows.length,
    promotedRows: promotedRows.length,
    outputDir: OUTPUT_DIR
  };

  writeJson(path.join(OUTPUT_DIR, "summary.json"), summary);
  writeJson(path.join(OUTPUT_DIR, "root-svg-exact-promotions.json"), promotedRows);
  writeJson(path.join(OUTPUT_DIR, "root-svg-unresolved.json"), unresolvedRows);
  writeCsv(path.join(OUTPUT_DIR, "root-svg-exact-promotions.csv"), [
    "handle",
    "title",
    "identity",
    "sport",
    "shape",
    "templateSvg",
    "sourceTemplateSvg",
    "sourceLabel",
    "sourceDbDump",
    "candidateCount"
  ], promotedRows);
  writeCsv(path.join(OUTPUT_DIR, "root-svg-unresolved.csv"), [
    "handle",
    "title",
    "identity",
    "sport",
    "shape",
    "currentTemplate",
    "currentSource",
    "matchStatus"
  ], unresolvedRows);

  if (shouldApply) {
    writeJson(SOURCE_MAP_PATH, {
      ...sourceMap,
      rootDesignDbExactPromotedAt: summary.generatedAt,
      rootDesignDbExactPromotionPolicy: "Promote only local root/native SVGs whose design DB label identity, sport, and banner shape exactly match the Shopify product.",
      matchedCount: nextSourceRows.filter((row) => row.matchStatus === "matched").length,
      verifiedMatchedCount: nextSourceRows.filter((row) => row.matchStatus === "matched").length,
      reviewCount: nextSourceRows.filter((row) => row.matchStatus === "review").length,
      candidateCount: nextSourceRows.filter((row) => row.matchStatus === "candidate").length,
      missingCount: nextSourceRows.filter((row) => !row.matchStatus || row.matchStatus === "missing").length,
      sourceEditableCount: nextSourceRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
      needsSourceSvgCount: nextSourceRows.filter((row) => row.needsSourceSvg || row.editableLayerMode === "needs-source-svg").length,
      maps: nextSourceRows
    });
    writeJson(CANDIDATE_MAP_PATH, {
      ...candidateMap,
      rootDesignDbExactPromotedAt: summary.generatedAt,
      sourceEditableCount: nextCandidateRows.filter((row) => row.sourceEditable || row.editableLayerMode === "source-svg").length,
      needsSourceSvgCount: nextCandidateRows.filter((row) => row.needsSourceSvg || row.editableLayerMode === "needs-source-svg").length,
      maps: nextCandidateRows
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main();
