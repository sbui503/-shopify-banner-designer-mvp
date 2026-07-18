import assert from "node:assert/strict";
import test from "node:test";

import { inlineSvgImages } from "../lib/inline-svg-images.js";

const origin = "https://teamsportbanners.vercel.app";
const externalImage = `${origin}/api/image-proxy?url=${encodeURIComponent("https://cdn.shopify.com/example.png")}`;

test("embeds external image references without flattening SVG elements", async () => {
  const calls = [];
  const fetchImage = async (url) => {
    calls.push(url);
    return new Response(Buffer.from("image-bytes"), {
      status: 200,
      headers: { "content-type": "image/png" }
    });
  };
  const svg = `<svg><image id="background" xlink:href="${externalImage}"/><image id="logo" href="${externalImage}"/><text>Coach</text></svg>`;

  const result = await inlineSvgImages(svg, { origin, fetchImage });

  assert.equal(calls.length, 1);
  assert.equal((result.match(/<image\b/g) || []).length, 2);
  assert.match(result, /<text>Coach<\/text>/);
  assert.equal((result.match(/data:image\/png;base64,/g) || []).length, 2);
  assert.doesNotMatch(result, /\/api\/image-proxy/);
});

test("preserves images that are already embedded", async () => {
  const svg = '<svg><image href="data:image/png;base64,YWJj"/><text>Player</text></svg>';
  const result = await inlineSvgImages(svg, {
    origin,
    fetchImage: async () => { throw new Error("fetch should not run"); }
  });

  assert.equal(result, svg);
});

test("rejects untrusted external image hosts", async () => {
  const svg = '<svg><image href="https://example.com/image.png"/></svg>';

  await assert.rejects(
    inlineSvgImages(svg, { origin, fetchImage: async () => new Response() }),
    /image host is not allowed/
  );
});
