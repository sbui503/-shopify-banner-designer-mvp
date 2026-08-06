import assert from "node:assert/strict";
import test from "node:test";
import { customOrderSummary, normalizeShopifyAttributes } from "../lib/shopify-custom-order";

const serializedForm = JSON.stringify({
  "Team / logo name": "TSB QA United",
  "Team Logo": "team-logo.jpg",
  "Number of players": "2",
  Sport: "Soccer",
  "Banner type": "Hem & Grommet",
  "SVG layout": "Photo Frame Template",
  "Player 01 Name": "Alex One",
  "Player 01 Number": "#10",
  "Player 01 Photo": "alex.jpg",
  "Player 02 Name": "Jordan Two",
  "Player 02 Number": "#22",
  "Player 02 Photo": "jordan.jpg"
});

test("expands the serialized Shopify custom-order fallback into readable fields", () => {
  const attributes = normalizeShopifyAttributes([
    { key: "_TSB Custom Form JSON", value: serializedForm }
  ]);

  assert.equal(attributes.some((attribute) => attribute.key === "_TSB Custom Form JSON"), false);
  assert.equal(attributes.find((attribute) => attribute.key === "Team / logo name")?.value, "TSB QA United");
  assert.equal(attributes.find((attribute) => attribute.key === "Player 02 Name")?.value, "Jordan Two");
});

test("keeps Shopify upload URLs instead of fallback filenames", () => {
  const teamLogoUrl = "https://cdn.shopify.com/uploads/team-logo.jpg";
  const playerPhotoUrl = "https://cdn.shopify.com/uploads/alex.jpg";
  const attributes = normalizeShopifyAttributes([
    { key: "Team Logo", value: teamLogoUrl },
    { key: "Player 01 Photo", value: playerPhotoUrl },
    { key: "_TSB Custom Form JSON", value: serializedForm }
  ]);

  assert.equal(attributes.find((attribute) => attribute.key === "Team Logo")?.value, teamLogoUrl);
  assert.equal(attributes.find((attribute) => attribute.key === "Player 01 Photo")?.value, playerPhotoUrl);
});

test("does not discard an invalid serialized field", () => {
  const attributes = normalizeShopifyAttributes([
    { key: "_TSB Custom Form JSON", value: "not valid json" }
  ]);

  assert.deepEqual(attributes, [{ key: "TSB Custom Form JSON", value: "not valid json" }]);
});

test("summarizes fulfillment coverage for team, players, logo, and photos", () => {
  const summary = customOrderSummary([
    { key: "_TSB Custom Form JSON", value: serializedForm }
  ]);

  assert.equal(summary.teamName, "TSB QA United");
  assert.equal(summary.teamLogo, "team-logo.jpg");
  assert.equal(summary.expectedPlayers, 2);
  assert.equal(summary.playerNameCount, 2);
  assert.equal(summary.playerPhotoCount, 2);
  assert.equal(summary.sport, "Soccer");
  assert.equal(summary.bannerType, "Hem & Grommet");
  assert.equal(summary.svgLayout, "Photo Frame Template");
});
