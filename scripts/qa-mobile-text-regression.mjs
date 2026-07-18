import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const designer = await readFile(new URL("../public/team-banner-designer.js", import.meta.url), "utf8");

assert.match(designer, /let mobileTextTarget = null;/,
  "mobile text editing must retain its selected Fabric text object");
assert.match(designer, /document\.activeElement === els\.mobileTextInput[\s\S]*canvas\.getObjects\(\)\.includes\(mobileTextTarget\)/,
  "the retained text object must only be reused while the mobile field is focused and the object still exists");
assert.match(designer, /role === "template-player-text" && text === "player"/,
  "Player placeholders must be identified without clearing their canvas text");
assert.match(designer, /placeholderRole === "template-player-text"[\s\S]*event\.target\.select\(\);[\s\S]*return;/,
  "tapping a default Player field must select its text for replacement instead of blanking it");
assert.match(designer, /placeholderRole !== "template-year-text"\) return;/,
  "only Year placeholders may use the clear-on-focus behavior");
assert.match(designer, /config\.role === "template-player-text" \? 12 : 0/,
  "Player text must expose a larger invisible tap target on mobile");
assert.match(designer, /placeholderCleared: true/,
  "edited Player and Year placeholders must not reset again");
assert.doesNotMatch(designer, /template-team-name[^\n]*placeholder|team-text[^\n]*placeholder/i,
  "team text must never be handled as a disposable placeholder");
assert.match(designer, /const obj = editableMobileTextObject\(\);[\s\S]*const nextText = event\.target\.value \|\| " ";[\s\S]*obj\.set\(updates\)/,
  "mobile input must update the retained text object after the keyboard takes focus");

console.log("Mobile text regression checks passed.");
