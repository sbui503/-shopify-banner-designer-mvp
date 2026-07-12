import fs from "node:fs";
import path from "node:path";

const ROOT = "https://teambannersports.com";
const OUTPUT_DIR = `outputs/rectangle-baseball-softball-missing-svg-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const FALLBACKS_CSV = "outputs/product-graphic-qa-20260524-current-final-verify/product-graphic-qa-object-fallbacks.csv";
const SOURCE_SVGS_CSV = "outputs/teambannersports-collection-scrape-20260524/source-svgs.csv";
const SOURCE_PAGES_CSV = "outputs/teambannersports-collection-scrape-20260524/team-banner-pages.csv";
const SOURCE_MAP_JSON = "public/team-banner-source-svg-map.json";
const SVG_DIR = "public/svg-layer-templates";
const ADMIN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";

const COLLECTIONS = [
  {
    sport: "baseball",
    bannerType: "rectangle",
    url: `${ROOT}/baseball-banners/hem-grommets-baseball-banners`,
  },
  {
    sport: "softball",
    bannerType: "rectangle",
    url: `${ROOT}/softball-banners/hem-grommets-softball-banners`,
  },
];

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanText(value) {
  return compact(String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b0+([0-9])\b/g, "$1")
    .replace(/[^a-z0-9]+/g, " "));
}

function tokens(value) {
  return cleanText(value).split(" ").filter(Boolean)
    .filter((token) => !new Set(["baseball", "softball", "banner", "banners", "hem", "grommets", "team"]).has(token));
}

function tokenSet(value) {
  return new Set(tokens(value));
}

function titleNumber(value) {
  const numbers = cleanText(value).match(/\b[0-9]+\b/g) || [];
  return numbers.at(-1) || "";
}

function titleBase(value) {
  return cleanText(value)
    .replace(/\b(baseball|softball|banner|banners|hem|grommets|team)\b/g, " ")
    .replace(/\b[0-9]+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(product, source) {
  const productTokens = tokenSet(product);
  const sourceTokens = tokenSet(source);
  if (!productTokens.size || !sourceTokens.size) return 0;
  const intersection = [...productTokens].filter((token) => sourceTokens.has(token)).length;
  const union = new Set([...productTokens, ...sourceTokens]).size;
  let score = intersection / union;
  if (titleBase(product) && titleBase(product) === titleBase(source)) score += 0.25;
  const productNumber = titleNumber(product);
  const sourceNumber = titleNumber(source);
  if (productNumber && sourceNumber && productNumber === sourceNumber) score += 0.2;
  if (productNumber && sourceNumber && productNumber !== sourceNumber) score -= 0.25;
  if (cleanText(product) === cleanText(source)) score += 0.5;
  return Math.max(0, Math.min(1, score));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function writeCsv(file, headers, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(",")),
  ].join("\n") + "\n");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter((current) => current.length && current.some(Boolean))
    .map((current) => Object.fromEntries(headers.map((header, index) => [header, current[index] || ""])));
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${String(value || "").replace(/"/g, "\\\"")}"`);
  } catch {
    return String(value || "").replace(/\\"/g, "\"").replace(/\\\//g, "/");
  }
}

