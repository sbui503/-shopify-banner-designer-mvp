import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_TEMPLATE_MAX_BYTES,
  isAllowedAdminTemplateSourceUrl
} from "@/lib/admin-template";
import { listAdminTemplates, saveAdminTemplate } from "@/lib/admin-template-storage";

export const runtime = "nodejs";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

async function svgFromOwnedUrl(sourceUrl: string) {
  if (!isAllowedAdminTemplateSourceUrl(sourceUrl)) {
    throw new Error("Use an owned Vercel Blob or Team Sport Banners SVG URL.");
  }
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("The SVG URL could not be downloaded.");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > ADMIN_TEMPLATE_MAX_BYTES) throw new Error("SVG template must be 4 MB or smaller.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > ADMIN_TEMPLATE_MAX_BYTES) throw new Error("SVG template must be 4 MB or smaller.");
  return new TextDecoder().decode(bytes);
}

export async function GET() {
  const templates = await listAdminTemplates();
  return NextResponse.json({ templates }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Vercel Blob storage is not configured." }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const fileEntry = form.get("file");
    const file = fileEntry && typeof fileEntry !== "string" ? fileEntry : null;
    const sourceUrl = field(form, "sourceUrl").trim();
    if ((file && sourceUrl) || (!file && !sourceUrl)) {
      throw new Error("Choose one SVG file or enter one owned SVG URL.");
    }

    let svg: string;
    let originalName: string;
    let sourceType: "file" | "owned-url";
    if (file) {
      if (file.size > ADMIN_TEMPLATE_MAX_BYTES) throw new Error("SVG template must be 4 MB or smaller.");
      if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
        throw new Error("Only SVG template files are accepted.");
      }
      svg = await file.text();
      originalName = file.name || "template.svg";
      sourceType = "file";
    } else {
      svg = await svgFromOwnedUrl(sourceUrl);
      originalName = new URL(sourceUrl).pathname.split("/").pop() || "template.svg";
      sourceType = "owned-url";
    }

    const template = await saveAdminTemplate({
      fields: {
        title: field(form, "title"),
        sport: field(form, "sport"),
        bannerType: field(form, "bannerType"),
        playerCount: field(form, "playerCount"),
        photoFrame: field(form, "photoFrame")
      },
      svg,
      originalName,
      sourceType
    });
    return NextResponse.json({ template }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload template." },
      { status: 400 }
    );
  }
}
