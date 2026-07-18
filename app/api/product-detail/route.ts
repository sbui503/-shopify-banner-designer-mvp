import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type ProductRecord = Record<string, unknown>;

type ProductCache = {
  byHandle: Map<string, ProductRecord>;
  byImage: Map<string, ProductRecord>;
  byTitle: Map<string, ProductRecord>;
};

let cachedProducts: Promise<ProductCache> | null = null;

export async function GET(request: NextRequest) {
  try {
    const cache = await productCache();
    const handle = normalizeKey(request.nextUrl.searchParams.get("handle"));
    const image = imageFileKey(request.nextUrl.searchParams.get("image"));
    const title = titleSlug(request.nextUrl.searchParams.get("title"));
    const product = cache.byHandle.get(handle) || cache.byImage.get(image) || cache.byTitle.get(title);

    if (!product) {
      return NextResponse.json({ error: "Product detail not found." }, { status: 404, headers: cacheHeaders() });
    }

    return NextResponse.json(product, { headers: cacheHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load product detail." },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

async function productCache() {
  if (!cachedProducts) {
    cachedProducts = loadProductCache();
  }
  return cachedProducts;
}

async function loadProductCache(): Promise<ProductCache> {
  const file = path.join(process.cwd(), "public", "team-banner-products.json");
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  const products: ProductRecord[] = Array.isArray(parsed.products) ? parsed.products : [];
  const byHandle = new Map<string, ProductRecord>();
  const byImage = new Map<string, ProductRecord>();
  const byTitle = new Map<string, ProductRecord>();

  products.forEach((product) => {
    const handle = normalizeKey(product.handle);
    const title = titleSlug(product.title);
    const image = imageFileKey(product.image);
    if (handle && !byHandle.has(handle)) byHandle.set(handle, product);
    if (title && !byTitle.has(title)) byTitle.set(title, product);
    if (image && !byImage.has(image)) byImage.set(image, product);
  });

  return { byHandle, byImage, byTitle };
}

function normalizeKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function titleSlug(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function imageFileKey(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://teamsportbanners.com");
    return decodeURIComponent((url.pathname.split("/").pop() || "").replace(/\?.*$/, "")).toLowerCase();
  } catch {
    return decodeURIComponent((raw.split("?")[0].split("/").pop() || "")).toLowerCase();
  }
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
  };
}
