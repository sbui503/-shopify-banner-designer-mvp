import { list, put, type ListBlobResultBlob } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { safeDesignId } from "@/lib/admin-design-storage";

export const maxDuration = 30;
export const runtime = "nodejs";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

type UploadedBlobReference = {
  pathname?: string;
  url?: string;
};

type RecoveryPayload = {
  designId?: string;
  parentDesignId?: string;
  proof?: UploadedBlobReference;
  sourceSvg?: UploadedBlobReference | null;
  orderNumber?: string;
  productTitle?: string;
  teamName?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function expectedPath(designId: string, kind: "proof" | "source") {
  return `team-banner-designs/${designId}/${kind === "proof" ? "proof.png" : "source.svg"}`;
}

async function exactBlob(pathname: string, reference: UploadedBlobReference | null | undefined) {
  if (!pathname || reference?.pathname !== pathname) return null;
  const result = await list({ prefix: pathname, limit: 10 });
  const blob = (result.blobs || []).find((candidate) => candidate.pathname === pathname);
  if (!blob || (reference.url && reference.url !== blob.url)) return null;
  return blob;
}

async function readBlobBytes(blob: ListBlobResultBlob) {
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to verify uploaded file (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function isPng(bytes: Uint8Array) {
  return bytes.length >= PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function normalizeSvg(value: string) {
  const svg = value
    .trim()
    .replace(/^<\?xml[\s\S]*?\?>\s*/i, "")
    .replace(/^<!DOCTYPE[\s\S]*?>\s*/i, "")
    .trim();
  return /^<svg[\s>]/i.test(svg) ? svg : "";
}

function hasActiveSvgContent(svg: string) {
  return /<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)
    || /\bon[a-z]+\s*=/i.test(svg)
    || /(?:href|src)\s*=\s*["']?\s*javascript:/i.test(svg)
    || /data\s*:\s*text\/html/i.test(svg);
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

function customerDesignerUrl(input: { proofUrl: string; sourceSvgUrl: string; productTitle: string; designId: string }) {
  if (!input.sourceSvgUrl) return "";
  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const url = new URL(origin);
  url.searchParams.set("templateSvg", input.sourceSvgUrl);
  url.searchParams.set("productImage", input.proofUrl);
  url.searchParams.set("productTitle", input.productTitle || `Recovered design ${input.designId}`);
  url.searchParams.set("autoLoadProduct", "1");
  url.searchParams.set("autoLayer", "svg");
  url.searchParams.set("panel", "layers");
  url.hash = "team-banner-designer-section";
  return url.toString();
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Vercel Blob storage is not configured." }, { status: 503 });
  }

  try {
    const payload = await request.json() as RecoveryPayload;
    const designId = safeDesignId(payload.designId);
    if (!designId) {
      return NextResponse.json({ error: "A valid Design ID is required." }, { status: 400 });
    }

    const proofBlob = await exactBlob(expectedPath(designId, "proof"), payload.proof);
    if (!proofBlob) {
      return NextResponse.json({ error: "The uploaded PNG proof could not be verified." }, { status: 400 });
    }
    const proofBytes = await readBlobBytes(proofBlob);
    if (!isPng(proofBytes)) {
      return NextResponse.json({ error: "The proof file is not a valid PNG." }, { status: 415 });
    }

    const sourceBlob = payload.sourceSvg
      ? await exactBlob(expectedPath(designId, "source"), payload.sourceSvg)
      : null;
    let sourceSvg = "";
    if (payload.sourceSvg && !sourceBlob) {
      return NextResponse.json({ error: "The uploaded SVG source could not be verified." }, { status: 400 });
    }
    if (sourceBlob) {
      sourceSvg = normalizeSvg(new TextDecoder().decode(await readBlobBytes(sourceBlob)));
      if (!sourceSvg) {
        return NextResponse.json({ error: "The source file is not a valid SVG." }, { status: 415 });
      }
      if (hasActiveSvgContent(sourceSvg)) {
        return NextResponse.json({ error: "The SVG contains active content and cannot be opened in the design tool." }, { status: 415 });
      }
    }

    const savedAt = new Date().toISOString();
    const productTitle = cleanText(payload.productTitle, 240);
    const orderNumber = cleanText(payload.orderNumber, 80);
    const teamName = cleanText(payload.teamName, 240);
    const parentDesignId = safeDesignId(payload.parentDesignId);
    const stats = svgStats(sourceSvg);
    const lookupUrl = `${request.nextUrl.origin}/admin/orders?designId=${encodeURIComponent(designId)}`;
    const designerUrl = customerDesignerUrl({
      proofUrl: proofBlob.url,
      sourceSvgUrl: sourceBlob?.url || "",
      productTitle,
      designId
    });
    const recoveryMetadata = {
      version: 1,
      kind: "admin-proof-recovery",
      designId,
      parentDesignId,
      savedAt,
      orderNumber,
      productTitle,
      teamName,
      proofFileName: cleanText(payload.proof?.pathname?.split("/").pop(), 240),
      sourceSvgFileName: cleanText(payload.sourceSvg?.pathname?.split("/").pop(), 240)
    };
    const metadataBlob = await put(
      `team-banner-designs/${designId}/recovery.json`,
      JSON.stringify(recoveryMetadata, null, 2),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      }
    );
    const manifest = {
      version: 1,
      id: designId,
      savedAt,
      previewUrl: proofBlob.url,
      jsonUrl: "",
      recoveryMetadataUrl: metadataBlob.url,
      sourceSvgUrl: sourceBlob?.url || "",
      manifestUrl: "",
      lookupUrl,
      designerUrl,
      productTitle,
      teamName,
      orderNumber,
      parentDesignId,
      adminUploaded: true,
      proofOnly: !sourceBlob,
      product: {
        title: productTitle
      },
      layers: [],
      project: null,
      sourceSvgStats: stats
    };
    const manifestBlob = await put(
      `team-banner-designs/${designId}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      }
    );

    return NextResponse.json({
      ...manifest,
      manifestUrl: manifestBlob.url
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save recovered design." },
      { status: 400 }
    );
  }
}
