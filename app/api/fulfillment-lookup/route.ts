import { NextRequest, NextResponse } from "next/server";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";

export const maxDuration = 30;
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2025-10";

function designIdsFromValue(value: unknown) {
  return [...String(value || "").matchAll(/design_[0-9]+_[a-z0-9]+/gi)].map((match) => match[0]);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const order = String(request.nextUrl.searchParams.get("order") || request.nextUrl.searchParams.get("orderNumber") || "").trim();
  if (!order) {
    return NextResponse.json({ error: "Missing order number." }, { status: 400, headers: corsHeaders() });
  }

  const credential = await getShopifyAdminCredential();
  if (!credential?.token) {
    return NextResponse.json({
      error: "Team Banner API key is not configured.",
      requiresShopifyAdminToken: true,
      manualWorkflow: "Open Admin > Settings and save the Team Banner API key, or open the order in Shopify Admin and copy the TSB Design ID manually."
    }, { status: 503, headers: corsHeaders() });
  }

  try {
    const { token, storeDomain } = credential;
    const orderName = order.startsWith("#") ? order : `#${order}`;
    const shopifyResponse = await fetch(`https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token
      },
      body: JSON.stringify({
        query: `query OrderDesignLookup($query: String!) {
          orders(first: 1, query: $query) {
            edges {
              node {
                id
                name
                email
                customAttributes { key value }
                lineItems(first: 50) {
                  edges {
                    node {
                      name
                      quantity
                      customAttributes { key value }
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: { query: `name:${orderName}` }
      })
    });

    const result = await shopifyResponse.json().catch(() => ({}));
    if (!shopifyResponse.ok || result.errors) {
      return NextResponse.json({ error: "Shopify order lookup failed.", detail: result.errors || result }, { status: 502, headers: corsHeaders() });
    }

    const node = result.data?.orders?.edges?.[0]?.node;
    if (!node) {
      return NextResponse.json({ error: "Order not found." }, { status: 404, headers: corsHeaders() });
    }

    const designIds = new Set<string>();
    (node.customAttributes || []).forEach((attr: { key?: string; value?: string }) => {
      designIdsFromValue(`${attr.key} ${attr.value}`).forEach((id) => designIds.add(id));
    });
    (node.lineItems?.edges || []).forEach((edge: { node?: { customAttributes?: Array<{ key?: string; value?: string }> } }) => {
      (edge.node?.customAttributes || []).forEach((attr) => {
        designIdsFromValue(`${attr.key} ${attr.value}`).forEach((id) => designIds.add(id));
      });
    });

    return NextResponse.json({
      order: {
        id: node.id,
        name: node.name,
        email: node.email,
        customAttributes: node.customAttributes || [],
        lineItems: (node.lineItems?.edges || []).map((edge: { node: unknown }) => edge.node)
      },
      designIds: [...designIds]
    }, { headers: corsHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order lookup failed." }, { status: 400, headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
