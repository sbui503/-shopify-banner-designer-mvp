import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const designer = await readFile(new URL("../public/team-banner-designer.js", import.meta.url), "utf8");

assert.match(designer, /let mobileTextTarget = null;/,
  "mobile text editing must retain its selected Fabric text object");
assert.match(designer, /document\.activeElement === els\.mobileTextInput[\s\S]*canvas\.getObjects\(\)\.includes\(mobileTextTarget\)/,
  "the retained text object must only be reused while the mobile field is focused and the object still exists");
assert.match(designer, /layerRole\(obj\) === "template-year-text"[\s\S]*toLowerCase\(\) === "year"/,
  "only the default Year placeholder may clear on tap");
assert.doesNotMatch(designer, /template-team-name[^\n]*placeholder|team-text[^\n]*placeholder/i,
  "team text must never be handled as a disposable placeholder");
assert.match(designer, /const obj = editableMobileTextObject\(\);[\s\S]*obj\.set\(\{ text: nextText \}\)/,
  "mobile input must update the retained text object after the keyboard takes focus");

console.log("Mobile team text regression checks passed.");
