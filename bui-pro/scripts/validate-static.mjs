import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const tailwindCss = await readFile(new URL('../assets/tailwind.css', import.meta.url), 'utf8');
const brandSchema = await readFile(new URL('../data/brand-assets.schema.json', import.meta.url), 'utf8');
const strainSchema = await readFile(new URL('../data/strain-hero-manifest.schema.json', import.meta.url), 'utf8');
const textFontManifest = await readFile(new URL('../data/text-font-presets.generated.json', import.meta.url), 'utf8');
const brandLogoManifest = await readFile(new URL('../data/brand-logo-manifest.generated.json', import.meta.url), 'utf8');
const zooniformTemplateManifest = await readFile(new URL('../data/zooniform-template-manifest.generated.json', import.meta.url), 'utf8');
const shopifySection = await readFile(new URL('../shopify/sections/bui-banner-pro-sticker-designer.liquid', import.meta.url), 'utf8');
const shopifySnippet = await readFile(new URL('../shopify/snippets/bui-banner-pro-custom-liquid.html', import.meta.url), 'utf8');

const required = [
  'Bui Banner',
  'BUI Banner Pro - Label Design Tool',
  'BUI <span class="text-green-500">Pro</span>',
  'assets/tailwind.css',
  '--client-primary',
  '#2563eb',
  'toolbar-strip',
  'toolbar-actions',
  'zoom-control',
  'applyThemeColor',
  'createMagicLayers',
  'generateTemplateFromPrompt',
  'assetManifestUpload',
  'importAssetManifest',
  'brand-short',
  'applyResponsiveCanvasZoom',
  'setPixelRatio',
  'textureMultiplier',
  'Import Brand / Strain JSON',
  'STRAIN_BACKGROUND_MANIFEST_URL',
  'strainBackgroundGrid',
  'loadStrainBackgroundManifest',
  'applyRemoteBackground',
  'removeCanvasBackgrounds',
  'TEXT_FONT_LIBRARY_URL',
  'textFontGrid',
  'loadTextFontLibrary',
  'setTextFontCategory',
  'setTextFontFamily',
  'Text/Fonts',
  'BRAND_LOGO_MANIFEST_URL',
  'ZOONIFORM_TEMPLATE_MANIFEST_URL',
  'loadZooniformTemplates',
  'openZooniformTemplateLink',
  'brandLogoGrid',
  'loadBrandLogoManifest',
  'addBrandLogoImage',
  'addBrandLogoText',
  'applyImageFilter',
  'mobileQuickActions',
  'updateMobileQuickActions',
  'toggleSelectedLock',
  'editSelectionFromMobile',
  'setCanvasTransparent',
  'createSeparatedArtworkLayers',
  'Separated Editable Brand Text',
  'shapePresetGrid',
  'customShapeUpload',
  'applyCustomCanvasSize',
  'data-mobile-panel="sizes"',
  'Size/Quote',
  'resetBlankCanvas',
  'applyDesignShapeGuide',
  'designStage',
  'rulerTop',
  'rulerLeft',
  'updateCanvasRulers',
  'refitCanvasAfterSizeChange',
  'getDefaultZoomForViewport',
  'adminQuoteMargin',
  'adminDefaultQuantity',
  'BUIBannerPro',
  'textureSize',
  'patchCanvasTextBaselineCompatibility',
  '__buiBaselinePatched',
  'ZOONIFORM_QUOTE_PRODUCTS',
  'zooniform-job-card',
  'Zooniform Product Types',
  'setZooniformCatalogGroup',
  'renderZooniformSizeCatalog',
  'loadZooniformTemplateFromCatalog',
  'Print Details',
  'Sample label',
  'This realtime quote does not include tax or shipping.',
  'applyMaterialPreview',
  'STICKER_MATERIALS',
  'calculateStickerQuote',
  'threePreview',
  'THREE',
  'CanvasTexture',
  'targetTextureSide',
  'fabric'
];

const missing = required.filter(item => !html.includes(item));

const tailwindRequired = [
  '.text-green-500',
  '.grid',
  '.hidden',
  '.flex',
  '.rounded'
];

const tailwindMissing = tailwindRequired.filter(item => !tailwindCss.includes(item));

const schemaRequired = [
  'brands',
  'strainHeroImages',
  'licenseStatus',
  'sourceRange'
];

