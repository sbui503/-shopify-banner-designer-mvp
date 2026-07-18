import { list, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

function parsePngDataUrl(value: unknown) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(value || ""));
  return match ? Buffer.from(match[1], "base64") : null;
}

function safeDesignId(value: unknown) {
  const clean = String(value || "").trim();
  return /^design_[0-9]+_[a-z0-9]+$/i.test(clean) ? clean : "";
}

function lookupUrlForRequest(request: NextRequest, id: string) {
  return `${request.nextUrl.origin}/fulfillment.html?designId=${encodeURIComponent(id)}`;
}

function normalizeSvg(value: unknown) {
  const svg = String(value || "")
    .trim()
    .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/^<!DOCTYPE[\s\S]*?>\s*/i, "")
    .trim();
  return /^<svg[\s>]/i.test(svg) ? svg : "";
}

function svgStats(svg: string) {
  const objectCount = (svg.match(/<(?:g|path|rect|circle|ellipse|polygon|polyline|line|text|image)\b/gi) || []).length;
  const imageCount = (svg.match(/<image\b/gi) || []).length;
  const textCount = (svg.match(/<text\b/gi) || []).length;
  return {
    objectCount,
    imageCount,
    textCount,
    layered: objectCount > 1 || textCount > 0
  };
}

async function readManifest(id: string) {
  const result = await list({
    prefix: `team-banner-designs/${id}/manifest`,
    limit: 1
  });
  const manifest = result.blobs?.[0];
  if (!manifest) return null;
  const manifestResponse = await fetch(manifest.url, { cache: "no-store" });
  if (!manifestResponse.ok) return null;
  const data = await manifestResponse.json();
  return { ...data, manifestUrl: data.manifestUrl || manifest.url };
}

async function readCustomerDesign(id: string) {
  const customerOrigin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const response = await fetch(`${customerOrigin}/api/designs?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(data.error || `Customer design lookup failed (${response.status}).`);
  return data;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function GET(request: NextRequest) {
  try {
    const id = safeDesignId(request.nextUrl.searchParams.get("id") || request.nextUrl.searchParams.get("designId"));
    if (!id) return NextResponse.json({ error: "Missing design id." }, { status: 400, headers: corsHeaders() });
    const localManifest = process.env.BLOB_READ_WRITE_TOKEN ? await readManifest(id) : null;
    const manifest = localManifest || await readCustomerDesign(id);
    if (!manifest) return NextResponse.json({ error: "Design manifest not found." }, { status: 404, headers: corsHeaders() });
    return NextResponse.json(manifest, { headers: corsHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Design lookup failed" }, { status: 400, headers: corsHeaders() });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const id = `design_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const png = parsePngDataUrl(payload.image);
    const sourceSvg = normalizeSvg(payload.sourceSvg);
    const stats = payload.sourceSvgStats || svgStats(sourceSvg);
    const lookupUrl = lookupUrlForRequest(request, id);
    const savedAt = new Date().toISOString();

    if (!process.env.BLOB_READ_WRITE_TOKEN || (!png && !sourceSvg)) {
      return NextResponse.json({
        id,
        previewUrl: "",
        jsonUrl: "",
        sourceSvgUrl: "",
        manifestUrl: "",
        lookupUrl,
        sourceSvgStats: stats,
        warning: "Design was accepted, but permanent storage requires Vercel Blob and BLOB_READ_WRITE_TOKEN."
      }, { headers: corsHeaders() });
    }

    const basePath = `team-banner-designs/${id}`;
    const uploads: Array<Promise<[string, Awaited<ReturnType<typeof put>>]>> = [];
    if (png) {
      uploads.push(put(`${basePath}/proof.png`, png, {
        access: "public",
        contentType: "image/png"
      }).then((blob) => ["preview", blob]));
    }
    uploads.push(put(`${basePath}/design.json`, JSON.stringify(payload.json || {}, null, 2), {
      access: "public",
      contentType: "application/json"
    }).then((blob) => ["json", blob]));
    if (sourceSvg) {
      uploads.push(put(`${basePath}/source.svg`, sourceSvg, {
        access: "public",
        contentType: "image/svg+xml; charset=utf-8"
      }).then((blob) => ["svg", blob]));
    }

    const uploaded = Object.fromEntries(await Promise.all(uploads));
    const manifest = {
      id,
      savedAt,
      previewUrl: uploaded.preview?.url || "",
      jsonUrl: uploaded.json?.url || "",
      sourceSvgUrl: uploaded.svg?.url || "",
      lookupUrl,
      sourceSvgStats: stats,
      product: payload.metadata?.product || {},
      artboard: payload.metadata?.artboard || {},
      teamName: payload.metadata?.teamName || "",
      layers: Array.isArray(payload.metadata?.layers) ? payload.metadata.layers : [],
      cartItem: payload.metadata?.cartItem || {},
      project: payload.project || null
    };

    const manifestBlob = await put(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });

    return NextResponse.json({
      id,
      previewUrl: manifest.previewUrl,
      jsonUrl: manifest.jsonUrl,
      sourceSvgUrl: manifest.sourceSvgUrl,
      manifestUrl: manifestBlob.url,
      lookupUrl,
      sourceSvgStats: stats
    }, { headers: corsHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid design payload" }, { status: 400, headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
