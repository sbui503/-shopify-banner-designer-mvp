import { createHmac, timingSafeEqual } from "node:crypto";

const DESIGN_ID_PATTERN = /^design_[0-9]+_[a-z0-9]+$/i;
const SESSION_TTL_MS = 60 * 60 * 1000;

function uploadSecret() {
  return String(process.env.DESIGN_UPLOAD_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

function signature(id, expiresAt) {
  const secret = uploadSecret();
  if (!secret) throw new Error("Design upload storage is not configured.");
  return createHmac("sha256", secret).update(`${id}.${expiresAt}`).digest("base64url");
}

export function safeDesignId(value) {
  const clean = String(value || "").trim();
  return DESIGN_ID_PATTERN.test(clean) ? clean : "";
}

export function createDesignId(now = Date.now(), random = Math.random()) {
  return `design_${now}_${random.toString(36).slice(2, 10).padEnd(8, "0")}`;
}

export function createDesignUploadToken(id, now = Date.now()) {
  const designId = safeDesignId(id);
  if (!designId) throw new Error("A valid Design ID is required.");
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${signature(designId, expiresAt)}`;
}

export function verifyDesignUploadToken(id, token, now = Date.now()) {
  const designId = safeDesignId(id);
  const [rawExpiresAt, suppliedSignature] = String(token || "").split(".");
  const expiresAt = Number(rawExpiresAt);
  if (!designId || !Number.isFinite(expiresAt) || expiresAt < now || expiresAt > now + SESSION_TTL_MS + 60_000) {
    return false;
  }

  let expectedSignature;
  try {
    expectedSignature = signature(designId, expiresAt);
  } catch (error) {
    return false;
  }
  const expected = Buffer.from(expectedSignature, "utf8");
  const supplied = Buffer.from(String(suppliedSignature || ""), "utf8");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function designArtifact(id, kind) {
  const designId = safeDesignId(id);
  const artifact = {
    proof: { extension: "png", contentType: "image/png", maximumSizeInBytes: 5 * 1024 * 1024 },
    editable: { extension: "json", contentType: "application/json", maximumSizeInBytes: 32 * 1024 * 1024 },
    source: { extension: "svg", contentType: "image/svg+xml", maximumSizeInBytes: 32 * 1024 * 1024 }
  }[String(kind || "")];
  if (!designId || !artifact) return null;
  return {
    ...artifact,
    kind: String(kind),
    pathname: `team-banner-designs/${designId}.${artifact.extension}`
  };
}
