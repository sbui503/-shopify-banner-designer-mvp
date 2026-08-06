import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../public/team-banner-designer.js", import.meta.url),
  "utf8"
);

test("offers an explicit generated layout that honors the requested player count", () => {
  assert.match(
    source,
    /<option value="__generated__">Generated editable layout<\/option>/
  );
  assert.match(
    source,
    /if \(selected === "__generated__"\) return null;/
  );
});

test("opens a saved design from a bare Design ID resume URL", () => {
  assert.match(
    source,
    /const savedDesignId = designResume\.normalizeDesignId\(get\("designId"\)\);/
  );
  assert.match(
    source,
    /hasDesign: Boolean\(savedDesignId\) \|\|/
  );
});
