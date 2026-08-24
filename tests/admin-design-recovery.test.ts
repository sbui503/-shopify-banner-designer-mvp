import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminDesignSvgUrl, buildLayerVerificationUrl } from "../lib/design-verification-url";
import { designIdFromPngBytes, normalizeDesignId } from "../lib/png-design-id";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6y1cAAAAASUVORK5CYII=",
  "base64"
);

function pngWithDesignId(id: string) {
  const data = Buffer.from(`TeamSportBannersDesignID\0${id}`, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("tEXt", 4, "ascii");
  data.copy(chunk, 8);
  const iendOffset = ONE_PIXEL_PNG.length - 12;
  return Buffer.concat([
    ONE_PIXEL_PNG.subarray(0, iendOffset),
    chunk,
    ONE_PIXEL_PNG.subarray(iendOffset)
  ]);
}

test("normalizes a Design ID from a customer proof filename", () => {
  assert.equal(
    normalizeDesignId("team-sport-banner-design_1770000000000_ab12cd34.png"),
    "design_1770000000000_ab12cd34"
  );
});

test("reads the embedded Design ID from a resumable PNG", () => {
  const id = "design_1770000000000_ef56gh78";
  assert.equal(designIdFromPngBytes(pngWithDesignId(id)), id);
});

test("does not identify an ordinary PNG as a saved design", () => {
  assert.equal(designIdFromPngBytes(ONE_PIXEL_PNG), "");
});

test("opens layered verification from the SVG source without a PNG fallback", () => {
  const sourceSvgUrl = "https://example.test/design.svg";
  const url = new URL(buildLayerVerificationUrl({
    sourceSvgUrl,
    productTitle: "Layer QA",
    designId: "design_1770000000000_ab12cd34"
  }));

  assert.equal(url.searchParams.get("templateSvg"), sourceSvgUrl);
  assert.equal(url.searchParams.get("productTitle"), "Layer QA");
  assert.equal(url.searchParams.get("autoLayer"), "svg");
  assert.equal(url.searchParams.has("productImage"), false);
  assert.equal(url.hash, "#team-banner-designer-section");
});

test("builds protected SVG preview and Illustrator download URLs", () => {
  const input = {
    designId: "design_1770000000000_ab12cd34",
    sourceSvgUrl: "https://example.test/source.svg"
  };

  assert.equal(
    buildAdminDesignSvgUrl(input),
    "/api/admin/design-svg?id=design_1770000000000_ab12cd34"
  );
  assert.equal(
    buildAdminDesignSvgUrl({ ...input, download: true }),
    "/api/admin/design-svg?id=design_1770000000000_ab12cd34&download=1"
  );
  assert.equal(buildAdminDesignSvgUrl({ designId: input.designId }), "");
});

test("uses direct Blob URLs for large self-contained SVG files", () => {
  const input = {
    designId: "design_1770000000000_ab12cd34",
    sourceSvgUrl: "https://example.public.blob.vercel-storage.com/source.svg",
    sourceSvgDownloadUrl: "https://example.public.blob.vercel-storage.com/source.svg?download=1"
  };

  assert.equal(buildAdminDesignSvgUrl(input), input.sourceSvgUrl);
  assert.equal(buildAdminDesignSvgUrl({ ...input, download: true }), input.sourceSvgDownloadUrl);
});
