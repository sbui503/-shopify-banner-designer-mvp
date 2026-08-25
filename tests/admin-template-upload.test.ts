import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdminTemplateDesignerUrl,
  isAllowedAdminTemplateSourceUrl,
  normalizeAdminTemplateDraft,
  validateAdminTemplateSvg
} from "../lib/admin-template";

const LAYERED_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 1500 900">
  <g inkscape:groupmode="layer" id="layer-background"><rect width="1500" height="900" fill="#ffffff" /></g>
  <g inkscape:groupmode="layer" id="layer-name"><text x="100" y="100">Player</text></g>
</svg>`;

test("validates a layered editable SVG template", () => {
  assert.deepEqual(validateAdminTemplateSvg(LAYERED_SVG), {
    objectCount: 4,
    layerCount: 2,
    imageCount: 0,
    textCount: 1,
    vectorObjectCount: 1
  });
});

test("rejects flattened and executable SVG templates", () => {
  assert.throws(
    () => validateAdminTemplateSvg('<svg viewBox="0 0 10 10"><image href="proof.png" /></svg>'),
    /at least two editable objects|flattened image/
  );
  assert.throws(
    () => validateAdminTemplateSvg('<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" /></svg>'),
    /unsafe executable markup/
  );
});

test("normalizes admin template fields", () => {
  assert.deepEqual(normalizeAdminTemplateDraft({
    title: "  Test 7 Soccer Template  ",
    sport: "soccer",
    bannerType: "Pole Pocket",
    playerCount: "12",
    photoFrame: "true"
  }), {
    title: "Test 7 Soccer Template",
    sport: "Soccer",
    bannerType: "Pole Pocket",
    playerCount: 12,
    photoFrame: true
  });
});

test("allows owned SVG URLs and builds the customer designer verification URL", () => {
  const sourceUrl = "https://example.public.blob.vercel-storage.com/templates/test-7.svg";
  assert.equal(isAllowedAdminTemplateSourceUrl(sourceUrl), true);
  assert.equal(isAllowedAdminTemplateSourceUrl("https://example.com/private.svg"), false);
  const url = new URL(buildAdminTemplateDesignerUrl({
    title: "Test 7 Soccer Template",
    sport: "Soccer",
    bannerType: "Pole Pocket",
    playerCount: 12,
    sourceUrl
  }));
  assert.equal(url.origin, "https://teamsportbanners.vercel.app");
  assert.equal(url.searchParams.get("templateSvg"), sourceUrl);
  assert.equal(url.searchParams.get("productShape"), "polepocket");
  assert.equal(url.searchParams.get("autoLayer"), "svg");
  assert.equal(url.searchParams.get("panel"), "layers");
});
