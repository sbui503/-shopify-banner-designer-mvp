import { NextRequest, NextResponse } from "next/server";
import { readStoredDesignManifest, safeDesignId } from "@/lib/admin-design-storage";

export const maxDuration = 30;
export const runtime = "nodejs";

function isSvg(value: string) {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<svg[\s>]/i.test(value);
}

async function storedSvgResponse(designId: string) {
  const manifest = await readStoredDesignManifest(designId).catch(() => null);
  if (!manifest?.sourceSvgUrl) return null;
  return fetch(manifest.sourceSvgUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });
}

async function customerSvgResponse(designId: string) {
  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  return fetch(`${origin}/api/design-svg?id=${encodeURIComponent(designId)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000)
  });
}

export async function GET(request: NextRequest) {
  const designId = safeDesignId(request.nextUrl.searchParams.get("id"));
  if (!designId) return NextResponse.json({ error: "Missing design id." }, { status: 400 });

  try {
    let sourceResponse = await storedSvgResponse(designId);
    if (!sourceResponse?.ok) sourceResponse = await customerSvgResponse(designId);
    if (!sourceResponse.ok) {
      return NextResponse.json({ error: "Layered SVG not found." }, { status: sourceResponse.status === 404 ? 404 : 502 });
    }

    const svg = await sourceResponse.text();
    if (!isSvg(svg)) return NextResponse.json({ error: "Stored source is not a valid SVG." }, { status: 415 });

    const download = /^(?:1|true)$/i.test(request.nextUrl.searchParams.get("download") || "");
    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${designId}.svg"`,
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:",
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Layered SVG delivery failed."
    }, { status: 502 });
  }
}
