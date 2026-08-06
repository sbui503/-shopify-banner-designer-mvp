import type { ShopifyCustomAttribute } from "@/lib/shopify-custom-order";

export type FulfillmentTestManifest = {
  id: string;
  savedAt?: string;
  previewUrl?: string;
  jsonUrl?: string;
  sourceSvgUrl?: string;
  manifestUrl?: string;
  productTitle?: string;
  product?: Record<string, unknown>;
  teamName?: string;
  artboard?: Record<string, unknown>;
};

export type FulfillmentTestOrder = {
  id: string;
  name: string;
  createdAt: string;
  email: string;
  note: string;
  customAttributes: ShopifyCustomAttribute[];
  customer: {
    displayName: string;
    email: string;
  };
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        quantity: number;
        sku: string;
        variantTitle: string;
        customAttributes: ShopifyCustomAttribute[];
      };
    }>;
  };
};

function recordText(record: Record<string, unknown> | undefined, key: string) {
  return String(record?.[key] || "").trim();
}

function sportFromTitle(title: string) {
  return title.match(/baseball|softball|soccer|volleyball|basketball|football|track(?:\s*&\s*field)?/i)?.[0] || "Team sport";
}

export function buildFulfillmentTestOrder(manifest: FulfillmentTestManifest): FulfillmentTestOrder {
  const title = String(manifest.productTitle || recordText(manifest.product, "title") || "Custom Team Banner").trim();
  const teamName = String(manifest.teamName || "TSB QA TEAM").trim();
  const previewUrl = String(manifest.previewUrl || "").trim();
  const attributes: ShopifyCustomAttribute[] = [
    { key: "_Design ID", value: manifest.id },
    { key: "_Design Preview", value: previewUrl },
    { key: "_Layered Source SVG", value: manifest.sourceSvgUrl || "" },
    { key: "_Editable Design JSON", value: manifest.jsonUrl || "" },
    { key: "_Design Manifest", value: manifest.manifestUrl || "" },
    { key: "Team Name", value: teamName },
    { key: "Sport", value: sportFromTitle(title) },
    { key: "Banner Type", value: recordText(manifest.artboard, "shape") || "Hem & Grommets" },
    { key: "Manager / Coach", value: "TSBanner QA Coach" },
    { key: "Team Mom / Dad", value: "TSBanner QA Contact" },
    { key: "Sponsor", value: "TSBanner QA" },
    { key: "Number of Players", value: "2" },
    { key: "Player 1 Name", value: "QA PLAYER ONE" },
    { key: "Player 1 Number", value: "01" },
    { key: "Player 2 Name", value: "QA PLAYER TWO" },
    { key: "Player 2 Number", value: "02" },
    { key: "_Team Logo", value: previewUrl },
    { key: "_Player 1 Photo", value: previewUrl }
  ].filter((attribute) => String(attribute.value || "").trim());

  return {
    id: `test:${manifest.id}`,
    name: `TEST-${manifest.id}`,
    createdAt: new Date().toISOString(),
    email: "info@tsbanners.com",
    note: "TEST ONLY - DO NOT PRINT OR FULFILL. This verifies the fulfillment email, saved Design ID, and linked customer files. The saved proof is reused for the QA logo/photo image-link check.",
    customAttributes: [],
    customer: {
      displayName: "TSBanner QA",
      email: "info@tsbanners.com"
    },
    lineItems: {
      edges: [{
        node: {
          id: `test-line:${manifest.id}`,
          name: `[TEST] ${title}`,
          quantity: 1,
          sku: "TSB-QA-DO-NOT-FULFILL",
          variantTitle: "Custom order form QA",
          customAttributes: attributes
        }
      }]
    }
  };
}
