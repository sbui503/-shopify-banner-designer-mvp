import { copy, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { readStoredDesignManifest, safeDesignId } from "@/lib/admin-design-storage";
import {
  customOrderImageUrl,
  customOrderDesignId,
  generateCustomOrderDesign,
  readOrderImageWithinLimit,
  type EmbeddedOrderImage
} from "@/lib/custom-order-design";
import { buildLayerVerificationUrl } from "@/lib/design-verification-url";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";
import {
  customOrderDesignInput,
  normalizeShopifyAttributes,
  type ShopifyCustomAttribute
} from "@/lib/shopify-custom-order";

export const maxDuration = 60;
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2026-07";
const MAX_CUSTOM_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type ShopifyLineItem = {
  id: string;
  name: string;
  quantity: number;
  sku?: string;
  variantTitle?: string;
  customAttributes?: ShopifyCustomAttribute[];
  product?: {
    handle?: string;
    title?: string;
  } | null;
};

type ShopifyOrder = {
  id: string;
  name: string;
  createdAt?: string;
  customAttributes?: ShopifyCustomAttribute[];
  lineItems?: {
    edges?: Array<{ node: ShopifyLineItem }>;
  };
};

function isAllowedImageHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "cdn.shopify.com"
    || host === "teamsportbanners.com"
    || host === "www.teamsportbanners.com"
    || host.endsWith(".myshopify.com")
    || host.endsWith(".public.blob.vercel-storage.com");
}

function validatedImageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !isAllowedImageHost(url.hostname)) {
    throw new Error(`Uploaded image host is not allowed: ${url.hostname || "unknown"}.`);
  }
  return url;
}

function inferredImageType(url: URL) {
  const extension = url.pathname.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)?.[1] || "";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "";
}

async function fetchImageResponse(initialUrl: URL) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "manual",
      headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status < 300 || response.status >= 400) return { response, url };
    const location = response.headers.get("location");
    if (!location || redirect === MAX_REDIRECTS) throw new Error("Uploaded image redirected too many times.");
    url = validatedImageUrl(new URL(location, url).toString());
  }
  throw new Error("Uploaded image could not be loaded.");
}

async function embedOrderImages(urls: string[]) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const images = new Map<string, EmbeddedOrderImage>();
  const warnings: string[] = [];
  let totalBytes = 0;

  for (const sourceUrl of uniqueUrls) {
    try {
      const initialUrl = validatedImageUrl(sourceUrl);
      const { response, url } = await fetchImageResponse(initialUrl);
      if (!response.ok) throw new Error(`Uploaded image returned ${response.status}.`);
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_CUSTOM_UPLOAD_BYTES || totalBytes + contentLength > MAX_CUSTOM_UPLOAD_BYTES) {
        throw new Error("Customer uploads exceed the 8 MB design limit.");
      }
      const bytes = await readOrderImageWithinLimit(response, MAX_CUSTOM_UPLOAD_BYTES - totalBytes);
      if (!bytes.length) throw new Error("Uploaded image is empty.");
      if (totalBytes + bytes.length > MAX_CUSTOM_UPLOAD_BYTES) {
        throw new Error("Customer uploads exceed the 8 MB design limit.");
      }
      const headerType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      const contentType = ALLOWED_IMAGE_TYPES.has(headerType) ? headerType : inferredImageType(url);
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error("Uploaded file is not a supported PNG, JPG, WebP, or GIF image.");
      totalBytes += bytes.length;
      images.set(sourceUrl, {
        sourceUrl,
        dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
        bytes: bytes.length,
        contentType
      });
    } catch (error) {
      warnings.push(`${sourceUrl}: ${error instanceof Error ? error.message : "Image could not be embedded."}`);
    }
  }

  return { images, warnings, totalBytes };
}

function downloadUrl(blob: { url?: string; downloadUrl?: string } | null | undefined) {
  return blob?.downloadUrl || blob?.url || "";
}

