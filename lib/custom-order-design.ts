import { createHash } from "node:crypto";
import type { CustomOrderDesignInput } from "@/lib/shopify-custom-order";

export type CustomOrderDesignShape = "rectangle" | "polepocket" | "triangle" | "homeplatepennant";

export type EmbeddedOrderImage = {
  sourceUrl: string;
  dataUrl: string;
  bytes: number;
  contentType: string;
};

export type CustomOrderDesignLayer = {
  id: string;
  name: string;
  role: string;
  type: string;
  text?: string;
  data: {
    name: string;
    role: string;
  };
};

export type GeneratedCustomOrderDesign = {
  svg: string;
  layeredSvg: string;
  shape: CustomOrderDesignShape;
  width: number;
  height: number;
  layers: CustomOrderDesignLayer[];
  sourceSvgStats: {
    objectCount: number;
    imageCount: number;
    rasterImageCount: number;
    vectorObjectCount: number;
    namedLayerCount: number;
    textCount: number;
    layered: boolean;
    illustratorLayered: boolean;
  };
};

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "artwork";
}

function compactText(value: unknown, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function shapeFromBannerType(value: unknown): CustomOrderDesignShape {
  const type = compactText(value).toLowerCase();
  if (/pole\s*pocket|polepocket|sleeve/.test(type)) return "polepocket";
  if (/home\s*plate|homeplate/.test(type)) return "homeplatepennant";
  if (/triangle|pennant/.test(type)) return "triangle";
  return "rectangle";
}

export function customOrderDesignId(order: { id: string; createdAt?: string }, lineItemId: string) {
  const createdAt = new Date(order.createdAt || "").getTime();
  const timestamp = Number.isFinite(createdAt) && createdAt > 0
    ? String(createdAt)
    : (order.id.match(/[0-9]+$/)?.[0] || "0");
  const suffix = createHash("sha256").update(`${order.id}:${lineItemId}`).digest("hex").slice(0, 8);
  return `design_${timestamp}_${suffix}`;
}

export function customOrderImageUrl(value: unknown): string {
  function nested(input: unknown): string {
    if (typeof input === "string") {
      try {
        const url = new URL(input.trim().replace(/&amp;/g, "&"));
        return url.protocol === "https:" ? url.toString() : "";
      } catch {
        return "";
      }
    }
    if (Array.isArray(input)) return input.map(nested).find(Boolean) || "";
    if (input && typeof input === "object") {
      return Object.values(input as Record<string, unknown>).map(nested).find(Boolean) || "";
    }
    return "";
  }

  const raw = compactText(value);
  const direct = nested(raw);
  if (direct) return direct;
  try {
    const parsed = nested(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {}
  const match = raw.match(/https:\/\/[^\s"'<>\\]+/i);
  return match ? nested(match[0]) : "";
}

export async function readOrderImageWithinLimit(response: Response, remainingBytes: number) {
  if (!response.body) throw new Error("Uploaded image response is empty.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > remainingBytes) throw new Error("Customer uploads exceed the 8 MB design limit.");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, total);
}

function artboardForShape(shape: CustomOrderDesignShape) {
  if (shape === "polepocket") return { width: 1500, height: 1102 };
  if (shape === "rectangle") return { width: 1500, height: 900 };
  return { width: 900, height: 900 };
}

function staffLines(input: CustomOrderDesignInput) {
  return [
    ["Manager", input.manager],
    ["Asst. Manager", input.assistantManager],
    ["Coach", input.coach],
    ["Asst. Coach", input.assistantCoach],
    ["Team Mom/Dad", input.teamMomDad],
    ["Sponsor", input.sponsors]
  ].filter((entry): entry is [string, string] => Boolean(compactText(entry[1])));
}

function textLength(value: string, maxWidth: number, fontSize: number) {
  return value.length * fontSize * 0.58 > maxWidth
    ? ` textLength="${Math.round(maxWidth)}" lengthAdjust="spacingAndGlyphs"`
    : "";
}

export function generateCustomOrderDesign(
  input: CustomOrderDesignInput,
  embeddedImages: Map<string, EmbeddedOrderImage> = new Map()
): GeneratedCustomOrderDesign {
  const shape = shapeFromBannerType(input.bannerType);
  const { width, height } = artboardForShape(shape);
  const elements: string[] = [];
  const layeredElements: string[] = [];
  const layers: CustomOrderDesignLayer[] = [];
  let layerIndex = 0;

  function addLayer(name: string, role: string, type: string, markup: (attributes: string) => string, text = "") {
    layerIndex += 1;
    const id = `tsb-layer-${String(layerIndex).padStart(3, "0")}-${slug(name)}`;
    const attributes = `id="${id}" data-name="${escapeXml(name)}" data-role="${escapeXml(role)}"`;
    const element = markup(attributes);
    elements.push(element);
    layeredElements.push(`<g id="Layer_${String(layerIndex).padStart(3, "0")}_${slug(name).replace(/-/g, "_")}" data-name="${escapeXml(name)}" data-layer-role="${escapeXml(role)}" data-layer-type="${escapeXml(type)}" inkscape:groupmode="layer" inkscape:label="${escapeXml(name)}">${element}</g>`);
    layers.push({
      id,
      name,
      role,
      type,
      ...(text ? { text } : {}),
      data: { name, role }
    });
  }

  const isRectangle = shape === "rectangle" || shape === "polepocket";
  const sleeveHeight = shape === "polepocket" ? 195 : 0;
  const designTop = sleeveHeight;
  const primary = "#123a77";
  const accent = "#13a574";
  const paper = "#ffffff";

  if (shape === "triangle") {
    addLayer("Background", "template-background", "polygon", (attrs) => (
      `<polygon ${attrs} class="background locked" points="45,45 855,45 450,855" fill="${paper}"/>`
    ));
    addLayer("Banner border", "template-border", "polygon", (attrs) => (
      `<polygon ${attrs} points="45,45 855,45 450,855" fill="none" stroke="${primary}" stroke-width="18"/>`
    ));
  } else if (shape === "homeplatepennant") {
    addLayer("Background", "template-background", "polygon", (attrs) => (
      `<polygon ${attrs} class="background locked" points="45,45 855,45 855,495 450,855 45,495" fill="${paper}"/>`
    ));
    addLayer("Banner border", "template-border", "polygon", (attrs) => (
      `<polygon ${attrs} points="45,45 855,45 855,495 450,855 45,495" fill="none" stroke="${primary}" stroke-width="18"/>`
    ));
  } else {
    addLayer("Background", "template-background", "rect", (attrs) => (
      `<rect ${attrs} class="background locked" x="0" y="${designTop}" width="${width}" height="${height - designTop}" fill="${paper}"/>`
    ));
    if (shape === "polepocket") {
      addLayer("Pole pocket sleeve", "template-pole-pocket", "rect", (attrs) => (
        `<rect ${attrs} x="0" y="0" width="${width}" height="${sleeveHeight}" fill="#e9eef5" stroke="${primary}" stroke-width="8"/>`
      ));
      addLayer("Pole pocket seam", "template-pole-pocket", "line", (attrs) => (
        `<line ${attrs} x1="0" y1="${sleeveHeight}" x2="${width}" y2="${sleeveHeight}" stroke="${accent}" stroke-width="8"/>`
      ));
    }
    addLayer("Banner border", "template-border", "rect", (attrs) => (
      `<rect ${attrs} x="8" y="${designTop + 8}" width="${width - 16}" height="${height - designTop - 16}" fill="none" stroke="${primary}" stroke-width="16"/>`
    ));
  }

  const teamName = compactText(input.teamName, "TEAM NAME");
  const titleY = isRectangle ? designTop + 82 : 112;
  const titleSize = isRectangle ? 58 : 48;
  addLayer("Team name", "template-team-name", "text", (attrs) => (
    `<text ${attrs} x="${width / 2}" y="${titleY}" text-anchor="middle" fill="${primary}" font-family="Arial Black, Arial, sans-serif" font-size="${titleSize}" font-weight="900"${textLength(teamName, isRectangle ? 560 : 610, titleSize)}>${escapeXml(teamName)}</text>`
  ), teamName);

  const logoUrl = customOrderImageUrl(input.teamLogo);
  const logo = logoUrl ? embeddedImages.get(logoUrl) : null;
  const logoBox = isRectangle
    ? { x: width / 2 - 92, y: designTop + 100, width: 184, height: 116 }
    : { x: width / 2 - 90, y: 135, width: 180, height: 126 };
  if (logo) {
    addLayer("Team logo", "template-team-logo", "image", (attrs) => (
      `<image ${attrs} class="asset team-logo" x="${logoBox.x}" y="${logoBox.y}" width="${logoBox.width}" height="${logoBox.height}" preserveAspectRatio="xMidYMid meet" href="${logo.dataUrl}"/>`
    ));
  } else {
    addLayer("Team logo placeholder", "template-team-logo", "rect", (attrs) => (
      `<rect ${attrs} x="${logoBox.x}" y="${logoBox.y}" width="${logoBox.width}" height="${logoBox.height}" rx="6" fill="#f3f6fa" stroke="${primary}" stroke-width="3" stroke-dasharray="10 8"/>`
    ));
    addLayer("Team logo placeholder text", "template-team-logo-label", "text", (attrs) => (
      `<text ${attrs} x="${width / 2}" y="${logoBox.y + logoBox.height / 2 + 7}" text-anchor="middle" fill="${primary}" font-family="Arial, sans-serif" font-size="20" font-weight="700">TEAM LOGO</text>`
    ), "TEAM LOGO");
  }

  const staff = staffLines(input);
  staff.forEach(([label, value], index) => {
    const leftColumn = index % 2 === 0;
    const row = Math.floor(index / 2);
    const x = isRectangle ? (leftColumn ? 46 : width - 46) : (leftColumn ? 90 : width - 90);
    const y = isRectangle ? designTop + 60 + row * 42 : 300 + row * 34;
    const text = `${label}: ${compactText(value)}`;
    const maxWidth = isRectangle ? 470 : 320;
    addLayer(`${label} text`, `template-${slug(label)}`, "text", (attrs) => (
      `<text ${attrs} x="${x}" y="${y}" text-anchor="${leftColumn ? "start" : "end"}" fill="#111827" font-family="Arial, sans-serif" font-size="${isRectangle ? 25 : 19}" font-weight="700"${textLength(text, maxWidth, isRectangle ? 25 : 19)}>${escapeXml(text)}</text>`
    ), text);
  });

  const players = input.players.length
    ? input.players
    : [{ index: 1, name: "Player", number: "", photo: "" }];
  const contentTop = isRectangle ? designTop + 250 : 380;
  const contentBottom = isRectangle ? height - 42 : (shape === "triangle" ? 735 : 700);
  const maxColumns = isRectangle ? 5 : 2;
  const columns = Math.min(maxColumns, Math.max(1, Math.ceil(Math.sqrt(players.length * (isRectangle ? 1.55 : 1)))));
  const rows = Math.ceil(players.length / columns);
  const horizontalPadding = isRectangle ? 70 : 150;
  const cellWidth = (width - horizontalPadding * 2) / columns;
  const cellHeight = Math.max(80, (contentBottom - contentTop) / rows);

  players.forEach((player, offset) => {
    const row = Math.floor(offset / columns);
    const column = offset % columns;
    const rowItems = Math.min(columns, players.length - row * columns);
    const rowWidth = cellWidth * rowItems;
    const rowLeft = (width - rowWidth) / 2;
    const centerX = rowLeft + cellWidth * (column + 0.5);
    const top = contentTop + row * cellHeight;
    const photoSize = Math.max(54, Math.min(isRectangle ? 125 : 145, cellWidth * 0.58, cellHeight * 0.62));
    const photoUrl = customOrderImageUrl(player.photo);
    const photo = photoUrl ? embeddedImages.get(photoUrl) : null;
    if (photo) {
      addLayer(`Player ${player.index} photo`, "template-player-photo", "image", (attrs) => (
        `<image ${attrs} class="asset player-photo" x="${centerX - photoSize / 2}" y="${top}" width="${photoSize}" height="${photoSize}" preserveAspectRatio="xMidYMid slice" href="${photo.dataUrl}"/>`
      ));
    } else {
      addLayer(`Player ${player.index} photo placeholder`, "template-player-photo", "circle", (attrs) => (
        `<circle ${attrs} cx="${centerX}" cy="${top + photoSize / 2}" r="${photoSize / 2}" fill="#e9eef5" stroke="${accent}" stroke-width="4"/>`
      ));
    }

    const name = compactText(player.name, `Player ${player.index}`);
    const number = compactText(player.number);
    const label = number ? `${name} ${number}` : name;
    const textY = Math.min(contentBottom + 26, top + photoSize + (isRectangle ? 31 : 27));
    const fontSize = isRectangle ? 24 : 20;
    addLayer(`Player ${player.index} name`, "template-player-text", "text", (attrs) => (
      `<text ${attrs} x="${centerX}" y="${textY}" text-anchor="middle" fill="#111827" font-family="Arial Black, Arial, sans-serif" font-size="${fontSize}" font-weight="900"${textLength(label, cellWidth - 12, fontSize)}>${escapeXml(label)}</text>`
    ), label);
  });

  if (input.sport) {
    const sport = compactText(input.sport).toUpperCase();
    addLayer("Sport label", "template-sport", "text", (attrs) => (
      `<text ${attrs} x="${width / 2}" y="${height - 20}" text-anchor="middle" fill="${accent}" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="0">${escapeXml(sport)}</text>`
    ), sport);
  }

  const dataInfo = escapeXml(JSON.stringify({
    name: compactText(input.bannerType, "Hem & Grommet"),
    type: shape,
    information: input.svgLayout || "Shopify custom order"
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" data-info="${dataInfo}" data-team-banner-format="shopify-custom-order-v1">${elements.join("")}</svg>`;
  const layeredSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" data-info="${dataInfo}" data-team-banner-format="illustrator-layered-svg-v1" data-layer-count="${layers.length}">${layeredElements.join("")}</svg>`;
  const imageCount = layers.filter((layer) => layer.type === "image").length;
  const textCount = layers.filter((layer) => layer.type === "text").length;

  return {
    svg,
    layeredSvg,
    shape,
    width,
    height,
    layers,
    sourceSvgStats: {
      objectCount: layers.length,
      imageCount,
      rasterImageCount: imageCount,
      vectorObjectCount: layers.length - imageCount,
      namedLayerCount: layers.length,
      textCount,
      layered: layers.length > 1,
      illustratorLayered: layers.length > 0
    }
  };
}