const schemaMissing = schemaRequired.filter(item => !brandSchema.includes(item) && !strainSchema.includes(item));

const manifestScripts = [
  '../scripts/build-weedmaps-strain-manifest.mjs',
  '../scripts/build-weedmaps-brand-manifest.mjs',
  '../scripts/fetch-weedmaps-catalog-export.mjs',
  '../scripts/scrape_weedmaps_strain_image_urls.py',
  '../scripts/scrape_weedmaps_brand_logo_urls.py'
];

const scriptContents = await Promise.all(
  manifestScripts.map(file => readFile(new URL(file, import.meta.url), 'utf8'))
);

const scriptRequired = [
  'WEEDMAPS_ACCESS_TOKEN',
  'brands',
  'strains',
  'licenseStatus',
  'sourceRange',
  'verbal_approval_pending_written',
  'normalizedImageUrl'
];

const scriptMissing = scriptRequired.filter(item => !scriptContents.some(content => content.includes(item)));

const textFontRequired = [
  '"total": 1000',
  'strain-headline',
  'medical-compliance',
  'street-bubble',
  'researchBasis'
];

const textFontMissing = textFontRequired.filter(item => !textFontManifest.includes(item));

const brandLogoRequired = [
  '"brands"',
  '"editableText"',
  '"transparent"',
  '"licenseStatus"',
  'verbal_approval_pending_written'
];

const brandLogoMissing = brandLogoRequired.filter(item => !brandLogoManifest.includes(item));

const zooniformTemplateRequired = [
  '"count": 71',
  'BOOKMARKS',
  'BROCHURES 8.5',
  'CARDS and FLYERS (Flat)',
  'https://zooniformprinting.com/content/Templates'
];

const zooniformTemplateMissing = zooniformTemplateRequired.filter(item => !zooniformTemplateManifest.includes(item));

const shopifySectionRequired = [
  'BUI Sticker Designer',
  'data-bui-sticker-section',
  'Custom Shape / Artwork',
  'properties[BUI Quote]',
  'properties[Reference Estimate]',
  'holographic-rainbow-bopp',
  'margin_percent',
  "document.getElementById('bui-sticker-{{ section.id }}')",
  'BUI designer URL'
];

const shopifySectionMissing = shopifySectionRequired.filter(item => !shopifySection.includes(item));

const shopifySnippetRequired = [
  'BUI Banner Pro',
  'BUI Banner Pro Designer',
  'Use the full section file'
];

const shopifySnippetMissing = shopifySnippetRequired.filter(item => !shopifySnippet.includes(item));

if (missing.length) {
  console.error(`Missing BUI Pro markers: ${missing.join(', ')}`);
  process.exit(1);
}

if (html.includes('cdn.tailwindcss.com')) {
  console.error('Production build must use local Tailwind CSS, not the Tailwind CDN runtime.');
  process.exit(1);
}

if (tailwindMissing.length) {
  console.error(`Missing local Tailwind CSS markers: ${tailwindMissing.join(', ')}`);
  process.exit(1);
}

if (html.includes('loadTemplate(TEMPLATES[0]);')) {
  console.error('Startup must stay on a white blank canvas, not auto-load the first template.');
  process.exit(1);
}

if (schemaMissing.length) {
  console.error(`Missing manifest schema markers: ${schemaMissing.join(', ')}`);
  process.exit(1);
}

if (scriptMissing.length) {
  console.error(`Missing manifest script markers: ${scriptMissing.join(', ')}`);
  process.exit(1);
}

if (textFontMissing.length) {
  console.error(`Missing text/font manifest markers: ${textFontMissing.join(', ')}`);
  process.exit(1);
}

if (brandLogoMissing.length) {
  console.error(`Missing brand logo manifest markers: ${brandLogoMissing.join(', ')}`);
  process.exit(1);
}

if (zooniformTemplateMissing.length) {
  console.error(`Missing Zooniform template manifest markers: ${zooniformTemplateMissing.join(', ')}`);
  process.exit(1);
}

if (shopifySectionMissing.length) {
  console.error(`Missing Shopify section markers: ${shopifySectionMissing.join(', ')}`);
  process.exit(1);
}

if (shopifySnippetMissing.length) {
  console.error(`Missing Shopify snippet markers: ${shopifySnippetMissing.join(', ')}`);
  process.exit(1);
}

console.log('BUI Pro validation passed.');
