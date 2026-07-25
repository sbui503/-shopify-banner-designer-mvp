import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, designer] = await Promise.all([
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/team-banner-designer.js", import.meta.url), "utf8")
]);

const mobileBar = html.match(/<div class="tbd__mobile-bottombar"[\s\S]*?<\/div>/)?.[0] || "";

assert.match(mobileBar, /data-tbd-undo/, "mobile arrange bar must expose Undo");
assert.match(mobileBar, /data-tbd-redo/, "mobile arrange bar must expose Redo");
assert.doesNotMatch(mobileBar, /data-tbd-rotate/, "mobile Undo/Redo must not rotate the selection");

assert.match(designer, /role === "template-player-text" && text === "player"/,
  "Player placeholders must be identified for safe replacement");
assert.match(designer, /role === "template-year-text" && text === "year"/,
  "Year placeholders must clear on first edit");
assert.match(designer, /placeholderRole === "template-player-text"\) \{\s*return;/,
  "Player text must remain visible with a normal Android keyboard caret");
assert.doesNotMatch(designer, /placeholderRole === "template-player-text"[\s\S]{0,160}event\.target\.select\(\)/,
  "Android Backspace must not clear a fully selected Player placeholder");
assert.match(designer, /placeholderRole !== "template-year-text"\) return;/,
  "the destructive clear path must be limited to Year text");
assert.match(designer, /config\.role === "template-player-text" \? 12 : 0/,
  "small Player labels must have a larger mobile tap target");
assert.match(designer, /placeholderCleared: true/,
  "custom Player or Year text must not be cleared again");
assert.match(designer, /event\.target\.closest\("\.tbd__lock"\)/,
  "layer lock events must not select or close the layer drawer");
assert.match(designer, /strokeOpacities\.forEach\(\(control\) => control\.addEventListener\("input", \(event\) => applyStrokeSelection/,
  "stroke opacity controls must update the selected object");
assert.match(designer, /stroke: strokeWithOpacity\(color, opacity\)/,
  "stroke opacity must be serialized into the Fabric stroke");
assert.match(designer, /event\.defaultPrevented \|\| isTextEditingKeyboardEvent\(event\)/,
  "Android text keyboard events must not reach canvas Delete shortcuts");

console.log("Android editor control regression checks passed.");
