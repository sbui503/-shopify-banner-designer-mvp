import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const utilitySource = await readFile(
  new URL("../public/illustrator-svg.js", import.meta.url),
  "utf8"
);
const designerSource = await readFile(
  new URL("../public/team-banner-designer.js", import.meta.url),
  "utf8"
);

const context = vm.createContext({ globalThis: {} });
vm.runInContext(utilitySource, context);
const illustratorSvg = context.globalThis.TeamBannerIllustratorSvg;

test("creates unique Illustrator layer names and distinguishes raster objects", () => {
  const descriptors = illustratorSvg.layerDescriptors([
    { name: "Background", type: "image", role: "template-background" },
    { name: "Player", type: "i-text", role: "template-player-text" },
    { name: "Player", type: "path" }
  ]);

  assert.equal(descriptors.length, 3);
  assert.equal(descriptors[0].kind, "embedded-raster");
  assert.equal(descriptors[1].kind, "editable-vector");
  assert.equal(descriptors[1].name, "Player");
  assert.notEqual(descriptors[1].id, descriptors[2].id);
  assert.match(descriptors[0].id, /^Layer_001_Background$/);
});

test("save pipeline applies Illustrator layer metadata before SVG upload", () => {
  assert.match(designerSource, /illustratorSvg\.applyLayerMetadata\(documentNode, layers\)/);
  assert.match(designerSource, /selfContainedSvg\(source\.svg, layers\)/);
  assert.match(designerSource, /illustratorLayered: layers\.length > 0/);
});
