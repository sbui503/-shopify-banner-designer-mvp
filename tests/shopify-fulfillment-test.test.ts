import assert from "node:assert/strict";
import test from "node:test";
import { buildFulfillmentTestOrder } from "../lib/shopify-fulfillment-test";
import { customOrderSummary } from "../lib/shopify-custom-order";

test("builds a clearly labeled fulfillment test with exact saved design files", () => {
  const order = buildFulfillmentTestOrder({
    id: "design_1785991465384_xt52ngs6",
    previewUrl: "https://example.com/proof.png",
    jsonUrl: "https://example.com/design.json",
    sourceSvgUrl: "https://example.com/source.svg",
    manifestUrl: "https://example.com/manifest.json",
    productTitle: "All-Star Baseball Banner",
    teamName: "QA EAGLES",
    artboard: { shape: "Hem & Grommets" }
  });

  const attributes = order.lineItems.edges[0].node.customAttributes;
  const summary = customOrderSummary(attributes);

  assert.match(order.name, /^TEST-/);
  assert.match(order.note, /DO NOT PRINT OR FULFILL/);
  assert.equal(summary.teamName, "QA EAGLES");
  assert.equal(summary.expectedPlayers, 2);
  assert.equal(summary.playerNameCount, 2);
  assert.equal(summary.playerPhotoCount, 1);
  assert.equal(summary.teamLogo, "https://example.com/proof.png");
  assert.equal(attributes.find((field) => field.key === "_Layered Source SVG")?.value, "https://example.com/source.svg");
});
