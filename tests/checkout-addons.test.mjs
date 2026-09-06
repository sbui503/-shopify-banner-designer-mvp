import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import test from "node:test";

const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const designerSource = await readFile(new URL("../public/team-banner-designer.js", import.meta.url), "utf8");
const emailSource = await readFile(new URL("../api/send-proof-email.js", import.meta.url), "utf8");

test("checkout exposes both owned accessory images and configuration slots", async () => {
  const bag = await stat(new URL("../public/accessories/tsb-banner-carry-bag.jpg", import.meta.url));
  const kit = await stat(new URL("../public/accessories/tsb-banner-pole-kit.jpg", import.meta.url));
  assert.ok(bag.size > 10_000);
  assert.ok(kit.size > 10_000);
  assert.match(indexSource, /data-carry-bag-variant-id=/);
  assert.match(indexSource, /data-bag-pole-kit-variant-id=/);
  assert.match(indexSource, /data-tbd-cart-addon-options/);
});

test("bag is offered for hem and grommet and pole pocket while the pole kit is pole-pocket only", () => {
  assert.match(designerSource, /id: "carry-bag"[\s\S]*?priceCents: 999[\s\S]*?allowedShapes: \["rectangle", "polepocket"\]/);
  assert.match(designerSource, /id: "bag-pole-kit"[\s\S]*?priceCents: 6999[\s\S]*?allowedShapes: \["polepocket"\]/);
});

test("selected accessories become separate Shopify cart lines and fulfillment proof fields", () => {
  assert.match(designerSource, /function checkoutLineItems\(items = designCart\)/);
  assert.match(designerSource, /lineType: "addon"/);
  assert.match(designerSource, /checkoutAddonLineProperties\(item, designs\)/);
  assert.match(designerSource, /variantId: \/\^\[0-9\]\+\$\/\.test\(configuredVariantId\) \? configuredVariantId : ""/);
  assert.match(designerSource, /eligibleCheckoutAddons\(\)\.filter\(\(addon\) => addon\.variantId\)/);
  assert.match(designerSource, /addOns: selectedCheckoutAddons\(\)\.map/);
  assert.match(emailSource, /\["Add-ons", addOns\]/);
});
