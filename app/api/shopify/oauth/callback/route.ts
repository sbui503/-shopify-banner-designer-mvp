import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { normalizeStoreDomain, saveShopifyAdminCredential, validateShopifyAdminCredential } from "@/lib/shopify-admin-credentials";

export const runtime = "nodejs";

const SHOPIFY_OAUTH_STATE_COOKIE = "tsb_shopify_oauth_state";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validShopifyHmac(request: NextRequest, secret: string) {
  const provided = request.nextUrl.searchParams.get("hmac") || "";
  const message = [...request.nextUrl.searchParams.entries()]
    .filter(([key]) => key !== "hmac")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  return Boolean(provided) && safeEqual(provided, expected);
}

function settingsRedirect(request: NextRequest, status: "connected" | "error") {
  const response = NextResponse.redirect(new URL(`/admin/settings?shopify=${status}`, request.nextUrl.origin));
  response.cookies.set({ name: SHOPIFY_OAUTH_STATE_COOKIE, value: "", maxAge: 0, path: "/" });
  return response;
}

export async function GET(request: NextRequest) {
  const clientId = String(process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "").trim();
  const code = request.nextUrl.searchParams.get("code") || "";
  const shop = request.nextUrl.searchParams.get("shop") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  const savedState = request.cookies.get(SHOPIFY_OAUTH_STATE_COOKIE)?.value || "";

  const configuredShop = normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN);
  if (!clientId || !clientSecret || !code || !shop || !state || !savedState
    || normalizeStoreDomain(shop) !== configuredShop
    || !safeEqual(state, savedState)
    || !validShopifyHmac(request, clientSecret)) {
    return settingsRedirect(request, "error");
  }

  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code })
    });
    const tokenResult = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenResult.access_token) throw new Error("Shopify token exchange failed.");

    await validateShopifyAdminCredential({ token: tokenResult.access_token, storeDomain: shop });
    await saveShopifyAdminCredential({ token: tokenResult.access_token, storeDomain: shop });
    return settingsRedirect(request, "connected");
  } catch {
    return settingsRedirect(request, "error");
  }
}
