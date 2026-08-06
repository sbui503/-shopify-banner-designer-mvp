import { NextRequest, NextResponse } from "next/server";
import {
  createSubmissionId,
  createSubmissionSessionToken,
  normalizeBackupFields,
  normalizeBackupFiles,
  readCustomOrderBackup,
  safeSubmissionId,
  saveCustomOrderBackup,
  verifySubmissionSessionToken,
  type CustomOrderBackupManifest
} from "@/lib/custom-order-backup";
import { sendCustomOrderBackupEmail } from "@/lib/custom-order-backup-email";

export const maxDuration = 30;
export const runtime = "nodejs";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://teamsportbanners.com",
  "https://www.teamsportbanners.com",
  "https://teamsportbanners.vercel.app"
];

function allowedOrigins() {
  const configured = String(process.env.CUSTOM_ORDER_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function requestOrigin(request: NextRequest) {
  return String(request.headers.get("origin") || "").trim().replace(/\/+$/, "");
}

function isAllowedOrigin(request: NextRequest) {
  const origin = requestOrigin(request);
  if (process.env.NODE_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$/i.test(origin)) return true;
  return Boolean(origin && allowedOrigins().has(origin));
}

function corsHeaders(request: NextRequest) {
  const origin = requestOrigin(request);
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(request) ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store"
  };
}

function json(request: NextRequest, body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

function cleanText(value: unknown, maxLength = 500) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safePageUrl(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !/(?:^|\.)teamsportbanners\.com$/i.test(url.hostname)) return "";
    return url.toString().slice(0, 2_000);
  } catch {
    return "";
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: isAllowedOrigin(request) ? 204 : 403, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) return json(request, { error: "This storefront is not allowed to create custom-order backups." }, 403);
  try {
    const payload = await request.json() as Record<string, unknown>;
    const action = cleanText(payload.action, 30);

    if (action === "reserve") {
      const fields = normalizeBackupFields(payload.fields);
      const pageUrl = safePageUrl(payload.pageUrl);
      const productTitle = cleanText(payload.productTitle, 300);
      if (!pageUrl || !productTitle || fields.length === 0) {
        return json(request, { error: "Product page, product title, and custom order fields are required." }, 400);
      }
      const id = createSubmissionId();
      const now = new Date().toISOString();
      const manifest: CustomOrderBackupManifest = {
        version: 1,
        id,
        status: "reserved",
        createdAt: now,
        updatedAt: now,
        origin: requestOrigin(request),
        pageUrl,
        productTitle,
        productHandle: cleanText(payload.productHandle, 300),
        productId: cleanText(payload.productId, 100),
        variantId: cleanText(payload.variantId, 100),
        quantity: Math.max(1, Math.min(100, Number(payload.quantity) || 1)),
        fields,
        files: [],
        notification: { status: "pending" }
      };
      const stored = await saveCustomOrderBackup(manifest);
      return json(request, {
        submissionId: id,
        submissionToken: createSubmissionSessionToken(id),
        storedAt: stored.updatedAt
      });
    }

    if (action === "finalize") {
      const id = safeSubmissionId(payload.submissionId);
      if (!id || !verifySubmissionSessionToken(id, payload.submissionToken)) {
        return json(request, { error: "The custom-order backup session is invalid or expired." }, 401);
      }
      const existing = await readCustomOrderBackup(id);
      if (!existing) return json(request, { error: "The reserved custom-order backup was not found." }, 404);
      if (existing.status === "ready" && existing.notification?.status === "sent") {
        return json(request, {
          submissionId: id,
          status: existing.status,
          emailSent: true,
          emailTo: existing.notification.to || ""
        });
      }

      const fields = normalizeBackupFields(payload.fields);
      const files = normalizeBackupFiles(id, payload.files);
      const ready = await saveCustomOrderBackup({
        ...existing,
        status: "ready",
        fields: fields.length ? fields : existing.fields,
        files: files.length ? files : existing.files,
        notification: {
          status: "pending",
          attemptedAt: new Date().toISOString()
        }
      });

      const delivery = await sendCustomOrderBackupEmail(ready, request.nextUrl.origin).catch((error) => ({
        ok: false,
        to: String(process.env.PROOF_EMAIL_TO || "info@tsbanners.com"),
        result: { error: error instanceof Error ? error.message : "Email delivery failed." }
      }));
      const sentAt = delivery.ok ? new Date().toISOString() : undefined;
      const deliveryError = delivery.ok ? "" : cleanText(
        (delivery.result as { error?: unknown }).error || JSON.stringify(delivery.result || {}),
        500
      );
      const completed = await saveCustomOrderBackup({
        ...ready,
        notification: {
          status: delivery.ok ? "sent" : "failed",
          attemptedAt: ready.notification?.attemptedAt,
          sentAt,
          to: delivery.to,
          resendId: cleanText((delivery.result as { id?: unknown }).id, 200) || undefined,
          error: deliveryError || undefined
        }
      });
      return json(request, {
        submissionId: id,
        status: completed.status,
        emailSent: delivery.ok,
        emailTo: delivery.to,
        warning: delivery.ok ? "" : "The order backup is safe, but the fulfillment email could not be delivered. Admin can retry it."
      });
    }

    return json(request, { error: "Unsupported custom-order backup action." }, 400);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Unable to save the custom-order backup." }, 400);
  }
}

