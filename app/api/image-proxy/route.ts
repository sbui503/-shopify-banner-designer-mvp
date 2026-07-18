import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const ALLOWED_HOSTS = new Set([
  "cdn.shopify.com",
  "files-mentioned-by-the-user-shopify.vercel.app",
  "teamsportbanners.vercel.app",
  "lct-designs.s3.us-west-1.amazonaws.com",
  "teamsportbanners.com"
]);

function parseTargetUrl(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url") || "";
  const target = new URL(raw);
  if (target.protocol !== "https:") {
    throw new Error("Only HTTPS images are supported.");
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error("Image host is not allowed.");
  }
  if (target.hostname === "lct-designs.s3.us-west-1.amazonaws.com" && /^\/assets\/libs\//i.test(target.pathname)) {
    throw new Error("External design-library assets are disabled. Use local public/assets backups.");
  }
  if (target.hostname === "lct-designs.s3.us-west-1.amazonaws.com" && /\.svg$/i.test(target.pathname)) {
    throw new Error("External SVG source files are disabled. Use local /svg-layer-templates backups.");
  }
  return target;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  let target: URL;
  try {
    target = parseTargetUrl(request);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid image URL" }, { status: 400, headers: corsHeaders() });
  }

  try {
    const upstream = await fetch(target.href, {
      redirect: "follow",
      headers: {
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Could not load image" }, { status: upstream.status, headers: corsHeaders() });
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    if (!/^image\//i.test(contentType)) {
      return NextResponse.json({ error: "URL did not return an image" }, { status: 415, headers: corsHeaders() });
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image proxy failed" }, { status: 502, headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
