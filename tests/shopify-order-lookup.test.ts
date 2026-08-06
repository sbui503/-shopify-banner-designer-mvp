import assert from "node:assert/strict";
import test from "node:test";
import { parseShopifyOrderLookup } from "../lib/shopify-order-lookup";

test("builds an exact Shopify name query from an order number", () => {
  assert.deepEqual(parseShopifyOrderLookup("#1450"), {
    kind: "name",
    query: "name:#1450",
    display: "#1450"
  });
});

test("builds a Shopify GID from a numeric order ID", () => {
  assert.deepEqual(parseShopifyOrderLookup("4895293669582"), {
    kind: "id",
    gid: "gid://shopify/Order/4895293669582",
    display: "4895293669582"
  });
});

test("accepts a Shopify admin order URL", () => {
  assert.deepEqual(
    parseShopifyOrderLookup("https://example.myshopify.com/admin/orders/4895293669582"),
    {
      kind: "id",
      gid: "gid://shopify/Order/4895293669582",
      display: "4895293669582"
    }
  );
});

test("rejects non-order search text", () => {
  assert.equal(parseShopifyOrderLookup("customer name"), null);
});
