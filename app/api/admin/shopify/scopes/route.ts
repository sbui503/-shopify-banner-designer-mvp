import { NextResponse } from "next/server";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const credential = await getShopifyAdminCredential().catch(() => null);
  if (!credential?.token) {
    return NextResponse.json({ error: "Shopify is not connected." }, { status: 503 });
  }

  try {
    const response = await fetch(`https://${credential.storeDomain}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": credential.token
      },
      body: JSON.stringify({
        query: `query TSBannerShopifyScopes {
          currentAppInstallation {
            accessScopes { handle }
          }
        }`
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.errors) {
      const detail = Array.isArray(result.errors)
        ? result.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
        : "";
      throw new Error(detail || `Shopify scope request failed (${response.status}).`);
    }
    const scopes = (result.data?.currentAppInstallation?.accessScopes || [])
      .map((scope: { handle?: string }) => String(scope.handle || ""))
      .filter(Boolean)
      .sort();
    return NextResponse.json({
      storeDomain: credential.storeDomain,
      scopes,
      canReadOrders: scopes.includes("read_orders"),
      canReadCustomers: scopes.includes("read_customers"),
      canReadDraftOrders: scopes.includes("read_draft_orders") || scopes.includes("write_draft_orders"),
      canWriteDraftOrders: scopes.includes("write_draft_orders")
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Shopify scope lookup failed."
    }, { status: 502 });
  }
}
