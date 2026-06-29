import { writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://zooniformprinting.com/content/Templates';
const OUTPUT_PATH = new URL('../data/zooniform-template-manifest.generated.json', import.meta.url);

const COLUMN_FORMATS = ['illustrator', 'photoshop', 'jpg', 'pdf'];

function decodeEntities(value = '') {
    return String(value)
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&middot;/g, '.')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function stripTags(value = '') {
    return decodeEntities(String(value).replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function slugify(value = '') {
    return stripTags(value)
        .toLowerCase()
        .replace(/["']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 96);
}

function getRows(html) {
    return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
}

function getCells(rowHtml) {
    return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
}

function getHeading(rowHtml) {
    const match = rowHtml.match(/<h2\b[^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<\/h2>/i);
    return match ? stripTags(match[1]) : '';
}

function parseHref(cellHtml) {
    const match = cellHtml.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
    return match ? decodeEntities(match[1]).trim() : '';
}

function hasVisibleTemplateIcon(cellHtml) {
    return /<img\b/i.test(cellHtml);
}

function inferFormat(cellHtml, fallbackFormat, href) {
    const normalized = `${cellHtml} ${href}`.toLowerCase();
    if (/illustrator|\bai\b/.test(normalized)) return 'illustrator';
    if (/photoshop|\bpsd\b/.test(normalized)) return 'photoshop';
    if (/indesign|indesing|\.indd|booklet/.test(normalized)) return 'indesign';
    if (/\bpdf\b|acrobat/.test(normalized)) return 'pdf';
    if (/\bjpg\b|jpeg/.test(normalized)) return 'jpg';
    return fallbackFormat;
}

function parseDimensions(...values) {
    for (const value of values) {
        const text = stripTags(value).replace(/[”″]/g, '"').replace(/[×]/g, 'x');
        const match = text.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/i);
        if (match) {
            const widthIn = Number.parseFloat(match[1]);
            const heightIn = Number.parseFloat(match[2]);
            if (Number.isFinite(widthIn) && Number.isFinite(heightIn)) {
                return {
                    widthIn,
                    heightIn,
                    label: `${widthIn}" x ${heightIn}"`
                };
            }
        }
    }
    return null;
}

function classifyGroup(group = '') {
    const text = group.toLowerCase();
    if (text.includes('brochure')) return 'brochure';
    if (text.includes('card') || text.includes('flyer')) return 'flat';
    if (text.includes('door')) return 'door-hanger';
    if (text.includes('greeting')) return 'greeting-card';
    if (text.includes('folder')) return 'folder';
    if (text.includes('booklet')) return 'booklet';
    if (text.includes('sell')) return 'sell-sheet';
    if (text.includes('letterhead')) return 'letterhead';
    if (text.includes('envelope')) return 'envelope';
    if (text.includes('poster')) return 'poster';
    if (text.includes('bookmark')) return 'bookmark';
    return 'print-template';
}

function buildTemplate(group, name, links) {
    const dims = parseDimensions(name, group) || { widthIn: 8.5, heightIn: 11, label: '8.5" x 11"' };
    const id = `zooniform-${slugify(`${group}-${name}`)}`;
    return {
        id,
        name: `${name} ${group}`.replace(/\s+/g, ' ').trim(),
        displayName: stripTags(name),
        group: stripTags(group),
        category: classifyGroup(group),
        dimensionLabel: dims.label,
        widthIn: dims.widthIn,
        heightIn: dims.heightIn,
        orientation: dims.widthIn >= dims.heightIn ? 'landscape' : 'portrait',
        sourceUrl: SOURCE_URL,
        links,
        formatCount: Object.keys(links).length
    };
}

async function main() {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`Zooniform template page HTTP ${response.status}`);
    const html = await response.text();

    let currentGroup = '';
    const templates = [];

    for (const row of getRows(html)) {
        const heading = getHeading(row);
        if (heading) {
            currentGroup = heading;
            continue;
        }

        const cells = getCells(row);
        if (cells.length < 5 || !currentGroup) continue;

        const name = stripTags(cells[0]).replace(/^x\s*/i, '').trim();
        if (!name) continue;

        const links = {};
        cells.slice(1, 5).forEach((cell, index) => {
            const href = parseHref(cell);
            const text = stripTags(cell).toLowerCase();
            if (!href || !hasVisibleTemplateIcon(cell) || text === 'x') return;
            const format = inferFormat(cell, COLUMN_FORMATS[index], href);
            links[format] = href;
        });

        if (!Object.keys(links).length) continue;
        templates.push(buildTemplate(currentGroup, name, links));
    }

    const manifest = {
        sourceUrl: SOURCE_URL,
        generatedAt: new Date().toISOString(),
        count: templates.length,
        groups: [...new Set(templates.map(template => template.group))].map(group => ({
            id: slugify(group),
            label: group,
            category: classifyGroup(group),
            count: templates.filter(template => template.group === group).length
        })),
        templates
    };

    await writeFile(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${templates.length} Zooniform templates to ${OUTPUT_PATH.pathname}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
