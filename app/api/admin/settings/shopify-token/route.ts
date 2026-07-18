import { NextRequest, NextResponse } from "next/server";
import {
  getShopifyCredentialStatus,
  normalizeStoreDomain,
  saveShopifyAdminCredential,
  validateAdminSettingsKey,
  validateShopifyAdminCredential
} from "@/lib/shopify-admin-credentials";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getShopifyCredentialStatus(), { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read Shopify credential status." },
      { status: 400, headers: noStoreHeaders() }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!validateAdminSettingsKey(payload.adminKey)) {
      return NextResponse.json({ error: "Invalid admin settings key." }, { status: 401, headers: noStoreHeaders() });
    }

    const token = String(payload.token || "").trim();
    const storeDomain = normalizeStoreDomain(payload.storeDomain || process.env.SHOPIFY_STORE_DOMAIN);
    const validation = await validateShopifyAdminCredential({ token, storeDomain });
    const saved = await saveShopifyAdminCredential({ token, storeDomain });

    return NextResponse.json({
      configured: true,
      source: "admin-storage",
      storeDomain: saved.storeDomain,
      updatedAt: saved.updatedAt,
      validation
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save Shopify credential." },
      { status: 400, headers: noStoreHeaders() }
    );
  }
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store"
  };
}
