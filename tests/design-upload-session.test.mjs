import assert from "node:assert/strict";
import test from "node:test";
import {
  createDesignId,
  createDesignUploadToken,
  designArtifact,
  safeDesignId,
  verifyDesignUploadToken
} from "../lib/design-upload-session.js";

process.env.DESIGN_UPLOAD_SECRET = "test-only-design-upload-secret";

test("creates a stable Design ID and exact artifact paths", () => {
  const id = createDesignId(1787544000000, 0.123456789);
  assert.match(id, /^design_1787544000000_[a-z0-9]{8}$/);
  assert.equal(safeDesignId(id), id);
  assert.equal(designArtifact(id, "proof")?.pathname, `team-banner-designs/${id}.png`);
  assert.equal(designArtifact(id, "editable")?.pathname, `team-banner-designs/${id}.json`);
  assert.equal(designArtifact(id, "source")?.pathname, `team-banner-designs/${id}.svg`);
});

test("accepts only an unexpired token for the matching Design ID", () => {
  const now = 1787544000000;
  const id = "design_1787544000000_ab12cd34";
  const token = createDesignUploadToken(id, now);
  assert.equal(verifyDesignUploadToken(id, token, now + 30_000), true);
  assert.equal(verifyDesignUploadToken("design_1787544000000_ef56gh78", token, now + 30_000), false);
  assert.equal(verifyDesignUploadToken(id, token, now + 61 * 60 * 1000), false);
});
