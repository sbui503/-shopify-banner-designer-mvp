import { NextResponse } from "next/server";
import { listStoredDesignManifests, safeDesignId } from "@/lib/admin-design-storage";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";
import { normalizeShopifyAttributes, type ShopifyCustomAttribute } from "@/lib/shopify-custom-order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2026-07";

type RecentDesign = {
  id?: string;
  savedAt?: string;
  productTitle?: string;
  orderNumber?: string;
};

function designIdsFromAttributes(attributes: ShopifyCustomAttribute[]) {
  const ids = new Set<string>();
  attributes.forEach((attribute) => {
    for (const match of String(`${attribute.key || ""} ${attribute.value || ""}`).matchAll(/design_[0-9]+_[a-z0-9]+/gi)) {
      ids.add(match[0]);
    }
  });
  return [...ids];
}

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function readRecentDesigns(): Promise<RecentDesign[]> {
  const storedPromise = listStoredDesignManifests(100).catch(() => []);
  const apiKey = String(process.env.TEAM_BANNER_API_KEY || "").trim();
  if (!apiKey) return storedPromise;

  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const customerPromise = fetch(`${origin}/api/designs?recent=100`, {
    cache: "no-store",
    headers: { "X-TSB-Admin-Key": apiKey }
  }).then(async (response) => {
    if (!response.ok) return [];
    const result = await response.json().catch(() => ({}));
    return Array.isArray(result.designs) ? result.designs as RecentDesign[] : [];
  }).catch(() => []);
  const [stored, customer] = await Promise.all([storedPromise, customerPromise]);
  const designsById = new Map<string, RecentDesign>();
  [...customer, ...stored].forEach((design) => {
    const id = safeDesignId(design.id);
    if (id) designsById.set(id, { ...design, id });
  });
  return [...designsById.values()];
}

function likelyDesignMatch(input: {
  orderName: string;
  createdAt: string;
  lineItems: Array<{ name: string }>;
  designs: RecentDesign[];
}) {
  const normalizedOrder = input.orderName.replace(/^#/, "").trim().toLowerCase();
  const exactOrderDesigns = input.designs.filter((design) => {
    return String(design.orderNumber || "").replace(/^#/, "").trim().toLowerCase() === normalizedOrder;
  });
  if (exactOrderDesigns.length === 1 && exactOrderDesigns[0].id) {
    return {
      id: exactOrderDesigns[0].id,
      productTitle: exactOrderDesigns[0].productTitle || "",
      savedAt: exactOrderDesigns[0].savedAt || "",
      secondsBeforeOrder: 0,
      matchReason: "Admin recovery linked to this order"
    };
  }

  const orderTime = new Date(input.createdAt).getTime();
  if (!Number.isFinite(orderTime)) return null;

  const productTitles = new Set(input.lineItems.map((line) => normalizedTitle(line.name)).filter(Boolean));
  const candidates = input.designs.flatMap((design) => {
    const savedTime = new Date(design.savedAt || "").getTime();
    const productTitle = normalizedTitle(design.productTitle || "");
    const millisecondsBeforeOrder = orderTime - savedTime;
    if (!design.id || !Number.isFinite(savedTime) || !productTitles.has(productTitle)) return [];
    if (millisecondsBeforeOrder < -5 * 60 * 1000 || millisecondsBeforeOrder > 30 * 60 * 1000) return [];
    return [{
      id: design.id,
      productTitle: design.productTitle || "",
      savedAt: design.savedAt || "",
      secondsBeforeOrder: Math.round(millisecondsBeforeOrder / 1000),
      distance: Math.abs(millisecondsBeforeOrder)
    }];
  }).sort((left, right) => left.distance - right.distance);

  if (!candidates.length) return null;
  if (candidates[1] && candidates[1].distance - candidates[0].distance < 2 * 60 * 1000) return null;
  return {
    id: candidates[0].id,
    productTitle: candidates[0].productTitle,
    savedAt: candidates[0].savedAt,
    secondsBeforeOrder: candidates[0].secondsBeforeOrder,
    matchReason: "Product title and save time match"
  };
}

export async function GET() {
  const credential = await getShopifyAdminCredential().catch(() => null);
  if (!credential?.token) {
    return NextResponse.json({
      error: "Shopify is not connected.",
      requiresConnection: true
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }

  try {
    const recentDesignsPromise = readRecentDesigns().catch(() => []);
    const response = await fetch(`https://${credential.storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": credential.token
      },
      body: JSON.stringify({
        query: `query RecentTeamBannerOrders {
          orders(first: 30, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                note
                displayFinancialStatus
                displayFulfillmentStatus
                customAttributes { key value }
                currentTotalPriceSet {
                  shopMoney { amount currencyCode }
                }
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
            }
          }
        }`
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.errors) {
      const detail = Array.isArray(result.errors)
        ? result.errors.map((error: { message?: string }) => error.message).filter(Boolean).join("; ")
        : "";
      throw new Error(detail || `Shopify order request failed (${response.status}).`);
    }

    const recentDesigns = await recentDesignsPromise;
    const orders = (result.data?.orders?.edges || []).map((edge: {
      node: {
        id: string;
        name: string;
        createdAt: string;
        note?: string;
        displayFinancialStatus?: string;
        displayFulfillmentStatus?: string;
        customAttributes?: ShopifyCustomAttribute[];
        currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
        lineItems?: {
          edges?: Array<{
            node: {
              id: string;
              name: string;
              quantity: number;
              sku?: string;
              variantTitle?: string;
              customAttributes?: ShopifyCustomAttribute[];
            };
          }>;
        };
      };
    }) => {
      const node = edge.node;
      const orderAttributes = normalizeShopifyAttributes(node.customAttributes || []);
      const lineItems = (node.lineItems?.edges || []).map((line) => ({
        ...line.node,
        customAttributes: normalizeShopifyAttributes(line.node.customAttributes || [])
      }));
      const attributes = [
        ...orderAttributes,
        ...lineItems.flatMap((line) => line.customAttributes || [])
      ];
      const designIds = designIdsFromAttributes(attributes);
      const normalizedOrderName = node.name.replace(/^#/, "").trim().toLowerCase();
      recentDesigns.forEach((design) => {
        const recoveryOrder = String(design.orderNumber || "").replace(/^#/, "").trim().toLowerCase();
        const id = safeDesignId(design.id);
        if (id && recoveryOrder && recoveryOrder === normalizedOrderName && !designIds.includes(id)) {
          designIds.push(id);
        }
      });
      const orderId = node.id.split("/").pop() || "";
      return {
        id: node.id,
        name: node.name,
        createdAt: node.createdAt,
        adminUrl: orderId ? `https://${credential.storeDomain}/admin/orders/${orderId}` : "",
        financialStatus: node.displayFinancialStatus || "",
        fulfillmentStatus: node.displayFulfillmentStatus || "",
        total: node.currentTotalPriceSet?.shopMoney || {},
        note: node.note || "",
        customer: { name: "", email: "" },
        customAttributes: orderAttributes,
        designIds,
        likelyDesign: designIds.length ? null : likelyDesignMatch({
          orderName: node.name,
          createdAt: node.createdAt,
          lineItems,
          designs: recentDesigns
        }),
        lineItems: lineItems.map((line) => ({
          id: line.id,
          name: line.name,
          quantity: line.quantity,
          sku: line.sku || "",
          variantTitle: line.variantTitle || "",
          customAttributes: line.customAttributes || []
        }))
      };
    });

    return NextResponse.json({ orders, count: orders.length }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Shopify order lookup failed."
    }, {
      status: 502,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
