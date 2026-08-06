import assert from "node:assert/strict";
import test from "node:test";
import {
  backupFilePath,
  createSubmissionId,
  createSubmissionSessionToken,
  normalizeBackupFields,
  normalizeBackupFiles,
  safeSubmissionId,
  verifySubmissionSessionToken
} from "../lib/custom-order-backup";

process.env.CUSTOM_ORDER_BACKUP_SECRET = "test-only-custom-order-backup-secret";

test("creates a scoped Submission ID and expiring upload session", () => {
  const now = 1_785_999_000_000;
  const id = createSubmissionId(now);
  const token = createSubmissionSessionToken(id, now);

  assert.match(id, /^submission_1785999000000_[a-f0-9]{16}$/);
  assert.equal(safeSubmissionId(id), id);
  assert.equal(verifySubmissionSessionToken(id, token, now + 60_000), true);
  assert.equal(verifySubmissionSessionToken(id, `${token}changed`, now + 60_000), false);
  assert.equal(verifySubmissionSessionToken(id, token, now + 25 * 60 * 60 * 1000), false);
});

test("normalizes customer fields without losing fulfillment data", () => {
  const fields = normalizeBackupFields([
    { key: "Team / logo name", value: "TSB QA CUSTOM FORM" },
    { key: "Player Name 1", value: "Sia" },
    { key: "Player Name 2", value: "Simba" },
    { key: "Coach", value: "Si" },
    { key: "Team Mom/Dad", value: "Doan" },
    { key: "Empty", value: "" }
  ]);

  assert.equal(fields.length, 5);
  assert.deepEqual(fields.map((field) => field.value), ["TSB QA CUSTOM FORM", "Sia", "Simba", "Si", "Doan"]);
});

test("accepts only files owned by the matching backup path", () => {
  const id = "submission_1785999000000_0123456789abcdef";
  const pathname = backupFilePath(id, 0, "Team Logo QA.jpg");
  const files = normalizeBackupFiles(id, [
    {
      fieldKey: "Team Logo",
      name: "Team Logo QA.jpg",
      pathname,
      url: `https://example.public.blob.vercel-storage.com/${pathname}`,
      downloadUrl: `https://example.public.blob.vercel-storage.com/${pathname}?download=1`,
      contentType: "image/jpeg",
      size: 2048
    },
    {
      fieldKey: "Wrong path",
      name: "bad.jpg",
      pathname: "team-banner-custom-orders/submission_1785999000000_ffffffffffffffff/files/bad.jpg",
      url: "https://example.public.blob.vercel-storage.com/bad.jpg"
    }
  ]);

  assert.equal(files.length, 1);
  assert.equal(files[0].fieldKey, "Team Logo");
  assert.equal(files[0].size, 2048);
});

