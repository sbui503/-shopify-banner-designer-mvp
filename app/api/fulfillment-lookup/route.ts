import { NextRequest, NextResponse } from "next/server";
import { listStoredDesignManifests, safeDesignId } from "@/lib/admin-design-storage";
import { getShopifyAdminCredential } from "@/lib/shopify-admin-credentials";

export const maxDuration = 30;
export const runtime = "nodejs";

const SHOPIFY_API_VERSION = "2025-10";

function designIdsFromValue(value: unknown) {
  return [...String(value || "").matchAll(/design_[0-9]+_[a-z0-9]+/gi)].map((match) => match[0]);
}

type ShopifyAttribute = { key?: string; value?: string };

function attributeValue(attributes: ShopifyAttribute[], keyPattern: RegExp) {
  const attribute = attributes.find((item) => keyPattern.test(String(item.key || "")) && String(item.value || "").trim());
  return String(attribute?.value || "").trim();
}

function designsFromAttributes(attributes: ShopifyAttribute[], productTitle = "") {
  const designIds = new Set<string>();
  attributes.forEach((attribute) => {
    designIdsFromValue(`${attribute.key} ${attribute.value}`).forEach((id) => designIds.add(id));
  });
  const previewUrl = attributeValue(attributes, /design\s*preview|proof(?:\s*image)?/i);
  const jsonUrl = attributeValue(attributes, /editable\s*design|design\s*json/i);
  const sourceSvgUrl = attributeValue(attributes, /(?:layered|source)\s*svg/i);
  const manifestUrl = attributeValue(attributes, /design\s*manifest/i);
  return [...designIds].map((id) => ({ id, previewUrl, jsonUrl, sourceSvgUrl, manifestUrl, productTitle }));
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

    const orderAttributes: ShopifyAttribute[] = node.customAttributes || [];
    const designIds = new Set<string>();
    orderAttributes.forEach((attr) => {
      designIdsFromValue(`${attr.key} ${attr.value}`).forEach((id) => designIds.add(id));
    });
    const designs = designsFromAttributes(orderAttributes);
    (node.lineItems?.edges || []).forEach((edge: { node?: { name?: string; customAttributes?: ShopifyAttribute[] } }) => {
      (edge.node?.customAttributes || []).forEach((attr) => {
        designIdsFromValue(`${attr.key} ${attr.value}`).forEach((id) => designIds.add(id));
      });
      designs.push(...designsFromAttributes(edge.node?.customAttributes || [], edge.node?.name || ""));
    });
    const normalizedOrderName = String(node.name || "").replace(/^#/, "").trim().toLowerCase();
    const recoveredDesigns = await listStoredDesignManifests(250).catch(() => []);
    recoveredDesigns.forEach((design) => {
      const recoveryOrder = String(design.orderNumber || "").replace(/^#/, "").trim().toLowerCase();
      const id = safeDesignId(design.id);
      if (!id || !recoveryOrder || recoveryOrder !== normalizedOrderName) return;
      designIds.add(id);
      designs.push({
        id,
        previewUrl: design.previewUrl || "",
        jsonUrl: design.jsonUrl || "",
        sourceSvgUrl: design.sourceSvgUrl || "",
        manifestUrl: design.manifestUrl || "",
        productTitle: design.productTitle || ""
      });
    });

    const designsById = new Map<string, (typeof designs)[number]>();
    designs.forEach((design) => {
      const existing = designsById.get(design.id);
      designsById.set(design.id, {
        ...existing,
        ...design,
        previewUrl: design.previewUrl || existing?.previewUrl || "",
        jsonUrl: design.jsonUrl || existing?.jsonUrl || "",
        sourceSvgUrl: design.sourceSvgUrl || existing?.sourceSvgUrl || "",
        manifestUrl: design.manifestUrl || existing?.manifestUrl || "",
        productTitle: design.productTitle || existing?.productTitle || ""
      });
    });
    designIds.forEach((id) => {
      if (!designsById.has(id)) designsById.set(id, { id, previewUrl: "", jsonUrl: "", sourceSvgUrl: "", manifestUrl: "", productTitle: "" });
    });

    return NextResponse.json({
      order: {
        id: node.id,
        name: node.name,
        customAttributes: node.customAttributes || [],
        lineItems: (node.lineItems?.edges || []).map((edge: { node: unknown }) => edge.node)
      },
      designIds: [...designIds],
      designs: [...designsById.values()]
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
