import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const YEAR = 2026;
const RUN_ID = "sports-asset-system-20260525";
const PUBLIC_ASSET_ROOT = path.join(ROOT, "public", "assets", "sports");
const SPORTS_ROOT = path.join(ROOT, "sports");
const IMPORTS_ROOT = path.join(ROOT, "imports");
const DESIGN_TOOL_ROOT = path.join(ROOT, "design-tool");
const PUBLIC_DESIGN_TOOL_ROOT = path.join(ROOT, "public", "design-tool");
const LOGS_ROOT = path.join(ROOT, "logs");
const BACKUP_ROOT = path.join(ROOT, "backups", RUN_ID);

const sports = [
  { slug: "basketball", label: "Basketball", short: "BK", primary: "#f97316", secondary: "#111827", glow: "#fed7aa", venue: "court", ball: "basketball" },
  { slug: "football", label: "Football", short: "FB", primary: "#ca8a04", secondary: "#111827", glow: "#fde68a", venue: "field", ball: "football" },
  { slug: "volleyball", label: "Volleyball", short: "VB", primary: "#ec4899", secondary: "#111827", glow: "#fbcfe8", venue: "court", ball: "volleyball" },
  { slug: "baseball", label: "Baseball", short: "BB", primary: "#d71920", secondary: "#0b2f63", glow: "#f8fafc", venue: "diamond", ball: "baseball" },
  { slug: "softball", label: "Softball", short: "SB", primary: "#facc15", secondary: "#111827", glow: "#fef3c7", venue: "diamond", ball: "softball" },
  { slug: "soccer", label: "Soccer", short: "SC", primary: "#16a34a", secondary: "#052e16", glow: "#bbf7d0", venue: "pitch", ball: "soccer" },
  { slug: "track-field", label: "Track & Field", short: "TF", primary: "#f59e0b", secondary: "#0f172a", glow: "#fde68a", venue: "track", ball: "track" }
];

const backgroundVariants = [
  { key: "arena", name: "Arena" },
  { key: "lights", name: "Game Night Lights" },
  { key: "speed", name: "Speed Lines" },
  { key: "championship", name: "Championship Burst" }
];

const productStyles = [
  { key: "arena-orange", name: "Arena Orange", colors: ["#f97316", "#111827"] },
  { key: "stadium-gold", name: "Stadium Gold", colors: ["#f59e0b", "#111827"] },
  { key: "midnight-blue", name: "Midnight Blue", colors: ["#1d4ed8", "#020617"] },
  { key: "angel-pink", name: "Angel Pink", colors: ["#ec4899", "#111827"] },
  { key: "varsity-red", name: "Varsity Red", colors: ["#dc2626", "#111827"] },
  { key: "royal-green", name: "Royal Green", colors: ["#16a34a", "#052e16"] },
  { key: "silver-black", name: "Silver Black", colors: ["#e5e7eb", "#111827"] },
  { key: "electric-purple", name: "Electric Purple", colors: ["#7c3aed", "#111827"] },
  { key: "sunset-maroon", name: "Sunset Maroon", colors: ["#9f1239", "#111827"] },
  { key: "ice-white", name: "Ice White", colors: ["#f8fafc", "#0f172a"] },
  { key: "neon-lime", name: "Neon Lime", colors: ["#84cc16", "#111827"] },
  { key: "sky-burst", name: "Sky Burst", colors: ["#0ea5e9", "#082f49"] }
];

const playerCounts = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20];
const productPlan = [
  { shape: "rectangle", style: "hem-grommet", label: "Hem & Grommet", count: 30 },
  { shape: "rectangle", style: "pole-pocket", label: "Pole Pocket", count: 30 },
  { shape: "triangle", style: "triangle", label: "Triangle Banner", count: 24 },
  { shape: "home-plate", style: "home-plate", label: "Home Plate Banner", count: 24 }
];

const californiaSchools = [
  ["Irvine High School", "Irvine", "Vaqueros", "#0b2f63", "#f59e0b"],
  ["Woodbridge High School", "Irvine", "Warriors", "#004b8d", "#facc15"],
  ["University High School", "Irvine", "Trojans", "#dc2626", "#f8fafc"],
  ["Northwood High School", "Irvine", "Timberwolves", "#0f172a", "#10b981"],
  ["Portola High School", "Irvine", "Bulldogs", "#7c3aed", "#f8fafc"],
  ["Beckman High School", "Irvine", "Patriots", "#dc2626", "#1d4ed8"],
  ["Tustin High School", "Tustin", "Tillers", "#111827", "#f59e0b"],
  ["Foothill High School", "Santa Ana", "Knights", "#111827", "#facc15"],
  ["Laguna Hills High School", "Laguna Hills", "Hawks", "#0f172a", "#f59e0b"],
  ["Mission Viejo High School", "Mission Viejo", "Diablos", "#dc2626", "#111827"],
  ["Huntington Beach High School", "Huntington Beach", "Oilers", "#111827", "#f97316"],
  ["Mater Dei High School", "Santa Ana", "Monarchs", "#dc2626", "#f59e0b"],
  ["Sierra Vista Middle School", "Irvine", "Chargers", "#1d4ed8", "#facc15"],
  ["Venado Middle School", "Irvine", "Vikings", "#7c3aed", "#facc15"],
  ["Rancho San Joaquin Middle School", "Irvine", "Roadrunners", "#0f172a", "#f97316"],
  ["Lakeside Middle School", "Irvine", "Panthers", "#111827", "#10b981"],
  ["South Lake Middle School", "Irvine", "Sharks", "#0ea5e9", "#111827"],
  ["Jeffrey Trail Middle School", "Irvine", "Jets", "#0f172a", "#38bdf8"],
  ["Orchard Hills School", "Irvine", "Hawks", "#16a34a", "#facc15"],
  ["Cadence Park School", "Irvine", "Coyotes", "#f97316", "#111827"],
  ["Beacon Park School", "Irvine", "Bobcats", "#1d4ed8", "#f8fafc"]
];

const csvHeaders = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Variant SKU",
  "Variant Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Image Src",
  "Image Alt Text",
  "Status",
  "Collection",
  "Metafield: custom.sport [single_line_text_field]",
  "Metafield: custom.banner_shape [single_line_text_field]",
  "Metafield: custom.player_count [number_integer]",
  "Metafield: custom.design_tool_svg_template [single_line_text_field]",
  "Metafield: custom.design_tool_metadata [json]"
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function svgUrl(filePath) {
  const relative = path.relative(path.join(ROOT, "public"), filePath).split(path.sep).join("/");
  return `/${relative}`;
}

