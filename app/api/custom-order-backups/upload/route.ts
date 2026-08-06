import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeBackupFiles,
  readCustomOrderBackup,
  safeSubmissionId,
  saveCustomOrderBackup,
  verifySubmissionSessionToken
} from "@/lib/custom-order-backup";

export const maxDuration = 30;
export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://teamsportbanners.com",
  "https://www.teamsportbanners.com",
  "https://teamsportbanners.vercel.app"
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

type UploadClientPayload = {
  submissionId?: string;
  submissionToken?: string;
  fieldKey?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
};

function origin(request: NextRequest) {
  return String(request.headers.get("origin") || "").trim().replace(/\/+$/, "");
}

function isAllowedOrigin(request: NextRequest) {
  const requestOrigin = origin(request);
  const configured = String(process.env.CUSTOM_ORDER_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$/i.test(requestOrigin)) return true;
  return ALLOWED_ORIGINS.has(requestOrigin) || configured.includes(requestOrigin);
}

function corsHeaders(request: NextRequest) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(request) ? origin(request) : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store"
  };
}

function parseClientPayload(value: string | null): UploadClientPayload {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: isAllowedOrigin(request) ? 204 : 403, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as HandleUploadBody;
    if (body.type === "blob.generate-client-token" && !isAllowedOrigin(request)) {
      return NextResponse.json({ error: "This storefront is not allowed to upload custom-order files." }, { status: 403, headers: corsHeaders(request) });
    }
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        const id = safeSubmissionId(payload.submissionId);
        if (!id || !verifySubmissionSessionToken(id, payload.submissionToken)) {
          throw new Error("The custom-order upload session is invalid or expired.");
        }
        if (!pathname.startsWith(`team-banner-custom-orders/${id}/files/`)) {
          throw new Error("The custom-order file path does not match its Submission ID.");
        }
        const existing = await readCustomOrderBackup(id);
        if (!existing) throw new Error("The custom-order backup reservation was not found.");
        return {
          allowedContentTypes: ["image/*", "application/pdf", "application/postscript"],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({
            submissionId: id,
            fieldKey: String(payload.fieldKey || "Uploaded file").slice(0, 160),
            fileName: String(payload.fileName || "upload").slice(0, 160),
            contentType: String(payload.contentType || "").slice(0, 120),
            size: Math.max(0, Number(payload.size) || 0)
          })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseClientPayload(tokenPayload || null);
        const id = safeSubmissionId(payload.submissionId);
        if (!id) return;
        const existing = await readCustomOrderBackup(id);
        if (!existing) return;
        const uploaded = normalizeBackupFiles(id, [{
          fieldKey: payload.fieldKey,
          name: payload.fileName,
          pathname: blob.pathname,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          contentType: payload.contentType || blob.contentType,
          size: payload.size
        }]);
        if (!uploaded.length || existing.files.some((file) => file.pathname === uploaded[0].pathname)) return;
        await saveCustomOrderBackup({ ...existing, files: [...existing.files, uploaded[0]] });
      }
    });
    return NextResponse.json(result, { headers: corsHeaders(request) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to authorize the custom-order upload." },
      { status: 400, headers: corsHeaders(request) }
    );
  }
}

