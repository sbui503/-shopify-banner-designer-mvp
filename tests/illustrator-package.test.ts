import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, unzipSync } from "fflate";
import {
  analyzeSvgArtwork,
  extractSvgFontFamilies,
  illustratorLayerScript,
  packageReadme,
  zipPackageFiles
} from "../lib/illustrator-package";

test("classifies vector, mixed, and flattened SVG artwork honestly", () => {
  assert.equal(analyzeSvgArtwork('<svg><path d="M0 0"/><text>Team</text></svg>').classification, "vector");
  assert.equal(analyzeSvgArtwork('<svg><image href="photo.png"/><text>Player</text></svg>').classification, "mixed");
  assert.equal(analyzeSvgArtwork('<svg><image href="flat.png"/></svg>').classification, "flattened");
});

test("lists SVG fonts without duplicate names", () => {
  const svg = '<svg><text font-family="Anton, sans-serif">A</text><text style="font-family: Anton">B</text></svg>';
  assert.deepEqual(extractSvgFontFamilies(svg), ["Anton", "sans-serif"]);
});

test("Illustrator helper promotes groups to layers and saves an AI file", () => {
  const script = illustratorLayerScript();
  assert.match(script, /documentRef\.layers\.add\(\)/);
  assert.match(script, /group\.move\(layer, ElementPlacement\.PLACEATBEGINNING\)/);
  assert.match(script, /new IllustratorSaveOptions\(\)/);
  assert.match(script, /documentRef\.saveAs\(outputFile, saveOptions\)/);
});

test("package README explains mixed artwork and missing outlined source", () => {
  const readme = packageReadme({
    designId: "design_1787637174803_je4b2ska",
    productTitle: "Airborne Soccer Banner",
    classification: "mixed",
    layerCount: 18,
    hasOutlinedPrintSource: false,
    hasProof: true
  });
  assert.match(readme, /Artwork classification: MIXED/);
  assert.match(readme, /Raster photos and logos remain raster/);
  assert.match(readme, /No verified outlined print source was stored/);
});

test("builds a readable ZIP with production package files", () => {
  const archive = zipPackageFiles({
    "README.txt": strToU8("Production package\n"),
    "editable-design.svg": strToU8("<svg/>")
  });
  const files = unzipSync(archive);
  assert.deepEqual(Object.keys(files).sort(), ["README.txt", "editable-design.svg"]);
  assert.equal(strFromU8(files["README.txt"]), "Production package\n");
});
