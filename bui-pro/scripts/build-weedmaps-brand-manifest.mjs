import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath = 'weedmaps-brands-export.json', outputPath = 'data/brand-assets.generated.json'] = process.argv;

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const rows = Array.isArray(input) ? input : input.brands || input.items || input.data || input.results || [];

function slugify(value) {
  return String(value || 'brand')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getImage(row) {
  return row.logo || row.image || row.brandLogo || row.assets?.logo || row.assets?.primary || {};
}

function inferFormat(url, image) {
  if (image.format) return String(image.format).toLowerCase();
  const match = String(url || '').split('?')[0].match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

const brands = rows
  .map((row, index) => {
    const image = getImage(row);
    const url = image.url || image.src || row.logoUrl || row.logo_url || row.imageUrl || row.image_url;
    if (!url) return null;
    const name = row.name || row.title || row.slug || `Brand ${index + 1}`;
    const licenseStatus = row.licenseStatus || image.licenseStatus || 'unknown';
    return {
      slug: slugify(row.slug || name),
      name,
      sourceUrl: row.sourceUrl || row.url || '',
      licenseStatus,
      colors: row.colors || row.brandColors || [],
      categories: row.categories || row.tags || [],
      logo: {
        url,
        format: inferFormat(url, image),
        transparent: Boolean(image.transparent || row.transparentLogo),
        width: Number(image.width || row.logoWidth || 0) || undefined,
        height: Number(image.height || row.logoHeight || 0) || undefined,
        alt: image.alt || `${name} logo`,
        licenseStatus
      }
    };
  })
  .filter(Boolean);

const manifest = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  source: input.source || 'Authorized Weedmaps API/export or partner brand kit',
  licensePolicy: 'Only import logos that are owned, licensed, partner-provided, or explicitly approved for BUI Pro.',
  brands
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${brands.length} brand assets to ${outputPath}`);
