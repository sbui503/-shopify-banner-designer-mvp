import { list, type ListBlobResultBlob } from "@vercel/blob";

const DESIGN_PREFIX = "team-banner-designs/";
const DESIGN_ID_PATTERN = /^design_[0-9]+_[a-z0-9]+$/i;

export type StoredDesignManifest = {
  id?: string;
  savedAt?: string;
  previewUrl?: string;
  jsonUrl?: string;
  sourceSvgUrl?: string;
  manifestUrl?: string;
  lookupUrl?: string;
  designerUrl?: string;
  productTitle?: string;
  productHandle?: string;
  teamName?: string;
  orderNumber?: string;
  parentDesignId?: string;
  adminUploaded?: boolean;
  proofOnly?: boolean;
  sourceSvgStats?: {
    objectCount?: number;
    imageCount?: number;
    textCount?: number;
    layered?: boolean;
  };
  layers?: Array<Record<string, unknown>>;
  project?: Record<string, unknown> | null;
  product?: Record<string, unknown>;
  artboard?: Record<string, unknown>;
};

export function safeDesignId(value: unknown) {
  const clean = String(value || "").trim();
  return DESIGN_ID_PATTERN.test(clean) ? clean : "";
}

function isManifestBlob(blob: ListBlobResultBlob) {
  return /(?:\/manifest|\.manifest)\.json$/i.test(blob.pathname);
}

async function readManifestBlob(blob: ListBlobResultBlob): Promise<StoredDesignManifest | null> {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  const manifest = await response.json().catch(() => null);
  if (!manifest || typeof manifest !== "object") return null;
  const id = safeDesignId((manifest as StoredDesignManifest).id);
  if (!id) return null;
  return {
    ...(manifest as StoredDesignManifest),
    id,
    manifestUrl: (manifest as StoredDesignManifest).manifestUrl || blob.url
  };
}

export async function readStoredDesignManifest(id: string) {
  const designId = safeDesignId(id);
  if (!designId || !process.env.BLOB_READ_WRITE_TOKEN) return null;

  const result = await list({
    prefix: `${DESIGN_PREFIX}${designId}`,
    limit: 100
  });
  const manifestBlobs = (result.blobs || [])
    .filter(isManifestBlob)
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime());
  for (const manifestBlob of manifestBlobs) {
    const manifest = await readManifestBlob(manifestBlob).catch(() => null);
    if (manifest?.id === designId) return manifest;
  }
  return null;
}

export async function listStoredDesignManifests(limit = 100) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];

  const manifestBlobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const result = await list({
      prefix: DESIGN_PREFIX,
      limit: 1000,
      cursor
    });
    manifestBlobs.push(...(result.blobs || []).filter(isManifestBlob));
    cursor = result.hasMore ? result.cursor : undefined;
    pages += 1;
  } while (cursor && pages < 10);

  const newest = manifestBlobs
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())
    .slice(0, Math.min(Math.max(limit, 1), 250));
  const manifests = await Promise.all(newest.map((blob) => readManifestBlob(blob).catch(() => null)));
  return manifests.filter((manifest): manifest is StoredDesignManifest => Boolean(manifest?.id));
}
