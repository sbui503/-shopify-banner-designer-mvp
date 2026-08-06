import assert from "node:assert/strict";
import test from "node:test";
import { qaDraftAttributes, qaDraftOrderInput, QA_TEAM_LOGO_URL } from "../lib/shopify-draft-order";

const design = {
  designId: "design_1785993888988_4cxt6tri",
  bannerType: "Hem & Grommets",
  teamName: "TSB QA HEM",
  productTitle: "TSB QA HEM",
  previewUrl: "https://example.com/proof.png",
  jsonUrl: "https://example.com/design.json",
  sourceSvgUrl: "https://example.com/design.svg",
  manifestUrl: "https://example.com/manifest.json"
};

test("draft line item preserves every customer and fulfillment field", () => {
  const attributes = qaDraftAttributes(design);
  const values = new Map(attributes.map((attribute) => [attribute.key, attribute.value]));

  assert.equal(values.get("Team Name"), "TSB QA HEM");
  assert.equal(values.get("Coach"), "Si");
  assert.equal(values.get("Team Mom / Dad"), "Doan");
  assert.equal(values.get("Number of Players"), "4");
  assert.equal(values.get("Player 1 Name"), "Sia");
  assert.equal(values.get("Player 2 Name"), "Simba");
  assert.equal(values.get("Player 3 Name"), "Duy");
  assert.equal(values.get("Player 4 Name"), "Thuy");
  assert.equal(values.get("Team Logo"), QA_TEAM_LOGO_URL);
  assert.equal(values.get("_Design Preview"), design.previewUrl);
  assert.equal(values.get("_Layered Source SVG"), design.sourceSvgUrl);
  assert.equal(values.get("_Editable Design JSON"), design.jsonUrl);
  assert.equal(values.get("_Design Manifest"), design.manifestUrl);
});

test("QA drafts are zero-dollar, non-shipping, and unmistakably blocked from fulfillment", () => {
  const input = qaDraftOrderInput(design);

  assert.equal(input.lineItems[0].originalUnitPrice, "0.00");
  assert.equal(input.lineItems[0].requiresShipping, false);
  assert.match(input.note, /DO NOT COMPLETE/);
  assert.ok(input.tags.includes("DO-NOT-FULFILL"));
});
