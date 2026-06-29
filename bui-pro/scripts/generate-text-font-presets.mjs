import { writeFile } from 'node:fs/promises';

const categories = [
  { id: 'strain-headline', label: 'Strain Headlines', nouns: ['Moon Zest', 'Velvet Gas', 'Citrus Halo', 'Frost Bloom', 'Neon Orchard'] },
  { id: 'premium-flower', label: 'Premium Flower', nouns: ['Top Shelf', 'Private Cut', 'Reserve Flower', 'Single Batch', 'Estate Grown'] },
  { id: 'rosin-concentrate', label: 'Rosin + Extracts', nouns: ['Cold Cure', 'Live Rosin', 'Fresh Press', 'Solventless', 'Hash Reserve'] },
  { id: 'vape-cart', label: 'Vape + Cart', nouns: ['Ceramic Cart', 'Live Resin', 'All-In-One', 'Diamond Vape', 'Full Spectrum'] },
  { id: 'edible-dose', label: 'Edible Dose', nouns: ['Fruit Chews', 'Night Gummies', 'Micro Dose', 'Fast Acting', 'Canna Bites'] },
  { id: 'medical-compliance', label: 'Medical + Compliance', nouns: ['Patient Label', 'Medical Use', 'Compliant Pack', 'Regulated Item', 'Universal Label'] },
  { id: 'potency-terpene', label: 'Potency + Terps', nouns: ['THC 28%', 'CBD 2:1', 'Terps 3.4%', 'Total Cannabinoids', 'Dominant Terpene'] },
  { id: 'batch-testing', label: 'Batch + Testing', nouns: ['Batch ID', 'Lab Tested', 'Harvest Date', 'COA Ready', 'Tested Clean'] },
  { id: 'warning-legal', label: 'Warning + Legal', nouns: ['Keep Away', 'Adults Only', 'Contains THC', 'Do Not Drive', 'State Warning'] },
  { id: 'brand-mark', label: 'Brand Marks', nouns: ['BUI Banner', 'Craft House', 'Bloom Works', 'Peak Garden', 'North Leaf'] },
  { id: 'sticker-callout', label: 'Sticker Callouts', nouns: ['Limited Drop', 'Fresh Batch', 'New Flavor', 'Staff Pick', 'Small Run'] },
  { id: 'dispensary-tag', label: 'Menu + Shelf Tags', nouns: ['Hybrid Pick', 'Indica Night', 'Sativa Day', 'Menu Special', 'Budtender Choice'] },
  { id: 'mylar-header', label: 'Mylar Headers', nouns: ['Premium Strain', 'Flower Pack', 'Sealed Fresh', 'Aroma Lock', 'Craft Cannabis'] },
  { id: 'jar-label', label: 'Jar Labels', nouns: ['3.5G Flower', '1G Rosin', 'Live Badder', 'Cured Resin', 'Fresh Jar'] },
  { id: 'preroll-tube', label: 'Pre-Roll Tubes', nouns: ['Infused Roll', 'Single Cone', 'Mini Pack', 'King Size', 'Five Pack'] },
  { id: 'limited-drop', label: 'Limited Drops', nouns: ['Drop 01', 'Rare Cut', 'Vault Release', 'Pheno Hunt', 'First Pull'] },
  { id: 'farm-natural', label: 'Farm + Natural', nouns: ['Sun Grown', 'Living Soil', 'Organic Style', 'Farm Cut', 'Clean Green'] },
  { id: 'luxury-foil', label: 'Luxury Foil', nouns: ['Gold Reserve', 'Black Label', 'Signature Cut', 'Elite Batch', 'Private Stock'] },
  { id: 'retro-psychedelic', label: 'Retro Psychedelic', nouns: ['Cosmic Zing', 'Rainbow Melt', 'Funk Garden', 'Dream Wave', 'Space Fruit'] },
  { id: 'street-bubble', label: 'Street + Bubble', nouns: ['Big Flavor', 'Loud Pack', 'Pop Drop', 'Candy Cloud', 'Gas Club'] }
];

const fonts = [
  'Inter',
  'Montserrat',
  'Bebas Neue',
  'Bangers',
  'Luckiest Guy',
  'Fredoka',
  'Archivo Black',
  'Rubik Mono One',
  'Permanent Marker',
  'Pacifico',
  'Playfair Display'
];

