import { randomBytes } from "node:crypto";
import { list, put, type ListBlobResultBlob } from "@vercel/blob";
import {
  normalizeAdminTemplateDraft,
  validateAdminTemplateSvg,
  type UploadedAdminTemplate
} from "@/lib/admin-template";

const ASSET_PREFIX = "team-banner-admin-templates/assets/";
const MANIFEST_PREFIX = "team-banner-admin-templates/manifests/";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "template";
}

function isTemplateManifest(blob: ListBlobResultBlob) {
  return blob.pathname.startsWith(MANIFEST_PREFIX) && blob.pathname.endsWith(".json");
}

function isUploadedAdminTemplate(value: unknown): value is UploadedAdminTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<UploadedAdminTemplate>;
  return /^template_[0-9]+_[a-f0-9]+$/i.test(String(template.id || ""))
    && Boolean(template.title && template.sourceUrl && template.uploadedAt)
    && template.editable === true;
}

async function readTemplateManifest(blob: ListBlobResultBlob) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  const value = await response.json().catch(() => null);
  return isUploadedAdminTemplate(value) ? { ...value, manifestUrl: blob.url } : null;
}

export async function saveAdminTemplate(input: {
  fields: Record<string, unknown>;
  svg: string;
  originalName: string;
  sourceType: "file" | "owned-url";
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob storage is not configured.");
  const draft = normalizeAdminTemplateDraft(input.fields);
  const stats = validateAdminTemplateSvg(input.svg);
  const id = `template_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const uploadedAt = new Date().toISOString();
  const sourceBlob = await put(`${ASSET_PREFIX}${id}-${slug(draft.title)}.svg`, input.svg, {
    access: "public",
    contentType: "image/svg+xml",
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000
  });
  const template: UploadedAdminTemplate = {
    ...draft,
    id,
    sourceUrl: sourceBlob.url,
    status: "active",
    editable: true,
    uploadedAt,
    originalName: String(input.originalName || "template.svg").slice(0, 180),
    sourceType: input.sourceType,
    stats
  };
  const manifest = await put(`${MANIFEST_PREFIX}${id}.json`, JSON.stringify(template, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0
  });
  return { ...template, manifestUrl: manifest.url };
}

export async function listAdminTemplates(limit = 250): Promise<UploadedAdminTemplate[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  try {
    const result = await list({ prefix: MANIFEST_PREFIX, limit: 1000 });
    const manifests = (result.blobs || [])
      .filter(isTemplateManifest)
      .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())
      .slice(0, Math.min(Math.max(limit, 1), 250));
    const templates = await Promise.all(manifests.map((blob) => readTemplateManifest(blob).catch(() => null)));
    return templates.filter(Boolean) as UploadedAdminTemplate[];
  } catch {
    return [];
  }
}