function extractField(text, field) {
  const match = String(text || "").match(new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
  return match ? decodeJsonString(match[1]) : "";
}

function extractAdminId(value) {
  const match = String(value || "").match(/admin-designs\/([0-9]{10,})\.(?:svg|png|jpe?g)/i);
  return match ? match[1] : "";
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "TeamBannerRectangleSourceAudit/1.0" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function pageUrl(base, page) {
  return page === 1 ? base : `${base}/${page}`;
}

function parseTotalPage(html) {
  const match = String(html || "").match(/"totalPage"\s*:\s*([0-9]+)/);
  return match ? Number(match[1]) : 1;
}

function parseCollectionDesigns(html, collection, url) {
  const designs = new Map();
  const detailPattern = /\{"id"\s*:\s*([0-9]+)[\s\S]{0,200}?"detail"\s*:\s*\{([\s\S]*?)\}\}/g;
  for (const match of String(html || "").matchAll(detailPattern)) {
    const detail = match[2];
    const svgUrl = extractField(detail, "svg_url");
    const imageUrl = extractField(detail, "img_url");
    const id = extractAdminId(svgUrl || imageUrl) || extractAdminId(match[0]);
    if (!id) continue;
    designs.set(id, {
      id,
      sport: collection.sport,
      bannerType: collection.bannerType,
      label: compact(extractField(detail, "label")),
      tags: compact(extractField(detail, "tags")),
      alt: compact(extractField(detail, "alt")),
      type: compact(extractField(detail, "type")),
      sourceSvgUrl: svgUrl || `${ADMIN_BASE}/${id}.svg`,
      sourceImageUrl: imageUrl || `${ADMIN_BASE}/${id}.png`,
      pageUrl: url,
    });
  }

  for (const match of String(html || "").matchAll(/admin-designs\/([0-9]{10,})\.(?:svg|png)/g)) {
    if (designs.has(match[1])) continue;
    designs.set(match[1], {
      id: match[1],
      sport: collection.sport,
      bannerType: collection.bannerType,
      label: "",
      tags: "",
      alt: "",
      type: "",
      sourceSvgUrl: `${ADMIN_BASE}/${match[1]}.svg`,
      sourceImageUrl: `${ADMIN_BASE}/${match[1]}.png`,
      pageUrl: url,
    });
  }
  return [...designs.values()];
}

async function scrapeCollections() {
  const pages = [];
  const designs = new Map();
  for (const collection of COLLECTIONS) {
    const firstUrl = pageUrl(collection.url, 1);
    const firstHtml = await fetchText(firstUrl);
    const totalPage = parseTotalPage(firstHtml);
    pages.push({
      sport: collection.sport,
      bannerType: collection.bannerType,
      page: 1,
      url: firstUrl,
      status: "ok",
      totalPage,
      sourceCount: parseCollectionDesigns(firstHtml, collection, firstUrl).length,
    });
    for (const design of parseCollectionDesigns(firstHtml, collection, firstUrl)) {
      designs.set(`${collection.sport}:${design.id}`, design);
    }

    for (let page = 2; page <= totalPage; page += 1) {
      const url = pageUrl(collection.url, page);
      const html = await fetchText(url);
      const pageDesigns = parseCollectionDesigns(html, collection, url);
      pages.push({
        sport: collection.sport,
        bannerType: collection.bannerType,
        page,
        url,
        status: "ok",
        totalPage,
        sourceCount: pageDesigns.length,
      });
      for (const design of pageDesigns) {
        designs.set(`${collection.sport}:${design.id}`, design);
      }
    }
  }
  return { pages, designs: [...designs.values()] };
}

function readSourceRows() {
  const sourceRows = fs.existsSync(SOURCE_SVGS_CSV) ? parseCsv(fs.readFileSync(SOURCE_SVGS_CSV, "utf8")) : [];
  const pageRows = fs.existsSync(SOURCE_PAGES_CSV) ? parseCsv(fs.readFileSync(SOURCE_PAGES_CSV, "utf8")) : [];
  const byId = new Map();
  for (const row of sourceRows) {
    byId.set(row.id, {
      id: row.id,
      sourceSvgUrl: row.sourceSvgUrl,
      localSvgPath: row.localSvgPath,
      sports: row.sports,
      bannerTypes: row.bannerTypes,
      titles: row.titles,
      sourcePages: pageRows
        .filter((page) => String(page.ids || "").split("|").includes(row.id))
        .map((page) => page.url),
    });
  }
  return byId;
}

function sourceMapByHandle() {
  const data = JSON.parse(fs.readFileSync(SOURCE_MAP_JSON, "utf8"));
  return new Map((data.maps || []).map((row) => [row.handle, row]));
}

function nearestFromReasons(reasons) {
  const text = Array.isArray(reasons) ? reasons.join("; ") : String(reasons || "");
  return {
    nearestSourceSvg: text.match(/nearest-source-svg:([^;]+)/)?.[1] || "",
    nearestRmse: text.match(/nearest-rmse:([^;]+)/)?.[1] || "",
  };
}

async function downloadMissingLocalSvgs(sources) {
  const downloads = [];
  fs.mkdirSync(SVG_DIR, { recursive: true });
  for (const source of sources) {
    const localPath = path.join(SVG_DIR, `${source.id}.svg`);
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
      downloads.push({ id: source.id, status: "exists", localPath, sourceSvgUrl: source.sourceSvgUrl });
      continue;
    }
    try {
      const text = await fetchText(source.sourceSvgUrl);
      if (!/<svg[\s>]/i.test(text)) throw new Error("not an SVG");
      fs.writeFileSync(localPath, text);
      downloads.push({ id: source.id, status: "downloaded", localPath, sourceSvgUrl: source.sourceSvgUrl });
    } catch (error) {
      downloads.push({ id: source.id, status: "error", error: error.message, localPath, sourceSvgUrl: source.sourceSvgUrl });
    }
  }
  return downloads;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const fallbackRows = parseCsv(fs.readFileSync(FALLBACKS_CSV, "utf8"))
    .filter((row) => row.Shape === "rectangle" && ["baseball", "softball"].includes(row.Sport));

  const { pages, designs } = await scrapeCollections();
  const scrapedBySport = new Map();
  for (const design of designs) {
    if (!scrapedBySport.has(design.sport)) scrapedBySport.set(design.sport, []);
    scrapedBySport.get(design.sport).push(design);
  }
  const sourceById = readSourceRows();
  const mapByHandle = sourceMapByHandle();
  const downloads = await downloadMissingLocalSvgs(designs);

  const candidateRows = [];
  const missingRows = fallbackRows.map((product) => {
    const map = mapByHandle.get(product.Handle) || {};
    const reasons = map.matchReasons || String(product["Source Reasons"] || "").split(";").map(compact).filter(Boolean);
    const nearest = nearestFromReasons(reasons);
    const pool = scrapedBySport.get(product.Sport) || [];
    const ranked = pool
      .map((source) => ({
        source,
        score: Math.max(
          scoreTitle(product.Title, source.label),
          scoreTitle(product.Title, source.alt),
          scoreTitle(product.Title, source.tags),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    for (const rankedSource of ranked) {
      const prior = sourceById.get(rankedSource.source.id);
      candidateRows.push({
        Handle: product.Handle,
        Title: product.Title,
        Sport: product.Sport,
        CandidateScore: rankedSource.score.toFixed(3),
        CandidateSvgId: rankedSource.source.id,
        CandidateLabel: rankedSource.source.label,
        CandidateAlt: rankedSource.source.alt,
        CandidateSvgUrl: rankedSource.source.sourceSvgUrl,
        CandidatePage: rankedSource.source.pageUrl,
        ExistingSourcePages: (prior?.sourcePages || []).join("|"),
        LocalSvgPath: path.join(SVG_DIR, `${rankedSource.source.id}.svg`),
      });
    }

    const best = ranked[0];
    const hasNativeSource = Boolean(map.sourceTemplateSvg && !String(map.templateSvg || "").includes("/generated-product-svgs/"));
    const exactMissing = !hasNativeSource;
    const priorNearest = sourceById.get(nearest.nearestSourceSvg);
    return {
      Handle: product.Handle,
      Title: product.Title,
      Sport: product.Sport,
      Shape: product.Shape,
      ProductImage: product["Product Image"],
      DesignUrl: product["Design URL"],
      CurrentTemplateSvg: product["Template SVG"],
      SourceStatus: exactMissing ? "MISSING_EXACT_NATIVE_SVG" : "HAS_NATIVE_SOURCE",
      CurrentEditableMode: product["Editable Mode"],
      CurrentSourceSvgEditable: product["Source SVG Editable"],
      NearestVisualSourceSvg: nearest.nearestSourceSvg,
      NearestVisualRmse: nearest.nearestRmse,
      NearestVisualSourceUrl: nearest.nearestSourceSvg ? `${ADMIN_BASE}/${nearest.nearestSourceSvg}.svg` : "",
      NearestVisualSourcePages: (priorNearest?.sourcePages || []).join("|"),
      BestLiveCandidateScore: best ? best.score.toFixed(3) : "",
      BestLiveCandidateSvgId: best?.source.id || "",
      BestLiveCandidateLabel: best?.source.label || "",
      BestLiveCandidateSvgUrl: best?.source.sourceSvgUrl || "",
      BestLiveCandidatePage: best?.source.pageUrl || "",
      Reason: exactMissing
        ? "Exact rendered source SVG was not found in the public TeamBannerSports rectangle source pool; product is currently backed by generated editable object fallback."
        : "Native source SVG already mapped.",
    };
  });

  const sourceCounts = COLLECTIONS.map((collection) => ({
    Sport: collection.sport,
    BannerType: collection.bannerType,
    PagesScraped: pages.filter((page) => page.sport === collection.sport).length,
    LiveSourcesScraped: designs.filter((design) => design.sport === collection.sport).length,
    MissingExactProducts: missingRows.filter((row) => row.Sport === collection.sport && row.SourceStatus === "MISSING_EXACT_NATIVE_SVG").length,
  }));

  writeCsv(path.join(OUTPUT_DIR, "scraped-live-rectangle-pages.csv"), [
    "sport", "bannerType", "page", "url", "status", "totalPage", "sourceCount",
  ], pages);
  writeCsv(path.join(OUTPUT_DIR, "scraped-live-rectangle-sources.csv"), [
    "id", "sport", "bannerType", "label", "tags", "alt", "type", "sourceSvgUrl", "sourceImageUrl", "pageUrl",
  ], designs);
  writeCsv(path.join(OUTPUT_DIR, "missing-rectangle-products.csv"), [
    "Handle", "Title", "Sport", "Shape", "ProductImage", "DesignUrl", "CurrentTemplateSvg", "SourceStatus", "CurrentEditableMode",
    "CurrentSourceSvgEditable", "NearestVisualSourceSvg", "NearestVisualRmse", "NearestVisualSourceUrl", "NearestVisualSourcePages",
    "BestLiveCandidateScore", "BestLiveCandidateSvgId", "BestLiveCandidateLabel", "BestLiveCandidateSvgUrl", "BestLiveCandidatePage", "Reason",
  ], missingRows);
  writeCsv(path.join(OUTPUT_DIR, "candidate-title-matches.csv"), [
    "Handle", "Title", "Sport", "CandidateScore", "CandidateSvgId", "CandidateLabel", "CandidateAlt", "CandidateSvgUrl", "CandidatePage",
    "ExistingSourcePages", "LocalSvgPath",
  ], candidateRows);
  writeCsv(path.join(OUTPUT_DIR, "source-download-check.csv"), [
    "id", "status", "localPath", "sourceSvgUrl", "error",
  ], downloads);
  writeCsv(path.join(OUTPUT_DIR, "summary.csv"), [
    "Sport", "BannerType", "PagesScraped", "LiveSourcesScraped", "MissingExactProducts",
  ], sourceCounts);

  const exactMissing = missingRows.filter((row) => row.SourceStatus === "MISSING_EXACT_NATIVE_SVG");
  const bySport = Object.fromEntries(sourceCounts.map((row) => [row.Sport, row]));
  const report = [
    "# Baseball + Softball Rectangle Missing SVG Audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Live collection pages scraped: ${pages.length}`,
    `- Live rectangle SVG sources scraped: ${designs.length}`,
    `- Current baseball/softball rectangle product-image fallback rows checked: ${fallbackRows.length}`,
    `- Exact native SVG still missing: ${exactMissing.length}`,
    `- Baseball missing exact native SVG: ${bySport.baseball?.MissingExactProducts || 0}`,
    `- Softball missing exact native SVG: ${bySport.softball?.MissingExactProducts || 0}`,
    `- Local SVG download check: ${downloads.filter((row) => row.status === "downloaded").length} downloaded, ${downloads.filter((row) => row.status === "exists").length} already existed, ${downloads.filter((row) => row.status === "error").length} errors`,
    "",
    "## Source Pages Scraped",
    "",
    ...COLLECTIONS.map((collection) => `- ${collection.sport}: ${collection.url}`),
    "",
    "## Output Files",
    "",
    "- `missing-rectangle-products.csv`",
    "- `candidate-title-matches.csv`",
    "- `scraped-live-rectangle-sources.csv`",
    "- `scraped-live-rectangle-pages.csv`",
    "- `source-download-check.csv`",
    "- `summary.csv`",
    "",
    "## Remaining Missing Exact SVGs",
    "",
    ...exactMissing.map((row) => `- ${row.Sport}: ${row.Handle} — ${row.Title} — nearest visual source ${row.NearestVisualSourceSvg || "none"} RMSE ${row.NearestVisualRmse || "n/a"}; best live title candidate ${row.BestLiveCandidateSvgId || "none"} (${row.BestLiveCandidateScore || "0"})`),
    "",
    "## Interpretation",
    "",
    "These rows are not missing a visible product render. They are missing the exact native source SVG required for true source-object editing. The design tool keeps an exact visual reference through generated editable object fallback, but these rows still need the original TeamBannerSports admin-design SVG to avoid crop/object fallback behavior.",
  ].join("\n");

  fs.writeFileSync(path.join(OUTPUT_DIR, "missing-source-svg-report.md"), report + "\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    collections: COLLECTIONS,
    pagesScraped: pages.length,
    liveSourcesScraped: designs.length,
    fallbackRowsChecked: fallbackRows.length,
    exactNativeSvgMissing: exactMissing.length,
    bySport: sourceCounts,
    files: {
      report: path.join(OUTPUT_DIR, "missing-source-svg-report.md"),
      missingProducts: path.join(OUTPUT_DIR, "missing-rectangle-products.csv"),
      candidates: path.join(OUTPUT_DIR, "candidate-title-matches.csv"),
      sources: path.join(OUTPUT_DIR, "scraped-live-rectangle-sources.csv"),
      pages: path.join(OUTPUT_DIR, "scraped-live-rectangle-pages.csv"),
      downloads: path.join(OUTPUT_DIR, "source-download-check.csv"),
    },
  }, null, 2) + "\n");

  console.log(JSON.stringify({
    outputDir: OUTPUT_DIR,
    pagesScraped: pages.length,
    liveSourcesScraped: designs.length,
    fallbackRowsChecked: fallbackRows.length,
    exactNativeSvgMissing: exactMissing.length,
    sourceCounts,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
