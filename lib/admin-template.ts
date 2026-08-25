import type { AdminTemplate } from "@/lib/admin-data";

export const ADMIN_TEMPLATE_MAX_BYTES = 4 * 1024 * 1024;
export const ADMIN_TEMPLATE_SPORTS = [
  "Baseball",
  "Basketball",
  "Football",
  "Soccer",
  "Softball",
  "Track & Field",
  "Volleyball",
  "General"
] as const;
export const ADMIN_TEMPLATE_BANNER_TYPES = [
  "Hem & Grommet",
  "Pole Pocket",
  "Triangle",
  "Home Plate"
] as const;

export type AdminTemplateStats = {
  objectCount: number;
  layerCount: number;
  imageCount: number;
  textCount: number;
  vectorObjectCount: number;
};

export type UploadedAdminTemplate = AdminTemplate & {
  id: string;
  uploadedAt: string;
  originalName: string;
  sourceType: "file" | "owned-url";
  stats: AdminTemplateStats;
  manifestUrl?: string;
};

export type AdminTemplateDraft = {
  title: string;
  sport: string;
  bannerType: string;
  playerCount: number;
  photoFrame: boolean;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function allowedValue(value: unknown, values: readonly string[], label: string) {
  const clean = cleanText(value, 80);
  const match = values.find((item) => item.toLowerCase() === clean.toLowerCase());
  if (!match) throw new Error(`Choose a valid ${label}.`);
  return match;
}

export function normalizeAdminTemplateDraft(input: Record<string, unknown>): AdminTemplateDraft {
  const title = cleanText(input.title, 120);
  if (title.length < 3) throw new Error("Template title must contain at least 3 characters.");

  const rawPlayerCount = Number(input.playerCount || 0);
  if (!Number.isFinite(rawPlayerCount) || rawPlayerCount < 0 || rawPlayerCount > 100) {
    throw new Error("Player count must be between 0 and 100.");
  }

  return {
    title,
    sport: allowedValue(input.sport, ADMIN_TEMPLATE_SPORTS, "sport"),
    bannerType: allowedValue(input.bannerType, ADMIN_TEMPLATE_BANNER_TYPES, "banner type"),
    playerCount: Math.trunc(rawPlayerCount),
    photoFrame: input.photoFrame === true || String(input.photoFrame || "").toLowerCase() === "true"
  };
}

export function validateAdminTemplateSvg(source: string): AdminTemplateStats {
  const svg = String(source || "").replace(/^\uFEFF/, "").trim();
  const byteLength = new TextEncoder().encode(svg).byteLength;
  if (!svg || byteLength > ADMIN_TEMPLATE_MAX_BYTES) {
    throw new Error("SVG template must be 4 MB or smaller.");
  }
  if (!/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg\b/i.test(svg)) {
    throw new Error("The selected file is not a valid SVG document.");
  }
  if (!/\bviewBox\s*=|(?:\bwidth\s*=.*\bheight\s*=)|(?:\bheight\s*=.*\bwidth\s*=)/i.test(svg.match(/<svg\b[^>]*>/i)?.[0] || "")) {
    throw new Error("SVG template must define a viewBox or width and height.");
  }
  if (/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE\b|<!ENTITY\b|(?:^|\s)on[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i.test(svg)) {
    throw new Error("SVG template contains unsafe executable markup.");
  }

  const imageCount = (svg.match(/<image\b/gi) || []).length;
  const textCount = (svg.match(/<text\b/gi) || []).length;
  const vectorObjectCount = (svg.match(/<(?:path|rect|circle|ellipse|polygon|polyline|line|use)\b/gi) || []).length;
  const groupCount = (svg.match(/<g\b/gi) || []).length;
  const objectCount = imageCount + textCount + vectorObjectCount + groupCount;
  const layerCount = (svg.match(/<g\b[^>]*(?:inkscape:groupmode\s*=\s*["']layer["']|data-layer(?:-id)?\s*=|id\s*=\s*["'][^"']*layer[^"']*["'])/gi) || []).length;

  if (objectCount < 2) {
    throw new Error("SVG template must contain at least two editable objects.");
  }
  if (imageCount > 0 && textCount === 0 && vectorObjectCount === 0) {
    throw new Error("SVG template is a flattened image. Upload a layered SVG with editable text or vector objects.");
  }

  return { objectCount, layerCount, imageCount, textCount, vectorObjectCount };
}

export function isAllowedAdminTemplateSourceUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    const ownedHost = url.hostname.endsWith(".public.blob.vercel-storage.com")
      || url.hostname === "teamsportbanners.vercel.app"
      || url.hostname === "admin-teamsportbanners.vercel.app";
    return url.protocol === "https:" && ownedHost && /\.svg$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function productShape(bannerType: string) {
  if (bannerType === "Pole Pocket") return "polepocket";
  if (bannerType === "Triangle") return "triangle";
  if (bannerType === "Home Plate") return "homeplatepennant";
  return "rectangle";
}

export function buildAdminTemplateDesignerUrl(
  template: Pick<AdminTemplate, "title" | "sport" | "bannerType" | "playerCount" | "sourceUrl">,
  origin = "https://teamsportbanners.vercel.app"
) {
  const url = new URL(origin);
  url.searchParams.set("templateSvg", template.sourceUrl);
  url.searchParams.set("productTitle", template.title);
  url.searchParams.set("productShape", productShape(template.bannerType));
  url.searchParams.set("productTags", `${template.sport},${template.bannerType},${template.playerCount || 0}-player`);
  url.searchParams.set("autoLoadProduct", "1");
  url.searchParams.set("autoLayer", "svg");
  url.searchParams.set("panel", "layers");
  url.hash = "team-banner-designer-section";
  return url.toString();
}

export function mergeAdminTemplates(base: AdminTemplate[], uploaded: UploadedAdminTemplate[]) {
  const uploadedSources = new Set(uploaded.map((template) => template.sourceUrl));
  return [
    ...uploaded,
    ...base.filter((template) => !uploadedSources.has(template.sourceUrl))
  ];
}
