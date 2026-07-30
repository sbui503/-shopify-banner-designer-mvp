import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { safeDesignId } from "@/lib/admin-design-storage";

export const runtime = "nodejs";

const MAX_PROOF_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_SVG_BYTES = 15 * 1024 * 1024;

type UploadPayload = {
  designId?: string;
  kind?: "proof" | "source";
};

function expectedPath(designId: string, kind: UploadPayload["kind"]) {
  if (kind === "proof") return `team-banner-designs/${designId}/proof.png`;
  if (kind === "source") return `team-banner-designs/${designId}/source.svg`;
  return "";
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Vercel Blob storage is not configured." }, { status: 503 });
  }

  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload || "{}") as UploadPayload;
        const designId = safeDesignId(payload.designId);
        const expected = expectedPath(designId, payload.kind);
        if (!designId || !expected || pathname !== expected) {
          throw new Error("Invalid design upload path.");
        }

        return {
          allowedContentTypes: payload.kind === "proof" ? ["image/png"] : ["image/svg+xml"],
          maximumSizeInBytes: payload.kind === "proof" ? MAX_PROOF_BYTES : MAX_SOURCE_SVG_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 0,
          tokenPayload: JSON.stringify({ designId, kind: payload.kind })
        };
      }
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to authorize design upload." },
      { status: 400 }
    );
  }
}
