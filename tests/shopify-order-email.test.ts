import assert from "node:assert/strict";
import test from "node:test";
import { orderEmailHtml } from "@/lib/shopify-order-email";

test("fulfillment email includes the exact generated Design ID and production links", () => {
  const html = orderEmailHtml({
    id: "gid://shopify/Order/1452",
    name: "#1452",
    lineItems: {
      edges: [{
        node: {
          id: "gid://shopify/LineItem/7001",
          name: "Custom Hem & Grommet Banner",
          quantity: 1,
          customAttributes: [{ key: "Team Name", value: "TSB QA United" }]
        }
      }]
    }
  }, "https://example.myshopify.com/admin/orders/1452", false, [{
    id: "design_1789000000000_qa1452aa",
    generatedFrom: "shopify-custom-order",
    shopifyOrderId: "gid://shopify/Order/1452",
    shopifyLineItemId: "gid://shopify/LineItem/7001",
    designerUrl: "https://teamsportbanners.vercel.app/?designId=design_1789000000000_qa1452aa",
    sourceSvgDownloadUrl: "https://blob.example/design_1789000000000_qa1452aa.svg"
  }], "https://admin-teamsportbanners.vercel.app");

  assert.match(html, /Production Design ID: design_1789000000000_qa1452aa/);
  assert.match(html, /admin-teamsportbanners\.vercel\.app\/admin\/orders\?designId=design_1789000000000_qa1452aa/);
  assert.match(html, /Edit design layers/);
  assert.match(html, /Download layered SVG/);
});
