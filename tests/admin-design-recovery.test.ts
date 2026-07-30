import assert from "node:assert/strict";
import test from "node:test";
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