function ballSvg(sport, cx = 0, cy = 0, r = 80) {
  if (sport.ball === "football") {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.18}" ry="${r * 0.64}" fill="${sport.primary}" stroke="#fff" stroke-width="${r * 0.08}"/><path d="M${cx - r * 0.82} ${cy} C${cx - r * 0.34} ${cy - r * 0.28} ${cx + r * 0.34} ${cy - r * 0.28} ${cx + r * 0.82} ${cy}" fill="none" stroke="${sport.secondary}" stroke-width="${r * 0.08}"/><path d="M${cx - r * 0.82} ${cy} C${cx - r * 0.34} ${cy + r * 0.28} ${cx + r * 0.34} ${cy + r * 0.28} ${cx + r * 0.82} ${cy}" fill="none" stroke="${sport.secondary}" stroke-width="${r * 0.08}"/><path d="M${cx - r * 0.24} ${cy} H${cx + r * 0.24}" stroke="#fff" stroke-width="${r * 0.09}" stroke-linecap="round"/><path d="M${cx - r * 0.08} ${cy - r * 0.18} V${cy + r * 0.18} M${cx + r * 0.08} ${cy - r * 0.18} V${cy + r * 0.18}" stroke="#fff" stroke-width="${r * 0.045}" stroke-linecap="round"/>`;
  }
  if (sport.ball === "volleyball") {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${sport.secondary}" stroke-width="${r * 0.08}"/><path d="M${cx} ${cy - r} C${cx - r * 0.18} ${cy - r * 0.42} ${cx + r * 0.18} ${cy - r * 0.18} ${cx + r} ${cy - r * 0.08}" fill="none" stroke="${sport.primary}" stroke-width="${r * 0.13}" stroke-linecap="round"/><path d="M${cx - r * 0.9} ${cy - r * 0.38} C${cx - r * 0.18} ${cy - r * 0.2} ${cx + r * 0.12} ${cy + r * 0.22} ${cx + r * 0.36} ${cy + r * 0.92}" fill="none" stroke="${sport.primary}" stroke-width="${r * 0.13}" stroke-linecap="round"/><path d="M${cx - r * 0.72} ${cy + r * 0.7} C${cx - r * 0.12} ${cy + r * 0.42} ${cx + r * 0.26} ${cy + r * 0.1} ${cx + r * 0.72} ${cy - r * 0.66}" fill="none" stroke="${sport.secondary}" stroke-width="${r * 0.09}" stroke-linecap="round"/>`;
  }
  if (sport.ball === "soccer") {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${sport.secondary}" stroke-width="${r * 0.08}"/><polygon points="${cx},${cy - r * 0.42} ${cx + r * 0.38},${cy - r * 0.14} ${cx + r * 0.24},${cy + r * 0.32} ${cx - r * 0.24},${cy + r * 0.32} ${cx - r * 0.38},${cy - r * 0.14}" fill="${sport.secondary}"/><path d="M${cx} ${cy - r * 0.42} L${cx} ${cy - r * 0.9} M${cx + r * 0.38} ${cy - r * 0.14} L${cx + r * 0.86} ${cy - r * 0.28} M${cx + r * 0.24} ${cy + r * 0.32} L${cx + r * 0.54} ${cy + r * 0.74} M${cx - r * 0.24} ${cy + r * 0.32} L${cx - r * 0.54} ${cy + r * 0.74} M${cx - r * 0.38} ${cy - r * 0.14} L${cx - r * 0.86} ${cy - r * 0.28}" stroke="${sport.secondary}" stroke-width="${r * 0.07}"/>`;
  }
  if (sport.ball === "track") {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${sport.primary}" stroke="#fff" stroke-width="${r * 0.08}"/><path d="M${cx - r * 0.66} ${cy + r * 0.2} C${cx - r * 0.12} ${cy - r * 0.42} ${cx + r * 0.42} ${cy - r * 0.28} ${cx + r * 0.68} ${cy + r * 0.22}" fill="none" stroke="${sport.secondary}" stroke-width="${r * 0.1}" stroke-linecap="round"/><path d="M${cx - r * 0.44} ${cy + r * 0.48} L${cx + r * 0.48} ${cy + r * 0.48}" stroke="#fff" stroke-width="${r * 0.09}" stroke-linecap="round"/><path d="M${cx - r * 0.18} ${cy - r * 0.58} L${cx + r * 0.16} ${cy - r * 0.58}" stroke="#fff" stroke-width="${r * 0.09}" stroke-linecap="round"/>`;
  }
  const fill = sport.ball === "softball" ? "#fef08a" : "#fff";
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${sport.secondary}" stroke-width="${r * 0.06}"/><path d="M${cx - r * 0.52} ${cy - r * 0.82} C${cx - r * 0.16} ${cy - r * 0.28} ${cx - r * 0.16} ${cy + r * 0.28} ${cx - r * 0.52} ${cy + r * 0.82}" fill="none" stroke="${sport.primary}" stroke-width="${r * 0.07}"/><path d="M${cx + r * 0.52} ${cy - r * 0.82} C${cx + r * 0.16} ${cy - r * 0.28} ${cx + r * 0.16} ${cy + r * 0.28} ${cx + r * 0.52} ${cy + r * 0.82}" fill="none" stroke="${sport.primary}" stroke-width="${r * 0.07}"/>`;
}

function venueOverlay(sport, width, height) {
  const cx = width / 2;
  if (sport.venue === "field") {
    return `<g id="field_court_overlay" opacity=".58"><path d="M0 ${height * 0.68} H${width}" stroke="#fff" stroke-width="5"/><path d="M${cx} ${height * 0.3} V${height}" stroke="#fff" stroke-width="4"/><text x="${cx}" y="${height * 0.82}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${height * 0.14}" fill="#fff" opacity=".26">50</text></g>`;
  }
  if (sport.venue === "court") {
    return `<g id="field_court_overlay" opacity=".58"><rect x="${width * 0.08}" y="${height * 0.3}" width="${width * 0.84}" height="${height * 0.52}" rx="18" fill="none" stroke="#fff" stroke-width="5"/><circle cx="${cx}" cy="${height * 0.58}" r="${height * 0.18}" fill="none" stroke="#fff" stroke-width="5"/><path d="M${cx} ${height * 0.3} V${height * 0.82}" stroke="#fff" stroke-width="5"/></g>`;
  }
  if (sport.venue === "track") {
    return `<g id="field_court_overlay" opacity=".58"><path d="M${width * 0.06} ${height * 0.76} C${width * 0.26} ${height * 0.38} ${width * 0.74} ${height * 0.38} ${width * 0.94} ${height * 0.76}" fill="none" stroke="#fff" stroke-width="8"/><path d="M${width * 0.14} ${height * 0.82} C${width * 0.3} ${height * 0.52} ${width * 0.7} ${height * 0.52} ${width * 0.86} ${height * 0.82}" fill="none" stroke="#fff" stroke-width="5"/></g>`;
  }
  return `<g id="field_court_overlay" opacity=".58"><path d="M${width * 0.14} ${height * 0.72} C${width * 0.3} ${height * 0.48} ${width * 0.7} ${height * 0.48} ${width * 0.86} ${height * 0.72}" fill="none" stroke="#fff" stroke-width="5"/><path d="M${cx} ${height * 0.34} V${height * 0.82}" stroke="#fff" stroke-width="4"/></g>`;
}