const palettes = [
  { fill: '#f8fafc', stroke: '#020617', shapeFill: '#111827', shapeStroke: '#22c55e' },
  { fill: '#111827', stroke: '#ffffff', shapeFill: '#f8fafc', shapeStroke: '#22c55e' },
  { fill: '#facc15', stroke: '#3f2a05', shapeFill: '#111827', shapeStroke: '#d4af37' },
  { fill: '#ff5ec4', stroke: '#111827', shapeFill: '#f0abfc', shapeStroke: '#38bdf8' },
  { fill: '#22c55e', stroke: '#052e16', shapeFill: '#ecfdf5', shapeStroke: '#16a34a' },
  { fill: '#67e8f9', stroke: '#0f172a', shapeFill: '#111827', shapeStroke: '#38bdf8' },
  { fill: '#fb7185', stroke: '#4c0519', shapeFill: '#fff1f2', shapeStroke: '#fb7185' },
  { fill: '#d8b4fe', stroke: '#2e1065', shapeFill: '#1e1b4b', shapeStroke: '#a855f7' },
  { fill: '#0f172a', stroke: '#f8fafc', shapeFill: '#e2e8f0', shapeStroke: '#334155' },
  { fill: '#f97316', stroke: '#431407', shapeFill: '#fff7ed', shapeStroke: '#fdba74' }
];

const shapes = ['none', 'capsule', 'badge', 'circle', 'ribbon', 'slab', 'underline', 'vertical', 'arc', 'compliance-tag'];
const styles = ['clean', 'bold', 'outlined', 'shadow', 'foil', 'bubble', 'clinical', 'retro', 'marker', 'minimal'];
const suffixes = ['LABEL', 'PACK', 'DROP', 'CUT', 'SERIES', 'RESERVE', 'BATCH', 'SELECT', 'NO.', 'LINE'];

function pick(list, index, salt = 0) {
  return list[(index + salt) % list.length];
}

function titleFor(category, index) {
  const noun = pick(category.nouns, index);
  const suffix = pick(suffixes, index, category.id.length);
  if (category.id === 'potency-terpene') return noun;
  if (category.id === 'warning-legal') return noun.toUpperCase();
  if (index % 5 === 0) return `${noun} ${String((index % 30) + 1).padStart(2, '0')}`;
  if (index % 4 === 0) return `${noun} ${suffix}`;
  return noun;
}

function textFor(category, title, index) {
  const lines = [
    title.toUpperCase(),
    `${pick(['HYBRID', 'INDICA', 'SATIVA', 'INFUSED', 'SOLVENTLESS'], index)} • ${pick(['24% THC', '3.2% TERPS', '100MG', '1G', '3.5G'], index, 2)}`,
    pick(['LAB TESTED', 'SMALL BATCH', 'FRESH SEALED', 'PREMIUM CANNABIS', 'KEEP OUT OF REACH'], index, 4)
  ];
  if (category.id.includes('warning') || category.id.includes('batch') || category.id.includes('medical')) return `${lines[0]}\n${lines[2]}`;
  if (category.id.includes('potency') || category.id.includes('edible')) return `${lines[0]}\n${lines[1]}`;
  return index % 3 === 0 ? `${lines[0]}\n${lines[1]}` : lines[0];
}

const presets = [];
for (const category of categories) {
  for (let i = 0; i < 50; i += 1) {
    const globalIndex = presets.length;
    const title = titleFor(category, i);
    const fontFamily = pick(fonts, globalIndex, category.id.length);
    const palette = pick(palettes, globalIndex, category.label.length);
    const shape = pick(shapes, globalIndex, i);
    const style = pick(styles, globalIndex, category.id.length + i);
    const weight = ['Bebas Neue', 'Bangers', 'Luckiest Guy', 'Archivo Black', 'Rubik Mono One'].includes(fontFamily) ? 'normal' : pick(['700', '800', '900'], i);
    const fontSize = pick([18, 20, 22, 24, 28, 32, 36, 42, 48, 56], globalIndex, i);
    presets.push({
      id: `${category.id}-${String(i + 1).padStart(3, '0')}`,
      category: category.id,
      categoryLabel: category.label,
      name: `${category.label} ${i + 1}`,
      sample: title,
      text: textFor(category, title, i),
      fontFamily,
      fontSize,
      fontWeight: weight,
      fill: palette.fill,
      stroke: style === 'minimal' || style === 'clinical' ? null : palette.stroke,
      strokeWidth: style === 'outlined' || style === 'bubble' ? 3 : style === 'foil' ? 1 : 0,
      shadow: style === 'shadow' || style === 'bubble' ? '0 3px 0 rgba(0,0,0,0.35)' : '',
      shape,
      shapeFill: palette.shapeFill,
      shapeStroke: palette.shapeStroke,
      shapeStrokeWidth: shape === 'none' ? 0 : 2,
      layout: shape === 'arc' ? 'arc' : shape === 'vertical' ? 'vertical' : i % 6 === 0 ? 'stacked' : 'centered',
      tags: [category.id, style, shape, fontFamily.toLowerCase().replace(/\s+/g, '-')],
      researchBasis: 'Original generic preset inspired by cannabis packaging typography categories; no brand logos or trademarks copied.'
    });
  }
}

const manifest = {
  version: 1,
  generatedAt: '2026-05-29',
  source: 'BUI Banner Pro generated original editable text/font preset library',
  total: presets.length,
  categories,
  fonts,
  shapes,
  presets
};

await writeFile(new URL('../data/text-font-presets.generated.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${presets.length} text/font presets`);
