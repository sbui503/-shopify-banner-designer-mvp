import { NextRequest, NextResponse } from "next/server";
import { safeDesignId } from "@/lib/admin-design-storage";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";
import { normalizeShopifyAttributes, type ShopifyCustomAttribute } from "@/lib/shopify-custom-order";
import { qaDraftOrderInput, type QaDraftDesign } from "@/lib/shopify-draft-order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2026-07";

type ShopifyCredential = {
  token: string;
  storeDomain: string;
};

type DraftLineItem = {
  id: string;
  name: string;
  title: string;
  quantity: number;
  sku?: string;
  variantTitle?: string;
  custom?: boolean;
  customAttributes?: ShopifyCustomAttribute[];
};

type DraftNode = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  note2?: string;
  tags?: string[];
  customAttributes?: ShopifyCustomAttribute[];
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  order?: { id?: string; name?: string } | null;
  lineItems?: { edges?: Array<{ node: DraftLineItem }> };
};

type QaDraftRequest = {
  confirmQa?: boolean;
  designs?: Array<{
    designId?: string;
    bannerType?: string;
    teamName?: string;
  }>;
};

const DRAFT_FRAGMENT = `fragment TSBannerDraftFields on DraftOrder {
  id
  name
  status
  createdAt
  updatedAt
  note2
  tags
  customAttributes { key value }
  totalPriceSet { shopMoney { amount currencyCode } }
  order { id name }
  lineItems(first: 50) {
    edges {
      node {
        id
        name
        title
        quantity
        sku
        variantTitle
        custom
        customAttributes { key value }
      }
    }
  }
}`;

async function shopifyGraphql(credential: ShopifyCredential, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(`https://${credential.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": credential.token
    },
    body: JSON.stringify({ query, variables })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.errors) {
    const detail = Array.isArray(result.errors)
      ? result.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
      : "";
    throw new Error(detail || `Shopify draft-order request failed (${response.status}).`);
  }
  return result.data || {};
}

async function shopifyScopes(credential: ShopifyCredential) {
  const data = await shopifyGraphql(credential, `query TSBannerDraftScopes {
    currentAppInstallation { accessScopes { handle } }
  }`);
  return (data.currentAppInstallation?.accessScopes || [])
    .map((scope: { handle?: string }) => String(scope.handle || ""))
    .filter(Boolean)
    .sort();
}

function designIdsFromAttributes(attributes: ShopifyCustomAttribute[]) {
  const ids = new Set<string>();
  attributes.forEach((attribute) => {
    for (const match of String(`${attribute.key || ""} ${attribute.value || ""}`).matchAll(/design_[0-9]+_[a-z0-9]+/gi)) {
      const id = safeDesignId(match[0]);
      if (id) ids.add(id);
    }
  });
  return [...ids];
}

function normalizeDraft(node: DraftNode, storeDomain: string) {
  const orderAttributes = normalizeShopifyAttributes(node.customAttributes || []);
  const lineItems = (node.lineItems?.edges || []).map((edge) => ({
    ...edge.node,
    customAttributes: normalizeShopifyAttributes(edge.node.customAttributes || [])
  }));
  const designIds = designIdsFromAttributes([
    ...orderAttributes,
    ...lineItems.flatMap((line) => line.customAttributes || [])
  ]);
  const draftId = node.id.split("/").pop() || "";
  const orderId = node.order?.id?.split("/").pop() || "";
  return {
    id: node.id,
    name: node.name,
    status: node.status,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    note: node.note2 || "",
    tags: node.tags || [],
    adminUrl: draftId ? `https://${storeDomain}/admin/draft_orders/${draftId}` : "",
    order: node.order ? {
      id: node.order.id || "",
      name: node.order.name || "",
      adminUrl: orderId ? `https://${storeDomain}/admin/orders/${orderId}` : ""
    } : null,
    total: node.totalPriceSet?.shopMoney || {},
    customAttributes: orderAttributes,
    designIds,
    lineItems
  };
}

type NormalizedDraft = ReturnType<typeof normalizeDraft>;

async function recentDrafts(credential: ShopifyCredential, first = 50): Promise<NormalizedDraft[]> {
  const data = await shopifyGraphql(credential, `query RecentTSBannerDraftOrders($first: Int!) {
    draftOrders(first: $first, sortKey: UPDATED_AT, reverse: true) {
      edges { node { ...TSBannerDraftFields } }
    }
  }
  ${DRAFT_FRAGMENT}`, { first });
  return (data.draftOrders?.edges || []).map((edge: { node: DraftNode }) => normalizeDraft(edge.node, credential.storeDomain));
}

function httpUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function loadQaDesign(input: NonNullable<QaDraftRequest["designs"]>[number]): Promise<QaDraftDesign> {
  const designId = safeDesignId(input.designId);
  const bannerType = String(input.bannerType || "").trim();
  const teamName = String(input.teamName || "").trim();
  if (!designId || !bannerType || !teamName) {
    throw new Error("Every QA draft requires a Design ID, banner type, and team name.");
  }

  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const response = await fetch(`${origin}/api/designs?id=${encodeURIComponent(designId)}`, { cache: "no-store" });
  const design = await response.json().catch(() => ({}));
  if (!response.ok || safeDesignId(design.id) !== designId) {
    throw new Error(`Saved design ${designId} could not be loaded.`);
  }
  if (!design.sourceSvgStats?.layered || Number(design.sourceSvgStats?.objectCount || 0) < 2) {
    throw new Error(`Saved design ${designId} is not a verified layered source.`);
  }

  const previewUrl = httpUrl(design.previewUrl);
  const jsonUrl = httpUrl(design.jsonUrl);
  const sourceSvgUrl = httpUrl(design.sourceSvgUrl);
  const manifestUrl = httpUrl(design.manifestUrl);
  if (!previewUrl || !jsonUrl || !sourceSvgUrl || !manifestUrl) {
    throw new Error(`Saved design ${designId} is missing a fulfillment file URL.`);
  }

  return {
    designId,
    bannerType,
    teamName,
    productTitle: String(design.productTitle || teamName),
    previewUrl,
    jsonUrl,
    sourceSvgUrl,
    manifestUrl
  };
}

async function createQaDraft(credential: ShopifyCredential, design: QaDraftDesign) {
  const data = await shopifyGraphql(credential, `mutation CreateTSBannerQaDraft($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { ...TSBannerDraftFields }
      userErrors { field message }
    }
  }
  ${DRAFT_FRAGMENT}`, { input: qaDraftOrderInput(design) });
  const payload = data.draftOrderCreate || {};
  const errors = Array.isArray(payload.userErrors) ? payload.userErrors : [];
  if (errors.length || !payload.draftOrder) {
    throw new Error(errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ") || "Shopify did not create the QA draft order.");
  }
  return normalizeDraft(payload.draftOrder, credential.storeDomain);
}

export async function GET() {
  const credential = await getShopifyAdminCredential().catch(() => null);
  if (!credential?.token) {
    return NextResponse.json({ error: "Shopify is not connected.", requiresConnection: true }, { status: 503 });
  }

  try {
    const scopes = await shopifyScopes(credential);
    const canRead = scopes.includes("read_draft_orders") || scopes.includes("write_draft_orders");
    const canWrite = scopes.includes("write_draft_orders");
    if (!canRead) {
      return NextResponse.json({
        error: "The Shopify app needs read_draft_orders and write_draft_orders access.",
        scopes,
        canRead,
        canWrite,
        drafts: []
      }, { status: 403 });
    }
    const drafts = await recentDrafts(credential);
    return NextResponse.json({ drafts, scopes, canRead, canWrite }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Shopify draft-order lookup failed."
    }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const credential = await getShopifyAdminCredential().catch(() => null);
  if (!credential?.token) {
    return NextResponse.json({ error: "Shopify is not connected.", requiresConnection: true }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({})) as QaDraftRequest;
    if (body.confirmQa !== true) {
      return NextResponse.json({ error: "Confirm these are QA-only draft orders." }, { status: 400 });
    }
    if (!Array.isArray(body.designs) || body.designs.length !== 4) {
      return NextResponse.json({ error: "Provide exactly four QA designs." }, { status: 400 });
    }

    const scopes = await shopifyScopes(credential);
    if (!scopes.includes("write_draft_orders")) {
      return NextResponse.json({
        error: "The Shopify app needs write_draft_orders access before Admin can create QA drafts.",
        scopes,
        requiresScope: "write_draft_orders"
      }, { status: 403 });
    }

    const designs = await Promise.all(body.designs.map(loadQaDesign));
    const uniqueIds = new Set(designs.map((design) => design.designId));
    if (uniqueIds.size !== designs.length) {
      return NextResponse.json({ error: "Each QA draft must use a different Design ID." }, { status: 400 });
    }

    const existing = await recentDrafts(credential, 100);
    const existingByDesignId = new Map<string, (typeof existing)[number]>();
    existing.forEach((draft) => draft.designIds.forEach((id: string) => existingByDesignId.set(id, draft)));

    const drafts: NormalizedDraft[] = [];
    for (const design of designs) {
      const found = existingByDesignId.get(design.designId);
      drafts.push(found || await createQaDraft(credential, design));
    }

    return NextResponse.json({ drafts, created: drafts.filter((draft) => !existing.includes(draft)).length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Shopify QA draft creation failed."
    }, { status: 502 });
  }
}
