import { NextRequest, NextResponse } from "next/server";
import {
  listCustomOrderBackups,
  readCustomOrderBackup,
  safeSubmissionId,
  saveCustomOrderBackup
} from "@/lib/custom-order-backup";
import { sendCustomOrderBackupEmail } from "@/lib/custom-order-backup-email";

export const maxDuration = 30;
export const runtime = "nodejs";

function searchText(manifest: Awaited<ReturnType<typeof listCustomOrderBackups>>[number]) {
  return [
    manifest.id,
    manifest.productTitle,
    manifest.productHandle,
    manifest.productId,
    manifest.variantId,
    ...manifest.fields.flatMap((field) => [field.key, field.value]),
    ...manifest.files.flatMap((file) => [file.fieldKey, file.name])
  ].join(" ").toLowerCase();
}

export async function GET(request: NextRequest) {
  try {
    const lookup = String(request.nextUrl.searchParams.get("lookup") || "").trim().toLowerCase();
    const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 50);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 100);
    const exactId = safeSubmissionId(lookup);
    if (exactId) {
      const manifest = await readCustomOrderBackup(exactId);
      return NextResponse.json({ submissions: manifest ? [manifest] : [] }, { headers: { "Cache-Control": "no-store" } });
    }
    const submissions = await listCustomOrderBackups(lookup ? 250 : limit);
    return NextResponse.json({
      submissions: (lookup ? submissions.filter((manifest) => searchText(manifest).includes(lookup)) : submissions).slice(0, limit)
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load custom-order backups." },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { submissionId?: string; action?: string; force?: boolean };
    const id = safeSubmissionId(payload.submissionId);
    if (!id || payload.action !== "send-email") {
      return NextResponse.json({ error: "A valid Submission ID and email action are required." }, { status: 400 });
    }
    const manifest = await readCustomOrderBackup(id);
    if (!manifest) return NextResponse.json({ error: "Custom-order backup not found." }, { status: 404 });
    if (manifest.notification?.status === "sent" && payload.force !== true) {
      return NextResponse.json({
        alreadySent: true,
        sentAt: manifest.notification.sentAt || "",
        to: manifest.notification.to || ""
      }, { status: 409 });
    }

    const attemptedAt = new Date().toISOString();
    const delivery = await sendCustomOrderBackupEmail(manifest, request.nextUrl.origin);
    const errorMessage = delivery.ok
      ? ""
      : String((delivery.result as { error?: unknown }).error || JSON.stringify(delivery.result || {})).slice(0, 500);
    const saved = await saveCustomOrderBackup({
      ...manifest,
      notification: {
        status: delivery.ok ? "sent" : "failed",
        attemptedAt,
        sentAt: delivery.ok ? new Date().toISOString() : undefined,
        to: delivery.to,
        resendId: String((delivery.result as { id?: unknown }).id || "").slice(0, 200) || undefined,
        error: errorMessage || undefined
      }
    });
    if (!delivery.ok) {
      return NextResponse.json({ error: "The backup is stored, but fulfillment email delivery failed.", detail: delivery.result }, { status: 502 });
    }
    return NextResponse.json({ sent: true, sentAt: saved.notification?.sentAt, to: delivery.to });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to email the custom-order backup." },
      { status: 400 }
    );
  }
}

