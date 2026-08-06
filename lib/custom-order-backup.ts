import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";
import { list, put, type ListBlobResultBlob } from "@vercel/blob";

const BACKUP_PREFIX = "team-banner-custom-orders/";
const SUBMISSION_ID_PATTERN = /^submission_[0-9]+_[a-f0-9]{16}$/i;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FIELD_COUNT = 160;
const MAX_FIELD_KEY_LENGTH = 160;
const MAX_FIELD_VALUE_LENGTH = 50_000;

export type CustomOrderBackupField = {
  key: string;
  value: string;
};

export type CustomOrderBackupFile = {
  fieldKey: string;
  name: string;
  pathname: string;
  url: string;
  downloadUrl?: string;
  contentType?: string;
  size?: number;
};

export type CustomOrderBackupNotification = {
  status: "pending" | "sent" | "failed";
  attemptedAt?: string;
  sentAt?: string;
  to?: string;
  resendId?: string;
  error?: string;
};

export type CustomOrderBackupManifest = {
  version: 1;
  id: string;
  status: "reserved" | "ready";
  createdAt: string;
  updatedAt: string;
  origin: string;
  pageUrl: string;
  productTitle: string;
  productHandle: string;
  productId: string;
  variantId: string;
  quantity: number;
  fields: CustomOrderBackupField[];
  files: CustomOrderBackupFile[];
  notification?: CustomOrderBackupNotification;
  storageUrl?: string;
};

type EncryptedManifest = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

function requiredSecret() {
  const secret = String(
    process.env.CUSTOM_ORDER_BACKUP_SECRET
      || process.env.ADMIN_SETTINGS_SECRET
      || process.env.BLOB_READ_WRITE_TOKEN
      || ""
  ).trim();
  if (!secret) throw new Error("CUSTOM_ORDER_BACKUP_SECRET is not configured.");
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(requiredSecret()).digest();
}

function encryptManifest(manifest: CustomOrderBackupManifest): EncryptedManifest {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(manifest), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

function decryptManifest(value: unknown): CustomOrderBackupManifest | null {
  if (!value || typeof value !== "object") return null;
  const encrypted = value as Partial<EncryptedManifest>;
  if (encrypted.algorithm !== "aes-256-gcm" || !encrypted.iv || !encrypted.tag || !encrypted.ciphertext) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encrypted.iv, "base64"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
    const manifest = JSON.parse(plaintext) as CustomOrderBackupManifest;
    return safeSubmissionId(manifest.id) ? manifest : null;
  } catch {
    return null;
  }
}

export function safeSubmissionId(value: unknown) {
  const clean = String(value || "").trim();
  return SUBMISSION_ID_PATTERN.test(clean) ? clean : "";
}

export function createSubmissionId(now = Date.now()) {
  return `submission_${now}_${randomBytes(8).toString("hex")}`;
}

export function normalizeBackupFields(value: unknown): CustomOrderBackupField[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_FIELD_COUNT)
    .map((entry) => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        key: String(record.key || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_FIELD_KEY_LENGTH),
        value: String(record.value || "").replace(/\u0000/g, "").trim().slice(0, MAX_FIELD_VALUE_LENGTH)
      };
    })
    .filter((entry) => entry.key && entry.value);
}

function cleanFileName(value: unknown) {
  const clean = String(value || "upload")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return clean || "upload";
}

export function backupFilePath(id: string, index: number, fileName: unknown) {
  const submissionId = safeSubmissionId(id);
  if (!submissionId) throw new Error("Invalid custom-order Submission ID.");
  return `${BACKUP_PREFIX}${submissionId}/files/${Date.now()}-${Math.max(0, index)}-${cleanFileName(fileName)}`;
}

function isOwnedBackupUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\.blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeBackupFiles(id: string, value: unknown): CustomOrderBackupFile[] {
  const submissionId = safeSubmissionId(id);
  if (!submissionId || !Array.isArray(value)) return [];
  const expectedPrefix = `${BACKUP_PREFIX}${submissionId}/files/`;
  return value.slice(0, 80).flatMap((entry) => {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    const pathname = String(record.pathname || "").trim();
    const url = String(record.url || "").trim();
    if (!pathname.startsWith(expectedPrefix) || !isOwnedBackupUrl(url)) return [];
    const downloadUrl = String(record.downloadUrl || "").trim();
    return [{
      fieldKey: String(record.fieldKey || "Uploaded file").trim().slice(0, MAX_FIELD_KEY_LENGTH),
      name: cleanFileName(record.name),
      pathname,
      url,
      downloadUrl: isOwnedBackupUrl(downloadUrl) ? downloadUrl : undefined,
      contentType: String(record.contentType || "").trim().slice(0, 120) || undefined,
      size: Number.isFinite(Number(record.size)) ? Math.max(0, Number(record.size)) : undefined
    }];
  });
}

function tokenPayload(id: string, expiresAt: number) {
  return `${id}.${expiresAt}`;
}

export function createSubmissionSessionToken(id: string, now = Date.now()) {
  const submissionId = safeSubmissionId(id);
  if (!submissionId) throw new Error("Invalid custom-order Submission ID.");
  const expiresAt = now + SESSION_TTL_MS;
  const payload = tokenPayload(submissionId, expiresAt);
  const signature = createHmac("sha256", requiredSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySubmissionSessionToken(id: string, token: unknown, now = Date.now()) {
  const submissionId = safeSubmissionId(id);
  const parts = String(token || "").split(".");
  if (!submissionId || parts.length !== 3 || parts[0] !== submissionId) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt < now || expiresAt > now + SESSION_TTL_MS + 60_000) return false;
  const expected = createHmac("sha256", requiredSecret())
    .update(tokenPayload(submissionId, expiresAt))
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(parts[2], "base64url");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isManifestBlob(blob: ListBlobResultBlob) {
  return /\/manifests\/[0-9]+-[a-f0-9]+\.json$/i.test(blob.pathname);
}

async function readManifestBlob(blob: ListBlobResultBlob) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  const encrypted = await response.json().catch(() => null);
  const manifest = decryptManifest(encrypted);
  return manifest ? { ...manifest, storageUrl: blob.url } : null;
}

export async function saveCustomOrderBackup(manifest: CustomOrderBackupManifest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob storage is not configured.");
  const id = safeSubmissionId(manifest.id);
  if (!id) throw new Error("Invalid custom-order Submission ID.");
  const updatedAt = new Date().toISOString();
  const stored: CustomOrderBackupManifest = { ...manifest, id, updatedAt, storageUrl: undefined };
  const pathname = `${BACKUP_PREFIX}${id}/manifests/${Date.now()}-${randomBytes(4).toString("hex")}.json`;
  const blob = await put(pathname, JSON.stringify(encryptManifest(stored)), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 0
  });
  return { ...stored, storageUrl: blob.url };
}

export async function readCustomOrderBackup(id: string) {
  const submissionId = safeSubmissionId(id);
  if (!submissionId || !process.env.BLOB_READ_WRITE_TOKEN) return null;
  const result = await list({
    prefix: `${BACKUP_PREFIX}${submissionId}/manifests/`,
    limit: 100
  });
  const manifests = (result.blobs || [])
    .filter(isManifestBlob)
    .sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime());
  for (const blob of manifests) {
    const manifest = await readManifestBlob(blob).catch(() => null);
    if (manifest?.id === submissionId) return manifest;
  }
  return null;
}

export async function listCustomOrderBackups(limit = 50): Promise<CustomOrderBackupManifest[]> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  const blobs: ListBlobResultBlob[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const result = await list({ prefix: BACKUP_PREFIX, limit: 1000, cursor });
    blobs.push(...(result.blobs || []).filter(isManifestBlob));
    cursor = result.hasMore ? result.cursor : undefined;
    pages += 1;
  } while (cursor && pages < 10);

  const newestById = new Map<string, ListBlobResultBlob>();
  for (const blob of blobs.sort((left, right) => right.uploadedAt.getTime() - left.uploadedAt.getTime())) {
    const id = safeSubmissionId(blob.pathname.split("/")[1]);
    if (id && !newestById.has(id)) newestById.set(id, blob);
  }
  const selected = [...newestById.values()].slice(0, Math.min(Math.max(limit, 1), 250));
  const manifests = await Promise.all(selected.map((blob) => readManifestBlob(blob).catch(() => null)));
  return manifests.filter(Boolean) as CustomOrderBackupManifest[];
}