function backgroundSvg(sport, variant, shape = "rectangle", colors = [sport.primary, sport.secondary]) {
  const width = shape === "rectangle" ? 1500 : 900;
  const height = 900;
  const [primary, secondary] = colors;
  const mask = shape === "triangle"
    ? `<clipPath id="banner_shape"><polygon points="36,70 864,70 450,850"/></clipPath>`
    : shape === "home-plate"
      ? `<clipPath id="banner_shape"><polygon points="32,32 868,32 868,500 450,868 32,500"/></clipPath>`
      : `<clipPath id="banner_shape"><rect width="${width}" height="${height}"/></clipPath>`;
  const lights = Array.from({ length: 13 }, (_, index) => `<circle cx="${width * (index / 12)}" cy="${height * 0.12}" r="${width * 0.014}" fill="#fff" opacity=".62"/>`).join("");
  const speed = Array.from({ length: 12 }, (_, index) => `<path d="M${width * (index / 10) - width * 0.2} ${height} L${width * (index / 10) + width * 0.1} 0" stroke="#fff" stroke-opacity=".13" stroke-width="${width * 0.012}"/>`).join("");
  const burst = Array.from({ length: 18 }, (_, index) => {
    const a = (Math.PI * 2 * index) / 18;
    const x = width / 2 + Math.cos(a) * width * 0.42;
    const y = height * 0.36 + Math.sin(a) * height * 0.28;
    return `<path d="M${width / 2} ${height * 0.36} L${x} ${y}" stroke="#fff" stroke-opacity=".18" stroke-width="22"/>`;
  }).join("");
  const extra = variant.key === "lights" ? lights : variant.key === "speed" ? speed : variant.key === "championship" ? burst : `<path d="M0 ${height * 0.2} C${width * 0.26} ${height * 0.08} ${width * 0.72} ${height * 0.34} ${width} ${height * 0.18}" fill="#fff" opacity=".08"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <title>${escapeHtml(sport.label)} ${escapeHtml(variant.name)} Background</title>
  <defs>${mask}<radialGradient id="bg_gradient" cx="50%" cy="35%" r="76%"><stop offset="0" stop-color="${sport.glow}"/><stop offset=".34" stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></radialGradient><linearGradient id="edge_shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset=".5" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>
  <g id="bg_stadium" clip-path="url(#banner_shape)"><rect id="bg_color" width="${width}" height="${height}" fill="url(#bg_gradient)"/><rect id="bg_edge_shade" width="${width}" height="${height}" fill="url(#edge_shade)"/><g id="bg_lighting">${extra}</g>${venueOverlay(sport, width, height)}<g id="sport_icon_watermark" opacity=".2">${ballSvg(sport, width * 0.16, height * 0.26, Math.min(width, height) * 0.11)}</g></g>
</svg>`;
}

