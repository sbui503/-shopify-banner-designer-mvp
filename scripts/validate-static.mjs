import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const required = [
  'CannabisPack Pro',
  'data-tab="templates"',
  'data-tab="backgrounds"',
  'data-tab="sizes"',
  'data-tab="assets"',
  'data-tab="ai"',
  'data-tab="brands"',
  'open3DPreview',
  'openAdminModal',
  'generateAIBackground',
  'QRCode',
  'THREE',
  'fabric',
  'Bui Banner',
  'createMagicLayers',
  'openMobilePanel',
  'assetCategoryGrid',
  'TEXT_PRESETS',
  'makeRoundText',
  'generateTemplateFromPrompt',
  'generatorLogoUpload'
];

const missing = required.filter(item => !html.includes(item));

if (missing.length) {
  console.error(`Missing required demo markers: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Static demo validation passed.');
