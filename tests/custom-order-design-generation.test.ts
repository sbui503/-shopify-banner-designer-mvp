import assert from "node:assert/strict";
import test from "node:test";
import {
  customOrderDesignId,
  customOrderImageUrl,
  generateCustomOrderDesign,
  readOrderImageWithinLimit
} from "../lib/custom-order-design";
import { customOrderDesignInput } from "../lib/shopify-custom-order";

const attributes = [
  { key: "Team / logo name", value: "Tsunamis United" },
  { key: "Team Logo", value: "https://cdn.shopify.com/uploads/tsunamis.png" },
  { key: "Coach", value: "Si" },
  { key: "Team Mom/Dad", value: "Doan" },
  { key: "Number of players", value: "4" },
  { key: "Sport", value: "Soccer" },
  { key: "Banner type", value: "Pole Pocket" },
  { key: "Player 01 Name", value: "Sia" },
  { key: "Player 02 Name", value: "Simba" },
  { key: "Player 03 Name", value: "Duy" },
  { key: "Player 04 Name", value: "Thuy" },
  { key: "Player 01 Photo", value: "https://cdn.shopify.com/uploads/sia.jpg" }
];

test("extracts an HTTPS upload URL from serialized Shopify values", () => {
  assert.equal(
    customOrderImageUrl(JSON.stringify({ url: "https://cdn.shopify.com/uploads/team.png" })),
    "https://cdn.shopify.com/uploads/team.png"
  );
  assert.equal(customOrderImageUrl("team-logo.png"), "");
  assert.equal(customOrderImageUrl("http://localhost/logo.png"), "");
});

test("uses a stable Design ID for the same Shopify order line", () => {
  const order = { id: "gid://shopify/Order/1452", createdAt: "2026-09-05T12:00:00.000Z" };
  const first = customOrderDesignId(order, "gid://shopify/LineItem/7001");
  const second = customOrderDesignId(order, "gid://shopify/LineItem/7001");
  assert.equal(first, second);
  assert.match(first, /^design_1788609600000_[a-f0-9]{8}$/);
  assert.notEqual(first, customOrderDesignId(order, "gid://shopify/LineItem/7002"));
});

test("stops reading customer images at the remaining design byte limit", async () => {
  const accepted = await readOrderImageWithinLimit(new Response(new Uint8Array([1, 2, 3, 4])), 4);
  assert.deepEqual([...accepted], [1, 2, 3, 4]);
  await assert.rejects(
    readOrderImageWithinLimit(new Response(new Uint8Array([1, 2, 3, 4, 5])), 4),
    /8 MB design limit/
  );
});

test("generates a self-contained, named-layer pole-pocket SVG", () => {
  const input = customOrderDesignInput(attributes);
  const logoUrl = customOrderImageUrl(input.teamLogo);
  const photoUrl = customOrderImageUrl(input.players[0].photo);
  const images = new Map([
    [logoUrl, { sourceUrl: logoUrl, dataUrl: "data:image/png;base64,TE9HTw==", bytes: 4, contentType: "image/png" }],
    [photoUrl, { sourceUrl: photoUrl, dataUrl: "data:image/jpeg;base64,UEhPVE8=", bytes: 5, contentType: "image/jpeg" }]
  ]);
  const generated = generateCustomOrderDesign(input, images);

  assert.equal(generated.shape, "polepocket");
  assert.equal(generated.width, 1500);
  assert.equal(generated.height, 1102);
  assert.match(generated.svg, /data-team-banner-format="shopify-custom-order-v1"/);
  assert.match(generated.svg, />Tsunamis United<\/text>/);
  assert.match(generated.svg, />Sia<\/text>/);
  assert.match(generated.svg, /data:image\/png;base64,TE9HTw==/);
  assert.match(generated.svg, /data:image\/jpeg;base64,UEhPVE8=/);
  assert.doesNotMatch(generated.svg, /https:\/\//);
  assert.match(generated.layeredSvg, /inkscape:groupmode="layer"/);
  assert.match(generated.layeredSvg, /data-team-banner-format="illustrator-layered-svg-v1"/);
  assert.equal((generated.layeredSvg.match(/inkscape:groupmode="layer"/g) || []).length, generated.layers.length);
  assert.doesNotMatch(generated.layeredSvg, /https:\/\//);
  assert.equal(generated.sourceSvgStats.namedLayerCount, generated.layers.length);
  assert.equal(generated.sourceSvgStats.imageCount, 2);
  assert.equal(generated.sourceSvgStats.illustratorLayered, true);
});

test("uses the correct print shape for triangle and home-plate orders", () => {
  const triangle = customOrderDesignInput([{ key: "Banner type", value: "Triangle" }, { key: "Player 01 Name", value: "Sia" }]);
  const homePlate = customOrderDesignInput([{ key: "Banner type", value: "Home Plate" }, { key: "Player 01 Name", value: "Sia" }]);

  assert.match(generateCustomOrderDesign(triangle).svg, /<polygon[^>]+points="45,45 855,45 450,855"/);
  assert.match(generateCustomOrderDesign(homePlate).svg, /<polygon[^>]+points="45,45 855,45 855,495 450,855 45,495"/);
});