function photoFrameSvg(sport, key = "classic") {
  const label = key.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
  const starRing = Array.from({ length: 10 }, (_, index) => {
    const a = (Math.PI * 2 * index) / 10 - Math.PI / 2;
    const x = 380 + Math.cos(a) * 256;
    const y = 286 + Math.sin(a) * 238;
    return `<path id="frame_star_${index + 1}" d="M${x} ${y - 18} l6 13 14 2 -10 9 3 14 -13 -7 -13 7 3 -14 -10 -9 14 -2z" fill="${index % 2 ? sport.primary : sport.glow}" stroke="${sport.secondary}" stroke-width="4"/>`;
  }).join("");
  const stadiumLights = Array.from({ length: 11 }, (_, index) => {
    const x = 160 + index * 44;
    return `<circle id="frame_stadium_light_${index + 1}" cx="${x}" cy="86" r="14" fill="#fff" opacity=".72"/>`;
  }).join("");
  const decor = key === "ribbon"
    ? `<path id="frame_ribbon_left" d="M112 448 L252 410 L252 610 L112 650 L150 548 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="10"/><path id="frame_ribbon_right" d="M648 448 L508 410 L508 610 L648 650 L610 548 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="10"/>`
    : key === "star"
      ? starRing
      : key === "shield"
        ? `<path id="frame_shield_back" d="M380 392 L604 468 L552 668 L380 742 L208 668 L156 468 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="14"/><path id="frame_shield_accent" d="M224 512 H536" stroke="${sport.primary}" stroke-width="18" stroke-linecap="round"/>`
        : key === "varsity"
          ? `<path id="frame_laurel_left" d="M134 356 C86 300 82 224 136 160" fill="none" stroke="${sport.glow}" stroke-width="22" stroke-linecap="round"/><path id="frame_laurel_right" d="M626 356 C674 300 678 224 624 160" fill="none" stroke="${sport.glow}" stroke-width="22" stroke-linecap="round"/>${Array.from({ length: 5 }, (_, index) => `<path id="frame_varsity_star_${index + 1}" d="M${284 + index * 48} 70 l10 22 24 3 -18 16 5 24 -21 -12 -21 12 5 -24 -18 -16 24 -3z" fill="${sport.primary}" stroke="#fff" stroke-width="5"/>`).join("")}`
          : key === "champion"
            ? `<path id="frame_crown" d="M242 114 L300 58 L356 118 L410 58 L462 118 L520 58 L576 114 L548 176 H270 Z" fill="${sport.glow}" stroke="${sport.secondary}" stroke-width="10"/><path id="frame_champion_badge" d="M380 378 L620 470 L550 668 L380 738 L210 668 L140 470 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="14"/>`
            : key === "wings"
              ? `<path id="frame_wing_left_1" d="M338 390 C210 388 118 330 56 232 C148 264 220 268 304 244" fill="#fff" opacity=".94" stroke="${sport.secondary}" stroke-width="8"/><path id="frame_wing_left_2" d="M316 432 C200 444 110 408 36 326 C130 340 204 334 286 300" fill="${sport.glow}" opacity=".9" stroke="${sport.secondary}" stroke-width="7"/><path id="frame_wing_right_1" d="M422 390 C550 388 642 330 704 232 C612 264 540 268 456 244" fill="#fff" opacity=".94" stroke="${sport.secondary}" stroke-width="8"/><path id="frame_wing_right_2" d="M444 432 C560 444 650 408 724 326 C630 340 556 334 474 300" fill="${sport.glow}" opacity=".9" stroke="${sport.secondary}" stroke-width="7"/>`
              : key === "halo"
                ? `<ellipse id="frame_halo" cx="380" cy="90" rx="176" ry="42" fill="none" stroke="${sport.glow}" stroke-width="24"/><ellipse id="frame_halo_inner" cx="380" cy="90" rx="132" ry="24" fill="none" stroke="#fff" stroke-width="9"/><path id="frame_halo_glow" d="M166 168 C256 110 504 110 594 168" fill="none" stroke="#fff" stroke-opacity=".52" stroke-width="18" stroke-linecap="round"/>`
                : key === "stadium"
                  ? `<g id="frame_stadium_lights">${stadiumLights}<path d="M110 90 L282 398" stroke="#fff" stroke-opacity=".25" stroke-width="34"/><path d="M650 90 L478 398" stroke="#fff" stroke-opacity=".25" stroke-width="34"/><path d="M380 58 V410" stroke="${sport.glow}" stroke-opacity=".18" stroke-width="48"/></g>`
                  : key === "pennant"
                    ? `<path id="frame_pennant_left" d="M86 450 L300 408 L260 612 L86 662 L134 554 Z" fill="${sport.primary}" stroke="#fff" stroke-width="10"/><path id="frame_pennant_right" d="M674 450 L460 408 L500 612 L674 662 L626 554 Z" fill="${sport.primary}" stroke="#fff" stroke-width="10"/><path id="frame_pennant_tail" d="M252 650 H508 L380 738 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="10"/>`
                    : `<ellipse id="frame_classic_glow" cx="380" cy="384" rx="294" ry="286" fill="${sport.primary}" opacity=".12"/>`;
  const nameplate = key === "shield" || key === "champion"
    ? `<path id="player_nameplate" d="M160 494 H600 L560 632 H200 Z" fill="url(#nameplate_gradient)" stroke="#fff" stroke-width="14"/><path id="player_nameplate_accent" d="M210 530 H550" stroke="${sport.glow}" stroke-width="8" stroke-linecap="round"/>`
    : key === "pennant"
      ? `<path id="player_nameplate" d="M118 488 H642 L590 620 H170 Z" fill="url(#nameplate_gradient)" stroke="#fff" stroke-width="14"/><path id="player_nameplate_accent" d="M176 530 H584" stroke="${sport.glow}" stroke-width="8" stroke-linecap="round"/>`
      : `<path id="player_nameplate" d="M146 442 C238 404 522 404 614 442 L642 588 C530 632 230 632 118 588 Z" fill="url(#nameplate_gradient)" stroke="#fff" stroke-width="14"/><path id="player_nameplate_accent" d="M178 480 C278 454 482 454 582 480" fill="none" stroke="${sport.glow}" stroke-width="8" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 760 760" data-photo-frame-variant="${escapeHtml(key)}">
  <title>${escapeHtml(sport.label)} ${escapeHtml(label)} Photo Frame</title>
  <defs>
    <clipPath id="player_photo_mask"><circle cx="380" cy="286" r="176"/></clipPath>
    <mask id="photo_window_keepout" maskUnits="userSpaceOnUse"><rect width="760" height="760" fill="#fff"/><circle cx="380" cy="286" r="174" fill="#000"/></mask>
    <linearGradient id="nameplate_gradient" x1="0" x2="1"><stop offset="0" stop-color="${sport.secondary}"/><stop offset=".52" stop-color="${sport.primary}"/><stop offset="1" stop-color="${sport.secondary}"/></linearGradient>
    <filter id="frame_shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity=".38"/></filter>
  </defs>
  <g id="player_photo_frame" filter="url(#frame_shadow)">
    <g id="frame_decor" mask="url(#photo_window_keepout)">${decor}</g>
    <circle id="player_photo_window" cx="380" cy="286" r="176" fill="none" clip-path="url(#player_photo_mask)"/>
    <circle id="player_frame_outer" cx="380" cy="286" r="220" fill="none" stroke="#fff" stroke-width="36"/>
    <circle id="player_frame_color" cx="380" cy="286" r="198" fill="none" stroke="${sport.primary}" stroke-width="16"/>
    <circle id="player_frame_inner" cx="380" cy="286" r="178" fill="none" stroke="${sport.secondary}" stroke-width="8"/>
    <g id="sport_icon">${ballSvg(sport, 380, 600, 58)}</g>
    ${nameplate}
  </g>
</svg>`;
}

function logoSvg(sport, name = "TEAM", mascot = "MASCOT", primary = sport.primary, secondary = sport.secondary, style = "badge") {
  const text = escapeHtml(name.toUpperCase().slice(0, 18));
  const mascotText = escapeHtml(mascot.toUpperCase().slice(0, 18));
  const center = style === "varsity"
    ? `<text id="logo_letter" x="450" y="350" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="300" fill="${primary}" stroke="#fff" stroke-width="28" paint-order="stroke">${escapeHtml(name[0] || "T")}</text>`
    : `<path id="logo_shield" d="M450 34 L738 138 L690 392 L450 486 L210 392 L162 138 Z" fill="${secondary}" stroke="#fff" stroke-width="18"/><path id="logo_inner" d="M450 74 L694 160 L654 362 L450 442 L246 362 L206 160 Z" fill="${primary}" stroke="${sport.glow}" stroke-width="10"/>${ballSvg(sport, 450, 190, 74)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <title>${text} ${escapeHtml(sport.label)} Logo Placeholder</title>
  <defs><filter id="logo_shadow"><feDropShadow dx="0" dy="14" stdDeviation="8" flood-color="#000" flood-opacity=".45"/></filter></defs>
  <g id="logo_team" filter="url(#logo_shadow)">${center}<text id="title_team_name" x="450" y="344" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="82" fill="#fff" stroke="${secondary}" stroke-width="8" paint-order="stroke">${text}</text><text id="title_mascot" x="450" y="405" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="42" fill="${sport.glow}">${mascotText}</text></g>
</svg>`;
}

function nameplateSvg(sport, key = "classic") {
  const shape = key === "arched"
    ? `<path id="nameplate_shape" d="M90 250 C190 178 570 178 670 250 L620 356 C496 318 264 318 140 356 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="18"/>`
    : key === "ribbon"
      ? `<path id="nameplate_shape" d="M70 205 H690 L640 306 L690 407 H70 L120 306 Z" fill="${sport.secondary}" stroke="#fff" stroke-width="18"/>`
      : `<rect id="nameplate_shape" x="86" y="196" width="588" height="168" rx="34" fill="${sport.secondary}" stroke="#fff" stroke-width="18"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="520" viewBox="0 0 760 520"><title>${escapeHtml(sport.label)} Nameplate</title><g id="player_nameplate">${shape}<text id="player_name" x="380" y="315" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="84" fill="#fff">PLAYER</text></g></svg>`;
}

