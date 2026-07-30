import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";

export const maxDuration = 30;
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2026-07";
const DEFAULT_TO = "info@tsbanners.com";
const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";
const DEFAULT_FALLBACK_FROM = "Team Sport Banners <onboarding@resend.dev>";
const EMAIL_LOG_PREFIX = "team-banner-admin/email-log/shopify-orders/";

type ShopifyAttribute = {
  key?: string;
  value?: string;
};

type ShopifyOrder = {
  id: string;
  name: string;
  createdAt?: string;
  email?: string;
  note?: string;
  customAttributes?: ShopifyAttribute[];
  customer?: {
    displayName?: string;
    email?: string;
  } | null;
  lineItems?: {
    edges?: Array<{
      node: {
        id?: string;
        name?: string;
        quantity?: number;
        sku?: string;
        variantTitle?: string;
        customAttributes?: ShopifyAttribute[];
      };
    }>;
  };
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldLabel(value: unknown) {
  return String(value || "")
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Custom field";
}

function nestedHttpUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value.trim().replace(/&amp;/g, "&"));
      if (/^https?:$/.test(url.protocol)) return url.toString();
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) {
    return value.map(nestedHttpUrl).find(Boolean) || "";
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(nestedHttpUrl).find(Boolean) || "";
  }
  return "";
}

function httpUrl(value: unknown) {
  const raw = String(value || "").trim();
  const direct = nestedHttpUrl(raw);
  if (direct) return direct;
  try {
    const parsed = nestedHttpUrl(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {}
  const match = raw.match(/https?:\/\/[^\s"'<>\\]+/i);
  return match ? nestedHttpUrl(match[0]) : "";
}

function isImageAttribute(attribute: ShopifyAttribute, url: string) {
  return /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url)
    || /(?:image|photo|logo|proof|artwork)/i.test(String(attribute.key || ""));
}

function attributeRows(attributes: ShopifyAttribute[]) {
  return attributes
    .filter((attribute) => String(attribute.value || "").trim())
    .map((attribute) => {
      const label = escapeHtml(fieldLabel(attribute.key));
      const value = String(attribute.value || "").trim();
      const url = httpUrl(value);
      const content = url
        ? `<a href="${escapeHtml(url)}">${escapeHtml(value)}</a>${isImageAttribute(attribute, url)
          ? `<br><img src="${escapeHtml(url)}" alt="${label}" style="display:block;max-width:360px;max-height:240px;margin-top:8px;border:1px solid #ddd;">`
          : ""}`
        : escapeHtml(value);
      return `<tr>
        <th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${label}</th>
        <td style="padding:8px 12px;border:1px solid #ddd;word-break:break-word;">${content}</td>
      </tr>`;
    })
    .join("");
}

function orderEmailHtml(order: ShopifyOrder, adminUrl: string) {
  const customerName = order.customer?.displayName || "";
  const customerEmail = order.customer?.email || order.email || "";
  const orderRows = attributeRows(order.customAttributes || []);
  const lineItems = (order.lineItems?.edges || []).map((edge, index) => {
    const item = edge.node;
    const details = [item.variantTitle, item.sku ? `SKU ${item.sku}` : ""].filter(Boolean).join(" | ");
    const fields = attributeRows(item.customAttributes || [])
      || `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #ddd;color:#666;">No custom fields attached.</td></tr>`;
    return `<h3 style="margin:24px 0 8px;">Item ${index + 1}: ${escapeHtml(item.quantity || 1)}x ${escapeHtml(item.name || "Custom product")}</h3>
      ${details ? `<p style="margin:0 0 8px;color:#555;">${escapeHtml(details)}</p>` : ""}
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;">${fields}</table>`;
  }).join("");

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.45;">
    <h2 style="margin-bottom:8px;">Shopify custom order ${escapeHtml(order.name)}</h2>
    <p><a href="${escapeHtml(adminUrl)}">Open order in Shopify Admin</a></p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;">
      <tr><th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Customer</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(customerName || "Not provided")}</td></tr>
      <tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Customer email</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(customerEmail || "Not provided")}</td></tr>
      <tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Order note</th><td style="padding:8px 12px;border:1px solid #ddd;white-space:pre-wrap;">${escapeHtml(order.note || "None")}</td></tr>
      ${orderRows}
    </table>
    ${lineItems}
  </body></html>`;
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

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { orderId?: string };
    const orderId = String(payload.orderId || "").trim();
    if (!/^gid:\/\/shopify\/Order\/[0-9]+$/.test(orderId)) {
      return NextResponse.json({ error: "A valid Shopify order ID is required." }, { status: 400 });
    }

    const previous = await existingLog(orderId);
    if (previous) {
      return NextResponse.json({
        alreadySent: true,
        sentAt: previous.sentAt || "",
        to: previous.to || DEFAULT_TO
      }, { status: 409 });
    }

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
            email
            note
            customAttributes { key value }
            customer { displayName email }
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
    const order = shopifyResult.data?.order as ShopifyOrder | null;
    if (!shopifyResponse.ok || shopifyResult.errors || !order) {
      const detail = Array.isArray(shopifyResult.errors)
        ? shopifyResult.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
        : "";
      throw new Error(detail || "The Shopify order could not be loaded.");
    }

    const numericId = order.id.split("/").pop() || "";
    const adminUrl = `https://${credential.storeDomain}/admin/orders/${numericId}`;
    const to = String(process.env.PROOF_EMAIL_TO || DEFAULT_TO).trim();
    const sentAt = new Date().toISOString();
    const emailPayload = {
      from: process.env.PROOF_EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject: `Fulfillment: Shopify custom order ${order.name}`,
      html: orderEmailHtml(order, adminUrl)
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
      await put(logPath(order.id), JSON.stringify({
        version: 1,
        orderId: order.id,
        orderName: order.name,
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
