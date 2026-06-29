import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const [
  ,
  ,
  resource = 'strains',
  outputPath = `data/weedmaps-${resource}-export.json`,
  startPageArg = '1',
  endPageArg = resource === 'strains' ? '588' : '40',
  pageSizeArg = '20'
] = process.argv;

const accessToken = process.env.WEEDMAPS_ACCESS_TOKEN;
const baseUrl = process.env.WEEDMAPS_API_BASE || 'https://api-g.weedmaps.com/wm/2025-07/partners';
const delayMs = Number(process.env.WEEDMAPS_FETCH_DELAY_MS || 300);
const startPage = Number(startPageArg);
const endPage = Number(endPageArg);
const pageSize = Number(pageSizeArg);

if (!accessToken) {
  console.error('Missing WEEDMAPS_ACCESS_TOKEN. Use an authorized token from Weedmaps; do not commit it.');
  process.exit(1);
}

if (!['brands', 'strains'].includes(resource)) {
  console.error('Resource must be "brands" or "strains".');
  process.exit(1);
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  return payload.items || payload.data || payload.results || payload[resource] || [];
}

async function fetchPage(page) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/${resource}`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(pageSize));
  url.searchParams.set('filters[published]', 'true');

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Weedmaps ${resource} page ${page} failed with ${response.status}`);
  }

  return response.json();
}

const items = [];
for (let page = startPage; page <= endPage; page += 1) {
  const payload = await fetchPage(page);
  const rows = extractRows(payload).map(row => ({ ...row, page }));
  console.log(`Fetched ${resource} page ${page}: ${rows.length} rows`);
  if (!rows.length) break;
  items.push(...rows);
  if (page < endPage && delayMs > 0) await wait(delayMs);
}

const exportPayload = {
  source: 'Authorized Weedmaps API export',
  resource,
  sourceRange: { pageStart: startPage, pageEnd: endPage, pageSize },
  generatedAt: new Date().toISOString(),
  items
};

await writeFile(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`);
console.log(`Wrote ${items.length} ${resource} rows to ${outputPath}`);
