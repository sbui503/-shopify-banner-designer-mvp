import assert from "node:assert/strict";
import test from "node:test";

import { designSvgUrl, fulfillmentLookupUrl } from "../lib/fulfillment-url.js";

test("uses the protected admin orders route by default", () => {
  assert.equal(
    fulfillmentLookupUrl("design_123_abc"),
    "https://admin-teamsportbanners.vercel.app/admin/orders?designId=design_123_abc"
  );
});

test("supports an explicit admin origin and encodes the design id", () => {
  assert.equal(
    fulfillmentLookupUrl("design 123", "https://preview-admin.example.com/path"),
    "https://preview-admin.example.com/admin/orders?designId=design%20123"
  );
});

test("builds a customer-domain layered SVG delivery URL", () => {
  assert.equal(
    designSvgUrl("https://teamsportbanners.vercel.app/path", "design 123"),
    "https://teamsportbanners.vercel.app/api/design-svg?id=design%20123"
  );
});