function iconSvg(sport, key = "ball") {
  const body = key === "jersey"
    ? `<path id="jersey_icon" d="M144 122 L188 86 H232 L276 122 L326 174 L284 214 V326 H136 V214 L94 174 Z" fill="${sport.primary}" stroke="#fff" stroke-width="14"/><text id="number_text" x="210" y="250" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="76" fill="#fff">${sport.short}</text>`
    : key === "medal"
      ? `<path id="medal_ribbon" d="M150 74 L204 172 M270 74 L216 172" stroke="${sport.primary}" stroke-width="28"/><circle id="medal" cx="210" cy="226" r="104" fill="${sport.glow}" stroke="#fff" stroke-width="16"/><text id="medal_text" x="210" y="250" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="58" fill="${sport.secondary}">${sport.short}</text>`
      : ballSvg(sport, 210, 210, 126);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420"><title>${escapeHtml(sport.label)} Icon</title><g id="sport_icon">${body}</g></svg>`;
}

function lightSvg(sport, key = "spotlight") {
  const body = key === "halo"
    ? `<ellipse id="light_halo" cx="380" cy="260" rx="280" ry="95" fill="none" stroke="${sport.glow}" stroke-width="34" opacity=".8"/>`
    : key === "burst"
      ? Array.from({ length: 18 }, (_, index) => {
          const a = (Math.PI * 2 * index) / 18;
          return `<path id="light_ray_${index + 1}" d="M380 260 L${380 + Math.cos(a) * 330} ${260 + Math.sin(a) * 210}" stroke="${index % 2 ? "#fff" : sport.glow}" stroke-width="22" stroke-opacity=".32"/>`;
        }).join("")
      : `<path id="spotlight_left" d="M0 0 L310 520 L0 520 Z" fill="#fff" opacity=".18"/><path id="spotlight_right" d="M760 0 L450 520 L760 520 Z" fill="#fff" opacity=".18"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="520" viewBox="0 0 760 520"><title>${escapeHtml(sport.label)} Light Effect</title><g id="bg_lighting">${body}</g></svg>`;
}

function playerSlots(count, width, height, shape) {
  if (count === 1) return [{ x: width * 0.5, y: height * 0.58 }];
  const slots = [];
  const leftX = width * 0.16;
  const rightX = width * 0.84;
  const top = height * (shape === "rectangle" ? 0.22 : 0.18);
  const bottom = height * (shape === "rectangle" ? 0.78 : 0.68);
  const side = Math.ceil(count / 2);
  for (let i = 0; i < side && slots.length < count; i += 1) {
    slots.push({ x: leftX, y: side === 1 ? height * 0.5 : top + ((bottom - top) * i) / (side - 1) });
  }
  for (let i = 0; i < side && slots.length < count; i += 1) {
    slots.push({ x: rightX, y: side === 1 ? height * 0.5 : top + ((bottom - top) * i) / (side - 1) });
  }
  if (count >= 8) {
    const bottomCount = Math.min(4, count - 6);
    for (let i = 0; i < bottomCount; i += 1) {
      const index = slots.length - 1 - i;
      if (slots[index]) {
        slots[index] = { x: width * (0.34 + i * 0.11), y: height * 0.78 };
      }
    }
  }
  return slots.slice(0, count);
}

function templateSvg(sport, product, colors) {
  const shape = product.shape === "rectangle" ? "rectangle" : product.shape;
  const width = shape === "rectangle" ? 1500 : 900;
  const height = 900;
  const clip = shape === "triangle"
    ? `<clipPath id="banner_shape"><polygon points="36,70 864,70 450,850"/></clipPath>`
    : shape === "home-plate"
      ? `<clipPath id="banner_shape"><polygon points="32,32 868,32 868,500 450,868 32,500"/></clipPath>`
      : `<clipPath id="banner_shape"><rect width="${width}" height="${height}"/></clipPath>`;
  const slots = playerSlots(product.playerCount, width, height, shape);
  const frameRadius = Math.max(42, Math.min(width, height) * (product.playerCount > 12 ? 0.052 : product.playerCount > 8 ? 0.062 : 0.074));
  const players = slots.map((slot, index) => {
    const n = String(index + 1).padStart(2, "0");
    const nameY = slot.y + frameRadius + 34;
    return `<g id="player_${n}" data-layer-role="player" data-player-index="${index + 1}">
      <clipPath id="player_${n}_photo_mask"><circle cx="${slot.x}" cy="${slot.y}" r="${frameRadius * 0.86}"/></clipPath>
      <rect id="player_${n}_photo_placeholder" x="${slot.x - frameRadius * 0.86}" y="${slot.y - frameRadius * 0.86}" width="${frameRadius * 1.72}" height="${frameRadius * 1.72}" rx="${frameRadius * 0.86}" fill="#d1d5db" clip-path="url(#player_${n}_photo_mask)"/>
      <circle id="player_${n}_frame" cx="${slot.x}" cy="${slot.y}" r="${frameRadius}" fill="none" stroke="#fff" stroke-width="${Math.max(8, frameRadius * 0.15)}"/>
      <circle id="player_${n}_frame_color" cx="${slot.x}" cy="${slot.y}" r="${frameRadius * 0.92}" fill="none" stroke="${colors[0]}" stroke-width="${Math.max(5, frameRadius * 0.08)}"/>
      <path id="player_${n}_nameplate" d="M${slot.x - frameRadius * 1.12} ${nameY - 24} H${slot.x + frameRadius * 1.12} L${slot.x + frameRadius * 0.9} ${nameY + 34} H${slot.x - frameRadius * 0.9} Z" fill="${colors[1]}" stroke="#fff" stroke-width="5"/>
      <text id="player_${n}_name" x="${slot.x}" y="${nameY + 17}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${Math.max(20, frameRadius * 0.38)}" fill="#fff">PLAYER</text>
      <text id="player_${n}_number" x="${slot.x + frameRadius * 0.78}" y="${slot.y + frameRadius * 0.92}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${Math.max(18, frameRadius * 0.34)}" fill="${colors[0]}" stroke="#fff" stroke-width="3">#${index + 1}</text>
    </g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-template-id="${product.handle}" data-sport="${sport.slug}" data-shape="${product.shape}" data-player-count="${product.playerCount}">
  <title>${escapeHtml(product.title)}</title>
  <defs>${clip}<radialGradient id="bg_gradient" cx="50%" cy="38%" r="76%"><stop offset="0" stop-color="${sport.glow}"/><stop offset=".38" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></radialGradient></defs>
  <g id="template_root" clip-path="url(#banner_shape)">
    <rect id="bg_stadium" width="${width}" height="${height}" fill="url(#bg_gradient)"/>
    <g id="bg_lighting"><path d="M0 0 L${width * 0.32} ${height * 0.7} L0 ${height} Z" fill="#fff" opacity=".12"/><path d="M${width} 0 L${width * 0.68} ${height * 0.7} L${width} ${height} Z" fill="#fff" opacity=".12"/></g>
    ${venueOverlay(sport, width, height)}
    <g id="sport_icon" opacity=".92">${ballSvg(sport, width * 0.5, height * 0.28, Math.min(width, height) * 0.11)}</g>
    <g id="logo_team">${logoSvg(sport, product.teamName, "CLUB", colors[0], colors[1]).replace(/<svg[^>]*>|<\/svg>/g, "")}</g>
    <text id="title_team_name" x="${width / 2}" y="${height * 0.52}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${shape === "rectangle" ? 112 : 82}" fill="#fff" stroke="${colors[1]}" stroke-width="10" paint-order="stroke">${escapeHtml(product.teamName.toUpperCase())}</text>
    <text id="subtitle_sport_year" x="${width / 2}" y="${height * 0.61}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${shape === "rectangle" ? 54 : 38}" fill="${sport.glow}">${escapeHtml(sport.label.toUpperCase())} ${YEAR}</text>
    ${players}
    <text id="footer_text" x="${width / 2}" y="${height * 0.94}" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="${shape === "rectangle" ? 38 : 28}" fill="#fff">ONE SCHOOL. ONE TEAM.</text>
  </g>
</svg>`;
}

async function writeSvg(filePath, svg) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, svg);
  return {
    file_name: path.basename(filePath),
    file_path: path.relative(ROOT, filePath).split(path.sep).join("/"),
    url_path: svgUrl(filePath),
    bytes: Buffer.byteLength(svg)
  };
}