async function fetchShopifyOrder(orderId: string) {
  const credential = await getShopifyAdminCredential();
  if (!credential?.token) throw new Error("Shopify is not connected.");

  const response = await fetch(`https://${credential.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": credential.token
    },
    body: JSON.stringify({
      query: `query TSBannerCustomOrderDesign($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          customAttributes { key value }
          lineItems(first: 50) {
            edges {
              node {
                id
                name
                quantity
                sku
                variantTitle
                customAttributes { key value }
                product { handle title }
              }
            }
          }
        }
      }`,
      variables: { id: orderId }
    })
  });
  const result = await response.json().catch(() => ({}));
  const order = result.data?.order as ShopifyOrder | null;
  if (!response.ok || result.errors || !order) {
    const detail = Array.isArray(result.errors)
      ? result.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
      : "";
    throw new Error(detail || "The Shopify order could not be loaded.");
  }
  return order;
}

export async function POST(request: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Vercel Blob storage is not configured." }, { status: 503 });
  }

  try {
    const payload = await request.json() as { orderId?: string; lineItemId?: string };
    const orderId = String(payload.orderId || "").trim();
    const lineItemId = String(payload.lineItemId || "").trim();
    if (!/^gid:\/\/shopify\/Order\/[0-9]+$/.test(orderId) || !/^gid:\/\/shopify\/LineItem\/[0-9]+$/.test(lineItemId)) {
      return NextResponse.json({ error: "A valid Shopify order and line item are required." }, { status: 400 });
    }

    const order = await fetchShopifyOrder(orderId);
    const lineItem = (order.lineItems?.edges || []).map((edge) => edge.node).find((item) => item.id === lineItemId);
    if (!lineItem) return NextResponse.json({ error: "Shopify line item was not found." }, { status: 404 });
    const designId = customOrderDesignId(order, lineItem.id);
    const existing = await readStoredDesignManifest(designId);
    if (
      existing?.generatedFrom === "shopify-custom-order"
      && existing.shopifyOrderId === order.id
      && existing.shopifyLineItemId === lineItem.id
      && safeDesignId(existing.id)
      && existing.sourceSvgUrl
    ) {
      return NextResponse.json({ ...existing, reused: true }, {
        headers: { "Cache-Control": "private, no-store, max-age=0" }
      });
    }

    const attributes = normalizeShopifyAttributes([
      ...(lineItem.customAttributes || []),
      ...(order.customAttributes || [])
    ]);
    const form = customOrderDesignInput(attributes);
    if (!form.teamName && !form.teamLogo && !form.expectedPlayers && !form.bannerType && !form.sport) {
      return NextResponse.json({ error: "This line item does not contain enough custom-order information to generate a design." }, { status: 422 });
    }

    const uploadUrls = [
      customOrderImageUrl(form.teamLogo),
      ...form.players.map((player) => customOrderImageUrl(player.photo))
    ].filter(Boolean);
    const embedded = await embedOrderImages(uploadUrls);
    const generated = generateCustomOrderDesign(form, embedded.images);
    const savedAt = new Date().toISOString();
    const productTitle = lineItem.name || lineItem.product?.title || "Shopify custom banner";
    const productHandle = lineItem.product?.handle || "";
    const basePath = `team-banner-designs/${designId}`;
    const backupPath = `team-banner-design-backups/${designId}`;
    const editableProject = {
      app: "team-banner-designer",
      version: 1,
      kind: "shopify-custom-order-generation",
      designId,
      savedAt,
      artboard: {
        width: generated.width,
        height: generated.height,
        shape: generated.shape,
        backgroundColor: "#ffffff"
      },
      product: {
        title: productTitle,
        handle: productHandle,
        headline: form.bannerType,
        sizeLabel: "",
        price: ""
      },
      teamName: form.teamName,
      orderForm: form,
      layerManifest: generated.layers,
      sourceSvg: `${basePath}/source.svg`
    };
    const [sourceBlob, editorBlob, jsonBlob] = await Promise.all([
      put(`${basePath}/source.svg`, generated.layeredSvg, {
        access: "public",
        contentType: "image/svg+xml; charset=utf-8",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      }),
      put(`${basePath}/editor.svg`, generated.svg, {
        access: "public",
        contentType: "image/svg+xml; charset=utf-8",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      }),
      put(`${basePath}/design.json`, JSON.stringify(editableProject, null, 2), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      })
    ]);
    const [backupSource, backupEditor, backupJson] = await Promise.all([
      copy(sourceBlob.url, `${backupPath}/source.svg`, {
        access: "public",
        contentType: "image/svg+xml; charset=utf-8",
        allowOverwrite: true
      }),
      copy(editorBlob.url, `${backupPath}/editor.svg`, {
        access: "public",
        contentType: "image/svg+xml; charset=utf-8",
        allowOverwrite: true
      }),
      copy(jsonBlob.url, `${backupPath}/design.json`, {
        access: "public",
        contentType: "application/json",
        allowOverwrite: true
      })
    ]);
    const designerUrl = buildLayerVerificationUrl({
      sourceSvgUrl: editorBlob.url,
      productTitle,
      designId,
      shape: generated.shape,
      width: generated.width,
      height: generated.height
    });
    const manifest = {
      version: 2,
      generatedFrom: "shopify-custom-order",
      id: designId,
      savedAt,
      previewUrl: editorBlob.url,
      jsonUrl: jsonBlob.url,
      sourceSvgUrl: sourceBlob.url,
      sourceSvgBlobUrl: sourceBlob.url,
      sourceSvgDownloadUrl: downloadUrl(sourceBlob),
      printSourceUrl: downloadUrl(sourceBlob),
      editorSvgUrl: editorBlob.url,
      manifestUrl: "",
      backupManifestUrl: "",
      backupStatus: "complete",
      backup: {
        jsonUrl: backupJson.url,
        sourceSvgUrl: backupSource.url,
        sourceSvgDownloadUrl: downloadUrl(backupSource),
        editorSvgUrl: backupEditor.url
      },
      lookupUrl: `${request.nextUrl.origin}/admin/orders?designId=${encodeURIComponent(designId)}`,
      designerUrl,
      productTitle,
      productHandle,
      teamName: form.teamName,
      orderNumber: order.name,
      shopifyOrderId: order.id,
      shopifyLineItemId: lineItem.id,
      adminGenerated: true,
      proofOnly: false,
      product: editableProject.product,
      artboard: editableProject.artboard,
      layers: generated.layers,
      project: editableProject,
      orderForm: form,
      embeddedUploadBytes: embedded.totalBytes,
      warnings: embedded.warnings,
      sourceSvgStats: generated.sourceSvgStats
    };
    const manifestBlob = await put(`${basePath}/manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 0
    });
    const finalManifest = { ...manifest, manifestUrl: manifestBlob.url };
    const backupManifestBlob = await put(`${backupPath}/manifest.json`, JSON.stringify(finalManifest, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0
    });
    await put(`${basePath}/manifest.json`, JSON.stringify({
      ...finalManifest,
      backupManifestUrl: backupManifestBlob.url
    }, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0
    });

    return NextResponse.json({
      ...finalManifest,
      backupManifestUrl: backupManifestBlob.url,
      reused: false
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Custom-order design generation failed."
    }, { status: 400 });
  }
}
