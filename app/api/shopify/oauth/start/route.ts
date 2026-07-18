import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { normalizeStoreDomain } from "@/lib/shopify-admin-credentials";

export const runtime = "nodejs";

export const SHOPIFY_OAUTH_STATE_COOKIE = "tsb_shopify_oauth_state";

export async function GET(request: NextRequest) {
  if (!verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/login?next=/admin/settings", request.url));
  }

  const clientId = String(process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || "").trim();
  if (!clientId) {
    return NextResponse.json({ error: "Shopify app credentials are not configured." }, { status: 503 });
  }

  const storeDomain = normalizeStoreDomain(process.env.SHOPIFY_STORE_DOMAIN);
  const state = randomBytes(24).toString("base64url");
  const callbackUrl = new URL("/api/shopify/oauth/callback", request.nextUrl.origin).toString();
  const authorizeUrl = new URL(`https://${storeDomain}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", process.env.SHOPIFY_API_SCOPES || "read_orders");
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: SHOPIFY_OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 10 * 60,
    path: "/"
  });
  return response;
}
