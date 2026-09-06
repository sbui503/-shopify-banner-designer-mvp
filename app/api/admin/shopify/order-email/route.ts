import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  listStoredDesignManifests,
  readStoredDesignManifest,
  safeDesignId,
  type StoredDesignManifest
} from "@/lib/admin-design-storage";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";
import { orderEmailHtml, type ShopifyEmailOrder } from "@/lib/shopify-order-email";
import {
  customOrderSummary,
  normalizeShopifyAttributes
} from "@/lib/shopify-custom-order";
import {
  buildFulfillmentTestOrder,
  type FulfillmentTestManifest
} from "@/lib/shopify-fulfillment-test";

export const maxDuration = 30;
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2026-07";
const DEFAULT_TO = "info@tsbanners.com";
const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";
const DEFAULT_FALLBACK_FROM = "Team Sport Banners <onboarding@resend.dev>";
const EMAIL_LOG_PREFIX = "team-banner-admin/email-log/shopify-orders/";

function hasCustomOrderInformation(order: ShopifyEmailOrder) {
  if (normalizeShopifyAttributes(order.customAttributes || []).length) return true;
  return (order.lineItems?.edges || []).some((edge) => (
    normalizeShopifyAttributes(edge.node.customAttributes || []).length > 0
  ));
}

function logPath(orderId: string) {
  const hash = createHash("sha256").update(orderId).digest("hex").slice(0, 24);
  return `${EMAIL_LOG_PREFIX}${hash}.json`;
}

async function existingLog(orderId: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const pathname = logPath(orderId);
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = result.blobs?.find((candidate) => candidate.pathname === pathname);
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: "no-store" });
  return response.ok ? response.json().catch(() => null) : null;
}

async function sendResendEmail(apiKey: string, body: Record<string, unknown>) {
  async function attempt(nextBody: Record<string, unknown>) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextBody)
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok, result, from: String(nextBody.from || "") };
  }

  const primary = await attempt(body);
  if (primary.ok) return primary;

  const fallbackFrom = process.env.PROOF_EMAIL_FALLBACK_FROM || DEFAULT_FALLBACK_FROM;
  if (fallbackFrom && body.from !== fallbackFrom && /domain is not verified/i.test(JSON.stringify(primary.result || {}))) {
    return attempt({ ...body, from: fallbackFrom });
  }
  return primary;
}

async function sendThroughCustomerRelay(body: Record<string, unknown>) {
  const apiKey = String(process.env.TEAM_BANNER_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ok: false,
      result: { error: "TEAM_BANNER_API_KEY is not configured for the email relay." }
    };
  }
  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const response = await fetch(`${origin}/api/admin-email-relay`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-TSB-Admin-Key": apiKey
    },
    body: JSON.stringify({
      subject: body.subject,
      html: body.html
    })
  });
  return {
    ok: response.ok,
    result: await response.json().catch(() => ({}))
  };
}

