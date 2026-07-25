import assert from "node:assert/strict";
import test from "node:test";

await import("../public/design-resume.js");

const {
  addDesignIdToPngBytes,
  designIdFromPngBytes,
  designIdFromPngFile,
  normalizeDesignId
} = globalThis.TeamBannerDesignResume;

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6y1cAAAAASUVORK5CYII=",
  "base64"
);

test("normalizes a Design ID from a proof filename", () => {
  assert.equal(
    normalizeDesignId("team-sport-banner-design_1770000000000_ab12cd34.png"),
    "design_1770000000000_ab12cd34"
  );
});

test("embeds and reads a Design ID inside PNG metadata", () => {
  const id = "design_1770000000000_ab12cd34";
  const tagged = addDesignIdToPngBytes(ONE_PIXEL_PNG, id);

  assert.equal(designIdFromPngBytes(tagged), id);
  assert.ok(tagged.byteLength > ONE_PIXEL_PNG.byteLength);
});

test("reads embedded Design ID after the PNG is renamed", async () => {
  const id = "design_1770000000000_ef56gh78";
  const tagged = addDesignIdToPngBytes(ONE_PIXEL_PNG, id);
  const file = new Blob([tagged], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "my-banner.png" });

  assert.equal(await designIdFromPngFile(file), id);
});

test("does not identify an ordinary PNG as a saved design", () => {
  assert.equal(designIdFromPngBytes(ONE_PIXEL_PNG), "");
});
