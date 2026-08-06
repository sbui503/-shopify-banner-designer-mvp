import assert from "node:assert/strict";
import test from "node:test";
import { svgContentDisposition, svgDownloadRequested } from "../lib/design-svg-response.js";

test("keeps layered SVG inline for browser preview", () => {
  assert.equal(svgDownloadRequested(undefined), false);
  assert.equal(
    svgContentDisposition("design_1785967422785_ldh7omtg", undefined),
    'inline; filename="design_1785967422785_ldh7omtg.svg"'
  );
});

test("forces an SVG file download for Illustrator", () => {
  assert.equal(svgDownloadRequested("1"), true);
  assert.equal(svgDownloadRequested("true"), true);
  assert.equal(
    svgContentDisposition("design_1785967422785_ldh7omtg", "1"),
    'attachment; filename="design_1785967422785_ldh7omtg.svg"'
  );
});