async function readFulfillmentTestManifest(designId: string) {
  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const response = await fetch(`${origin}/api/designs?id=${encodeURIComponent(designId)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Saved design lookup failed (${response.status}).`);
  }
  if (safeDesignId(result.id) !== designId || !result.previewUrl || !result.jsonUrl || !result.sourceSvgUrl) {
    throw new Error("The saved design is missing its proof, editable JSON, or layered SVG source.");
  }
  return result as FulfillmentTestManifest;
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      orderId?: string;
      testDesignId?: string;
      confirmTest?: boolean;
      designIds?: string[];
    };
    const orderId = String(payload.orderId || "").trim();
    const testDesignId = safeDesignId(payload.testDesignId);
    const testOnly = Boolean(testDesignId);
    const requestedDesignIds = [...new Set((Array.isArray(payload.designIds) ? payload.designIds : [])
      .map((value) => safeDesignId(value))
      .filter(Boolean))].slice(0, 50);
    if (payload.testDesignId && !testDesignId) {
      return NextResponse.json({ error: "A valid saved Design ID is required for the test email." }, { status: 400 });
    }
    if (testOnly && payload.confirmTest !== true) {
      return NextResponse.json({ error: "Confirm the fulfillment test email before sending." }, { status: 400 });
    }
    if (!testOnly && !/^gid:\/\/shopify\/Order\/[0-9]+$/.test(orderId)) {
      return NextResponse.json({ error: "A valid Shopify order ID is required." }, { status: 400 });
    }

    let order: ShopifyEmailOrder;
    let adminUrl: string;
    let generatedDesigns: StoredDesignManifest[] = [];
    if (testOnly) {
      const manifest = await readFulfillmentTestManifest(testDesignId);
      order = buildFulfillmentTestOrder(manifest);
      adminUrl = `${request.nextUrl.origin}/admin/orders?designId=${encodeURIComponent(testDesignId)}`;
    } else {
      const credential = await getShopifyAdminCredential();
      if (!credential?.token) {
        return NextResponse.json({ error: "Shopify is not connected." }, { status: 503 });
      }
      const shopifyResponse = await fetch(`https://${credential.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": credential.token
        },
        body: JSON.stringify({
          query: `query TSBannerFulfillmentOrder($id: ID!) {
            order(id: $id) {
              id
              name
              createdAt
              note
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
                  }
                }
              }
            }
          }`,
          variables: { id: orderId }
        })
      });
      const shopifyResult = await shopifyResponse.json().catch(() => ({}));
      const loadedOrder = shopifyResult.data?.order as ShopifyEmailOrder | null;
      if (!shopifyResponse.ok || shopifyResult.errors || !loadedOrder) {
        const detail = Array.isArray(shopifyResult.errors)
          ? shopifyResult.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
          : "";
        throw new Error(detail || "The Shopify order could not be loaded.");
      }
      order = loadedOrder;
      if (!hasCustomOrderInformation(order)) {
        return NextResponse.json({
          error: "Fulfillment blocked: this Shopify order has no saved custom order information."
        }, { status: 422 });
      }
      const numericId = order.id.split("/").pop() || "";
      adminUrl = `https://${credential.storeDomain}/admin/orders/${numericId}`;
      const requestedDesigns = requestedDesignIds.length
        ? await Promise.all(requestedDesignIds.map((id) => readStoredDesignManifest(id)))
        : await listStoredDesignManifests(250);
      generatedDesigns = requestedDesigns.filter((design): design is StoredDesignManifest => Boolean(
        design
        && design.generatedFrom === "shopify-custom-order"
        && design.shopifyOrderId === order.id
        && safeDesignId(design.id)
      ));
      const requiredDesignLineIds = (order.lineItems?.edges || [])
        .filter((edge) => {
          const summary = customOrderSummary(edge.node.customAttributes || []);
          return Boolean(summary.teamName || summary.teamLogo || summary.bannerType || summary.expectedPlayers);
        })
        .map((edge) => edge.node.id)
        .filter(Boolean);
      const missingDesignLineIds = requiredDesignLineIds.filter((lineItemId) => (
        !generatedDesigns.some((design) => design.shopifyLineItemId === lineItemId)
      ));
      if (missingDesignLineIds.length) {
        return NextResponse.json({
          error: `Fulfillment blocked: generate a Design ID for ${missingDesignLineIds.length} custom item${missingDesignLineIds.length === 1 ? "" : "s"} before sending.`
        }, { status: 422 });
      }
    }

    const designVersion = generatedDesigns.map((design) => safeDesignId(design.id)).filter(Boolean).sort().join(",");
    const logId = testOnly ? `test:${testDesignId}` : `${orderId}:${designVersion || "no-design"}`;
    const previous = await existingLog(logId);
    if (previous) {
      return NextResponse.json({
        alreadySent: true,
        sentAt: previous.sentAt || "",
        to: previous.to || DEFAULT_TO
      }, { status: 409 });
    }

    const to = testOnly ? DEFAULT_TO : String(process.env.PROOF_EMAIL_TO || DEFAULT_TO).trim();
    const sentAt = new Date().toISOString();
    const emailPayload = {
      from: process.env.PROOF_EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject: testOnly
        ? `[TEST - DO NOT PRINT] Fulfillment custom order ${testDesignId}`
        : `Fulfillment: Shopify custom order ${order.name}`,
      html: orderEmailHtml(order, adminUrl, testOnly, generatedDesigns, request.nextUrl.origin)
    };
    const localResendKey = String(process.env.RESEND_API_KEY || "").trim();
    const emailResult = localResendKey
      ? await sendResendEmail(localResendKey, emailPayload)
      : await sendThroughCustomerRelay(emailPayload);
    if (!emailResult.ok) {
      return NextResponse.json({
        error: "Resend rejected the fulfillment email.",
        detail: emailResult.result
      }, { status: 502 });
    }

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const deliveredTo = String((emailResult.result as { to?: string }).to || to);
      await put(logPath(logId), JSON.stringify({
        version: 1,
        orderId: order.id,
        orderName: order.name,
        testOnly,
        designId: testDesignId || "",
        sentAt,
        to: deliveredTo,
        resendId: (emailResult.result as { id?: string }).id || ""
      }, null, 2), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 0
      });
    }

    return NextResponse.json({
      sent: true,
      testOnly,
      designId: testDesignId || "",
      sentAt,
      to: String((emailResult.result as { to?: string }).to || to),
      id: (emailResult.result as { id?: string }).id || ""
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send fulfillment email." },
      { status: 400 }
    );
  }
}
