import { readFile, writeFile } from 'node:fs/promises';

const [, , inputPath = 'weedmaps-strains-export.json', outputPath = 'data/strain-hero-manifest.generated.json'] = process.argv;

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const rows = Array.isArray(input) ? input : input.strainHeroImages || input.strains || input.items || input.data || input.results || [];

const strainHeroImages = rows
  .map((row, index) => {
    const image = row.heroImage || row.image || row.hero_image || row.assets?.hero || {};
    const url = image.url || image.src || row.imageUrl || row.heroImageUrl;
    if (!url) return null;
    const name = row.name || row.title || row.slug || `strain-${index + 1}`;
    const slug = (row.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return {
      slug,
      name,
      type: row.type || row.category || row.strainType || 'unknown',
      sourceUrl: row.sourceUrl || row.url || '',
      page: Number(row.page || Math.floor(index / 20) + 1),
      licenseStatus: row.licenseStatus || image.licenseStatus || 'unknown',
      heroImage: {
        url,
        width: Number(image.width || row.imageWidth || 0) || undefined,
        height: Number(image.height || row.imageHeight || 0) || undefined,
        alt: image.alt || `${name} strain hero image`,
        dominantColors: image.dominantColors || row.dominantColors || [],
        licenseStatus: image.licenseStatus || row.licenseStatus || 'unknown'
      }
    };
  })
  .filter(Boolean);

const manifest = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  source: input.source || 'Authorized Weedmaps API/export',
  sourceRange: input.sourceRange || { pageStart: 1, pageEnd: 588, pageSize: 20 },
  licensePolicy: 'Only use image URLs that are owned, licensed, partner-provided, or explicitly approved for BUI Pro.',
  strainHeroImages
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${strainHeroImages.length} strain hero assets to ${outputPath}`);
