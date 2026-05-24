import fs from "node:fs";
import path from "node:path";

const SOURCE_ORIGIN = "https://teambannersports.com";
const SITEMAP_URL = `${SOURCE_ORIGIN}/sitemap.xml`;
const ADMIN_DESIGN_BASE = "https://lct-designs.s3.us-west-1.amazonaws.com/admin-designs";
const SVG_DIR = "public/svg-layer-templates";
const INDEX_PATH = "public/teambannersports-source-svg-index.json";
const OUTPUT_DIR = `outputs/teambannersports-collection-scrape-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.split("=");
  return [key, value];
}));

const shouldDownload = args.has("--download") || args.has("--apply");
const shouldApply = args.has("--apply");
const concurrency = Math.max(1, Number(args.get("--concurrency") || 8));
const maxTeamPages = Number(args.get("--max-team-pages") || Infinity);

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

function inferBannerType(value) {
  const text = cleanText(value);
  if (/\bpole\b|\bpocket\b/.test(text)) return "polepocket";
  if (/\btriangle\b|\bpennant\b/.test(text) && !/\bhome\b/.test(text)) return "triangle";
  if (/\bhomeplate\b|\bhome plate\b/.test(text) || (/\bhome\b/.test(text) && /\bplate\b/.test(text))) return "homeplatepennant";
  if (/\bhem\b|\bgrommet\b|\bbanner\b/.test(text)) return "rectangle";
  return "";
}

function normalizeUrl(url) {
  try {
    const next = new URL(decodeHtml(url), SOURCE_ORIGIN);
    next.hash = "";
    next.search = "";
    return next.href.replace(/\/$/, "");
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

async function fetchText(url, { retries = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": "TeamBannerDesignerCollectionScraper/1.0" }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError || new Error(`Fetch failed: ${url}`);
}

function extractSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => normalizeUrl(match[1]))
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

function extractLinks(text, baseUrl, predicate) {
  const links = new Set();
  for (const match of String(text || "").matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const href = normalizeUrl(new URL(decodeHtml(match[1]), baseUrl).href);
    if (href && predicate(href)) links.add(href);
  }
  return [...links];
}

function extractTitle(text) {
  const title = String(text || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return compact(decodeHtml(title).replace(/\s*\|\s*Team Banner Sports\s*$/i, ""));
}

async function mapLimit(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let index = 0;
  let done = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = await worker(items[current], current);
      } catch (error) {
        results[current] = { status: "error", error: error.message, input: items[current] };
      } finally {
        done += 1;
        if (onProgress && (done % 250 === 0 || done === items.length)) onProgress(done, items.length);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function sourceSvgUrl(id) {
  return `${ADMIN_DESIGN_BASE}/${id}.svg`;
}

function localSvgPath(id) {
  return path.join(SVG_DIR, `${id}.svg`);
}

async function downloadSvg(id) {
  const file = localSvgPath(id);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return { id, status: "exists", file };
  const svg = await fetchText(sourceSvgUrl(id));
  if (!/<svg[\s>]/i.test(svg)) throw new Error("downloaded file is not SVG");
  fs.mkdirSync(SVG_DIR, { recursive: true });
  fs.writeFileSync(file, svg);
  return { id, status: "downloaded", file };
}

function addSource(sourceMap, id, partial) {
  if (!id) return;
  if (!sourceMap.has(id)) {
    sourceMap.set(id, {
      id,
      sourceSvgUrl: sourceSvgUrl(id),
      localSvgPath: localSvgPath(id),
      categoryPages: new Set(),
      sourcePages: new Set(),
      sports: new Set(),
      bannerTypes: new Set(),
      titles: new Set()
    });
  }
  const source = sourceMap.get(id);
  if (partial.categoryPage) source.categoryPages.add(partial.categoryPage);
  if (partial.sourcePage) source.sourcePages.add(partial.sourcePage);
  if (partial.sport) source.sports.add(partial.sport);
  if (partial.bannerType) source.bannerTypes.add(partial.bannerType);
  if (partial.title) source.titles.add(partial.title);
}

function serializeSource(source) {
  return {
    id: source.id,
    sourceSvgUrl: source.sourceSvgUrl,
    localSvgPath: source.localSvgPath,
    categoryPages: [...source.categoryPages].sort(),
    sourcePages: [...source.sourcePages].sort(),
    sports: [...source.sports].sort(),
    bannerTypes: [...source.bannerTypes].sort(),
    titles: [...source.titles].sort()
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(SVG_DIR, { recursive: true });

  const sitemap = await fetchText(SITEMAP_URL);
  const locs = extractSitemapLocs(sitemap);
  const categoryUrls = [...new Set(locs.filter((url) => (
    /(baseball-banners|softball-banners|soccer-banners)/.test(url)
    && !/\/team-banner\//.test(url)
  )))].sort();
  const sitemapTeamUrls = new Set(locs.filter((url) => /\/team-banner\//.test(url)));
  const sourceMap = new Map();

  const categoryRows = await mapLimit(categoryUrls, concurrency, async (url) => {
    const html = await fetchText(url);
    const ids = extractAdminDesignIds(html);
    const teamLinks = extractLinks(html, url, (href) => /\/team-banner\//.test(href));
    const paginationLinks = extractLinks(html, url, (href) => (
      /(baseball-banners|softball-banners|soccer-banners)/.test(href)
      && !/\/team-banner\//.test(href)
    ));
    const sport = inferSport(url);
    const bannerType = inferBannerType(url);
    for (const id of ids) addSource(sourceMap, id, { categoryPage: url, sport, bannerType });
    for (const link of teamLinks) sitemapTeamUrls.add(link);
    return {
      url,
      status: "ok",
      sport,
      bannerType,
      adminDesignIds: ids.length,
      teamLinks: teamLinks.length,
      paginationLinks: paginationLinks.length
    };
  }, (done, total) => console.error(`category pages ${done}/${total}`));

  const teamUrls = [...sitemapTeamUrls].sort().slice(0, maxTeamPages);
  const teamRows = await mapLimit(teamUrls, concurrency, async (url) => {
    const html = await fetchText(url);
    const ids = extractAdminDesignIds(html);
    const title = extractTitle(html);
    const sport = inferSport(`${url} ${title}`);
    const bannerType = inferBannerType(`${url} ${title}`);
    for (const id of ids) addSource(sourceMap, id, { sourcePage: url, sport, bannerType, title });
    return {
      url,
      status: "ok",
      title,
      sport,
      bannerType,
      adminDesignIds: ids.length,
      ids: ids.join("|")
    };
  }, (done, total) => console.error(`team pages ${done}/${total}`));

  const sourceRows = [...sourceMap.values()].map(serializeSource).sort((a, b) => a.id.localeCompare(b.id));
  const downloadRows = [];
  if (shouldDownload) {
    const downloaded = await mapLimit(sourceRows.map((row) => row.id), concurrency, async (id) => {
      try {
        return await downloadSvg(id);
      } catch (error) {
        return { id, status: "download-error", file: localSvgPath(id), error: error.message };
      }
    }, (done, total) => console.error(`svg downloads ${done}/${total}`));
    downloadRows.push(...downloaded);
  }

  writeCsv(path.join(OUTPUT_DIR, "collection-pages.csv"), [
    "url", "status", "sport", "bannerType", "adminDesignIds", "teamLinks", "paginationLinks", "error"
  ], categoryRows);
  writeCsv(path.join(OUTPUT_DIR, "team-banner-pages.csv"), [
    "url", "status", "title", "sport", "bannerType", "adminDesignIds", "ids", "error"
  ], teamRows);
  writeCsv(path.join(OUTPUT_DIR, "source-svgs.csv"), [
    "id", "sourceSvgUrl", "localSvgPath", "sports", "bannerTypes", "sourcePageCount", "categoryPageCount", "titles"
  ], sourceRows.map((row) => ({
    ...row,
    sports: row.sports.join("|"),
    bannerTypes: row.bannerTypes.join("|"),
    sourcePageCount: row.sourcePages.length,
    categoryPageCount: row.categoryPages.length,
    titles: row.titles.slice(0, 6).join("|")
  })));
  if (downloadRows.length) {
    writeCsv(path.join(OUTPUT_DIR, "downloads.csv"), ["id", "status", "file", "error"], downloadRows);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sitemapUrls: locs.length,
    collectionPages: categoryUrls.length,
    teamBannerPages: teamUrls.length,
    sourceSvgIds: sourceRows.length,
    downloaded: downloadRows.filter((row) => row.status === "downloaded").length,
    existing: downloadRows.filter((row) => row.status === "exists").length,
    downloadErrors: downloadRows.filter((row) => row.status === "download-error").length,
    outputDir: OUTPUT_DIR
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  if (shouldApply) {
    fs.writeFileSync(INDEX_PATH, JSON.stringify({
      generatedAt: summary.generatedAt,
      source: SOURCE_ORIGIN,
      sources: sourceRows
    }, null, 2) + "\n");
  }
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