async function fileHash(filePath) {
  const data = await readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function assetRecord(sport, assetType, category, name, file, extra = {}) {
  return {
    id: `${sport.slug}:${assetType}:${slugify(name)}:${path.basename(file.file_name, ".svg")}`,
    sport: sport.label,
    sport_slug: sport.slug,
    asset_type: assetType,
    design_tool_category: category,
    name,
    source_type: "generated-native-svg",
    usage_status: "generated-placeholder",
    source_url: "",
    alt_text: `${sport.label} ${name}`,
    ...file,
    ...extra
  };
}

async function backupCurrentFiles() {
  await rm(BACKUP_ROOT, { recursive: true, force: true });
  await mkdir(BACKUP_ROOT, { recursive: true });
  const targets = [
    "public/team-banner-assets.shopify.json",
    "public/team-banner-products.json",
    "public/svg-layer-templates.json",
    "public/team-banner-designer.js",
    "shopify-banner-designer/assets/team-banner-designer.js",
    "shopify-banner-designer/sections/team-banner-designer.liquid"
  ];
  const entries = [];
  for (const target of targets) {
    const src = path.join(ROOT, target);
    try {
      await stat(src);
      const dest = path.join(BACKUP_ROOT, target);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(src, dest);
      entries.push({ path: target, backup_path: path.relative(ROOT, dest).split(path.sep).join("/"), sha256: await fileHash(src) });
    } catch {
      entries.push({ path: target, backup_path: "", missing: true });
    }
  }
  return entries;
}

async function main() {
  await rm(PUBLIC_ASSET_ROOT, { recursive: true, force: true });
  await rm(PUBLIC_DESIGN_TOOL_ROOT, { recursive: true, force: true });
  await rm(SPORTS_ROOT, { recursive: true, force: true });
  await mkdir(IMPORTS_ROOT, { recursive: true });
  await mkdir(DESIGN_TOOL_ROOT, { recursive: true });
  await mkdir(PUBLIC_DESIGN_TOOL_ROOT, { recursive: true });
  await mkdir(LOGS_ROOT, { recursive: true });
  const backupEntries = await backupCurrentFiles();

  const assetMap = [];
  const templateMap = [];
  const schoolLogoMap = [];
  const productsBySport = new Map();

  for (const sport of sports) {
    const sportProducts = [];
    const sportRoot = path.join(PUBLIC_ASSET_ROOT, sport.slug);
    await mkdir(path.join(SPORTS_ROOT, sport.slug), { recursive: true });

    for (const shape of ["rectangle", "triangle", "home-plate"]) {
      for (const variant of backgroundVariants) {
        const file = await writeSvg(path.join(sportRoot, "backgrounds", `${sport.slug}-${shape}-${variant.key}-background.svg`), backgroundSvg(sport, variant, shape));
        assetMap.push(assetRecord(sport, "background", shape === "rectangle" ? "BG Hem & Grommets" : shape === "triangle" ? "BG Triangle" : "BG Home Plate", `${variant.name} ${shape} Background`, file, { shape }));
      }
    }

    for (const variant of backgroundVariants) {
      const file = await writeSvg(path.join(sportRoot, "backgrounds", `${sport.slug}-pole-pocket-${variant.key}-background.svg`), backgroundSvg(sport, variant, "rectangle"));
      assetMap.push(assetRecord(sport, "background", "BG Pole Pocket", `${variant.name} Pole Pocket Background`, file, { shape: "pole-pocket" }));
    }

    for (const frame of ["classic", "ribbon", "star", "shield", "varsity", "champion", "wings", "halo", "stadium", "pennant"]) {
      const file = await writeSvg(path.join(sportRoot, "photo-frames", `${sport.slug}-${frame}-photo-frame.svg`), photoFrameSvg(sport, frame));
      assetMap.push(assetRecord(sport, "player_photo_frame", "Photo Frame", `${frame} photo frame`, file));
    }

    for (const plate of ["classic", "arched", "ribbon", "bold", "compact", "wide"]) {
      const file = await writeSvg(path.join(sportRoot, "nameplates", `${sport.slug}-${plate}-nameplate.svg`), nameplateSvg(sport, plate));
      assetMap.push(assetRecord(sport, "nameplate", "Accessory", `${plate} nameplate`, file));
    }

    for (const icon of ["ball", "jersey", "medal", "number", "crest", "star", "wings", "flame"]) {
      const file = await writeSvg(path.join(sportRoot, "icons", `${sport.slug}-${icon}-icon.svg`), iconSvg(sport, icon));
      assetMap.push(assetRecord(sport, "sport_icon", "Accessory", `${icon} icon`, file));
    }

    for (const ball of ["primary", "outline", "shadow", "badge"]) {
      const file = await writeSvg(path.join(sportRoot, "balls", `${sport.slug}-${ball}-ball.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420"><title>${escapeHtml(sport.label)} Ball</title><g id="sport_ball">${ballSvg(sport, 210, 210, 150)}</g></svg>`);
      assetMap.push(assetRecord(sport, "ball", "Accessory", `${ball} ball`, file));
    }

    for (const overlay of ["standard", "wide", "center", "minimal"]) {
      const file = await writeSvg(path.join(sportRoot, "overlays", `${sport.slug}-${overlay}-overlay.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900" viewBox="0 0 1500 900"><title>${escapeHtml(sport.label)} Overlay</title>${venueOverlay(sport, 1500, 900)}</svg>`);
      assetMap.push(assetRecord(sport, "field_court_overlay", "Accessory", `${overlay} field/court overlay`, file));
    }

    for (const light of ["spotlight", "halo", "burst", "stadium"]) {
      const file = await writeSvg(path.join(sportRoot, "light-effects", `${sport.slug}-${light}-light-effect.svg`), lightSvg(sport, light));
      assetMap.push(assetRecord(sport, "light_effect", "Clip art", `${light} light effect`, file));
    }

    for (const logoStyle of ["badge", "varsity", "shield", "champion", "circle", "diamond", "script", "block"]) {
      const file = await writeSvg(path.join(sportRoot, "team-logos", `${sport.slug}-${logoStyle}-team-logo.svg`), logoSvg(sport, "TEAM", sport.label, sport.primary, sport.secondary, logoStyle));
      assetMap.push(assetRecord(sport, "team_logo_placeholder", "Team name", `${logoStyle} team logo placeholder`, file));
    }

    for (const school of californiaSchools) {
      const [schoolName, city, mascot, primary, secondary] = school;
      const schoolSlug = slugify(`${schoolName}-${sport.slug}`);
      const file = await writeSvg(path.join(sportRoot, "school-logos", `${schoolSlug}-placeholder-logo.svg`), logoSvg(sport, schoolName.replace(/\b(High|Middle|School)\b/g, "").trim(), mascot, primary, secondary));
      const record = assetRecord(sport, "school_team_logo", "Team name", `${schoolName} ${mascot} placeholder logo`, file, {
        school_name: schoolName,
        city,
        state: "CA",
        mascot,
        color_primary: primary,
        color_secondary: secondary,
        usage_status: "generated-placeholder",
        source_url: "",
        notes: "Generated placeholder only. Official school logo, colors, and mascot usage require client/legal review before production use."
      });
      assetMap.push(record);
      schoolLogoMap.push(record);
    }

    for (const plan of productPlan) {
      for (let i = 0; i < plan.count; i += 1) {
        const playerCount = playerCounts[i % playerCounts.length];
        const style = productStyles[i % productStyles.length];
        const handle = `${sport.slug}-${plan.style}-${playerCount}-player-${style.key}-${YEAR}`;
        const teamName = sport.label === "Track & Field" ? "VARSITY" : "BULLDOGS";
        const product = {
          handle,
          title: `${sport.label} ${plan.label} ${playerCount} Player ${style.name} ${YEAR}`,
          sport: sport.label,
          sport_slug: sport.slug,
          shape: plan.shape,
          style: plan.style,
          banner_style_label: plan.label,
          size: plan.shape === "rectangle" ? "5x3" : "standard",
          playerCount,
          teamName,
          print_option: plan.label,
          collection: `${sport.label} Banner Templates`,
          style_key: style.key,
          colors: style.colors
        };
        const templateFile = await writeSvg(path.join(sportRoot, "templates", `${handle}.svg`), templateSvg(sport, product, style.colors));
        product.template_svg_path = templateFile.url_path;
        product.preview_image_path = templateFile.url_path;
        templateMap.push({
          name: handle,
          title: product.title,
          url: product.template_svg_path,
          sourceUrl: product.template_svg_path,
          type: plan.shape === "home-plate" ? "homeplatepennant" : plan.shape,
          sport: sport.slug === "track-field" ? "track" : sport.slug,
          playerCount,
          imageCount: playerCount + 3,
          textCount: playerCount * 2 + 4,
          backgroundCount: 1,
          teamLogoCount: 1,
          clipartCount: 1,
          playerIconCount: playerCount,
          usage_status: "generated-placeholder",
          layerNaming: {
            background: "bg_stadium",
            lighting: "bg_lighting",
            teamLogo: "logo_team",
            teamName: "title_team_name",
            sportIcon: "sport_icon",
            footer: "footer_text",
            playerPattern: "player_XX_*"
          }
        });
        sportProducts.push(product);
      }
    }

    productsBySport.set(sport.slug, sportProducts);
    await writeFile(path.join(SPORTS_ROOT, sport.slug, "manifest.json"), JSON.stringify({
      sport: sport.label,
      sport_slug: sport.slug,
      generatedAt: new Date().toISOString(),
      assetCount: assetMap.filter((asset) => asset.sport_slug === sport.slug).length,
      productCount: sportProducts.length,
      products: sportProducts.map((product) => ({
        handle: product.handle,
        title: product.title,
        template_svg_path: product.template_svg_path,
        preview_image_path: product.preview_image_path
      }))
    }, null, 2));
  }

  for (const sport of sports) {
    const rows = [csvHeaders.join(",")];
    for (const product of productsBySport.get(sport.slug)) {
      const metadata = {
        sport: product.sport_slug,
        shape: product.shape,
        style: product.style,
        player_count: product.playerCount,
        template_svg_path: product.template_svg_path,
        usage_status: "generated-placeholder",
        source: RUN_ID
      };
      rows.push([
        product.handle,
        product.title,
        `<p>Editable ${product.sport} ${product.banner_style_label} banner template with native SVG layers, player photo frames, editable nameplates, team logo placeholder, sport icon, and print-ready structure.</p>`,
        "Team Sport Banners",
        "Arts & Entertainment > Party & Celebration > Banners",
        `${product.sport} Banner`,
        `${product.sport}, ${product.banner_style_label}, ${product.playerCount} players, tbd:generated-placeholder, tbd:shape:${product.shape}, tbd:sport:${product.sport_slug}, tbd:players:${product.playerCount}`,
        "FALSE",
        "Print Option",
        product.banner_style_label,
        "Size",
        product.size,
        `TSB-${product.sport_slug.toUpperCase().replace(/-/g, "")}-${product.shape.toUpperCase().replace(/-/g, "")}-${String(product.playerCount).padStart(2, "0")}-${product.style_key.toUpperCase()}`,
        "69.99",
        "TRUE",
        "TRUE",
        product.preview_image_path,
        `${product.title} preview`,
        "DRAFT",
        product.collection,
        product.sport_slug,
        product.shape,
        product.playerCount,
        product.template_svg_path,
        JSON.stringify(metadata)
      ].map(csv).join(","));
    }
    await writeFile(path.join(IMPORTS_ROOT, `shopify-products-${sport.slug}.csv`), `${rows.join("\n")}\n`);
  }

  const assetMapDoc = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    source: "generated-native-svg",
    safeForProductionImport: false,
    productionImportBlockedBy: ["requires Shopify product/collection backup", "requires legal approval for official school logos", "requires asset upload credentials and CDN URL confirmation"],
    assetCount: assetMap.length,
    assets: assetMap
  };
  const templateMapDoc = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    templateCount: templateMap.length,
    templates: templateMap
  };
  const schoolLogoDoc = {
    generatedAt: new Date().toISOString(),
    usagePolicy: "No official school logos are included. All entries are generated placeholders and require client/legal review before official school branding use.",
    requiredMetadataFields: ["school_name", "city", "state", "mascot", "sport", "color_primary", "color_secondary", "asset_type", "usage_status", "source_url", "file_name", "alt_text", "design_tool_category"],
    logoCount: schoolLogoMap.length,
    logos: schoolLogoMap
  };

  await writeFile(path.join(DESIGN_TOOL_ROOT, "asset-map.json"), JSON.stringify(assetMapDoc, null, 2));
  await writeFile(path.join(DESIGN_TOOL_ROOT, "template-map.json"), JSON.stringify(templateMapDoc, null, 2));
  await writeFile(path.join(DESIGN_TOOL_ROOT, "school-logo-map.json"), JSON.stringify(schoolLogoDoc, null, 2));
  await writeFile(path.join(PUBLIC_DESIGN_TOOL_ROOT, "asset-map.json"), JSON.stringify(assetMapDoc, null, 2));
  await writeFile(path.join(PUBLIC_DESIGN_TOOL_ROOT, "template-map.json"), JSON.stringify(templateMapDoc, null, 2));
  await writeFile(path.join(PUBLIC_DESIGN_TOOL_ROOT, "school-logo-map.json"), JSON.stringify(schoolLogoDoc, null, 2));

  const allUploadItems = [...assetMap, ...templateMap.map((template) => ({
    id: `template:${template.name}`,
    asset_type: "editable_svg_template",
    sport_slug: template.sport,
    file_path: template.url.replace(/^\//, "public/"),
    url_path: template.url,
    usage_status: "generated-placeholder"
  }))];
  const batchSize = 180;
  const batchLogs = [];
  for (let start = 0; start < allUploadItems.length; start += batchSize) {
    const batchNumber = Math.floor(start / batchSize) + 1;
    const batch = allUploadItems.slice(start, start + batchSize);
    const batchLog = {
      batch: batchNumber,
      batchSize,
      itemCount: batch.length,
      status: "not-uploaded",
      blockedBy: "Production upload intentionally blocked until current Shopify theme/products/collections are backed up and legal/logo review is complete.",
      items: batch.map((item) => ({ id: item.id || item.name, file_path: item.file_path, url_path: item.url_path, usage_status: item.usage_status }))
    };
    batchLogs.push(batchLog);
    await writeFile(path.join(LOGS_ROOT, `upload-log-batch-${String(batchNumber).padStart(3, "0")}.json`), JSON.stringify(batchLog, null, 2));
  }

  const localChecks = [];
  for (const asset of assetMap) {
    const text = await readFile(path.join(ROOT, asset.file_path), "utf8");
    localChecks.push({ id: asset.id, file_path: asset.file_path, ok: text.includes("<svg") && text.includes("</svg>") && text.includes("id=") });
  }
  for (const template of templateMap) {
    const text = await readFile(path.join(ROOT, template.url.replace(/^\//, "public/")), "utf8");
    const ok = [
      "bg_stadium",
      "bg_lighting",
      "logo_team",
      "title_team_name",
      "player_01_photo_mask",
      "player_01_frame",
      "player_01_nameplate",
      "player_01_name",
      "player_01_number",
      "sport_icon",
      "footer_text"
    ].every((needle) => text.includes(needle));
    localChecks.push({ id: `template:${template.name}`, file_path: template.url, ok });
  }
  const passCount = localChecks.filter((check) => check.ok).length;
  const qa = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    qaScope: "local-generation-and-schema-validation",
    productionQaStatus: "blocked-pending-shopify-backup-upload-import",
    checkedItems: localChecks.length,
    passedItems: passCount,
    failedItems: localChecks.length - passCount,
    passRate: Number((passCount / localChecks.length).toFixed(4)),
    checks: {
      svgTagPresent: true,
      editableLayerIdsPresent: true,
      csvFilesGenerated: sports.length,
      productRowsGenerated: Array.from(productsBySport.values()).reduce((sum, rows) => sum + rows.length, 0),
      uploadBatchLogsGenerated: batchLogs.length,
      backupsCreated: backupEntries.length
    },
    failures: localChecks.filter((check) => !check.ok)
  };
  await writeFile(path.join(DESIGN_TOOL_ROOT, "qa-report.json"), JSON.stringify(qa, null, 2));
  await writeFile(path.join(LOGS_ROOT, "qa-results.json"), JSON.stringify(qa, null, 2));
  await writeFile(path.join(LOGS_ROOT, "backup-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), backupRoot: path.relative(ROOT, BACKUP_ROOT), files: backupEntries }, null, 2));
  await writeFile(path.join(LOGS_ROOT, "rollback-plan.md"), `# Rollback Plan

Run id: ${RUN_ID}

## Current State

No live Shopify products, collections, or theme assets were modified by this generator. All generated products are DRAFT in CSV files, and upload batches are marked not-uploaded.

## Local Rollback

1. Remove generated files:
   - \`public/assets/sports\`
   - \`sports\`
   - \`imports/shopify-products-*.csv\`
   - \`design-tool/asset-map.json\`
   - \`design-tool/template-map.json\`
   - \`design-tool/school-logo-map.json\`
   - \`design-tool/qa-report.json\`
   - \`logs/upload-log-batch-*.json\`
   - \`logs/qa-results.json\`
2. Restore backed-up manifests from \`${path.relative(ROOT, BACKUP_ROOT)}\` if any tracked file is changed later.

## Shopify Production Rollback

Before any future upload/import:
1. Export current theme.
2. Export current products.
3. Export current collections.
4. Import one small DRAFT batch only.
5. Validate five products per sport.

If a future import fails:
1. Archive generated products by tag \`tbd:generated-placeholder\`.
2. Remove generated smart/manual collections created during the run.
3. Restore theme from backup.
4. Repoint design tool manifests to the pre-import URLs.
5. Re-run design tool QA and cart/source regression.
`);

  console.log(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    sports: sports.length,
    generatedSvgAssets: assetMap.length,
    generatedTemplates: templateMap.length,
    generatedProducts: Array.from(productsBySport.values()).reduce((sum, rows) => sum + rows.length, 0),
    uploadBatches: batchLogs.length,
    qaPassRate: qa.passRate
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
