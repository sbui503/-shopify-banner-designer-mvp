import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const indexSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const designerSource = await readFile(new URL("../public/team-banner-designer.js", import.meta.url), "utf8");

test("Open editable design accepts saved PNG files", () => {
  assert.match(indexSource, /data-tbd-project-upload[^>]+accept="[^"]*\.png[^"]*image\/png[^"]*"/);
});

test("Open editable design restores a saved PNG before trying the project parser", () => {
  assert.match(designerSource, /if \(uploadKind === "saved-png"\) \{/);
  assert.match(designerSource, /await resumeDesignFromPng\(file\)/);
  assert.match(designerSource, /if \(uploadKind === "project"\) \{\s*await importProjectFile\(file\)/);
});

test("admin-generated SVG text imports as editable Fabric text", () => {
  assert.match(designerSource, /new fabric\.IText\(obj\.text \|\| "", textOptions\)/);
  assert.match(designerSource, /dataName: element\.getAttribute\("data-name"\)/);
  assert.match(designerSource, /dataRole: element\.getAttribute\("data-role"\)/);
  assert.match(designerSource, /if \(savedDesignId\) \{\s*activeDesignId = savedDesignId;/);
});
