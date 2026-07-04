import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATHS = [
  "public/team-banner-assets.shopify.json",
  "shopify-banner-designer/assets/team-banner-assets.shopify.json",
  "shopify-banner-designer-app/extensions/team-banner-designer/assets/team-banner-assets.shopify.json"
];
const REQUIRED_SOURCE_TYPES = [
  "bg_pole_pocket",
  "bg_hem_grommets",
  "bg_triangle",
  "bg_home_plate",
  "clipart",
  "accessory",
  "teamname"
];
const LEGACY_ENDPOINT_PATTERN = /sourceApi|sv\.lct\.vn|teambannersports\.com\/design-tool\/\?m=5/i;

function readManifest(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function assertBlobAsset(asset, index) {
  assert.equal(asset.storage, "vercel-blob", `asset ${index} should use Vercel Blob storage`);
  assert.match(asset.url, /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//, `asset ${index} url should be a public Vercel Blob URL`);
  assert.match(asset.svgUrl, /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//, `asset ${index} svgUrl should be a public Vercel Blob URL`);
  assert.ok(asset.sourceId, `asset ${index} should keep a sourceId for dedupe`);
  assert.ok(asset.sourceType, `asset ${index} should keep its sourceType`);
  assert.ok(asset.role, `asset ${index} should keep its role`);
  assert.ok(Array.isArray(asset.assetTags), `asset ${index} should include Shopify file tags`);
  assert.ok(asset.assetTags.includes("tbd:design-tool-asset"), `asset ${index} should include the design-tool tag`);
  assert.ok(asset.assetTags.includes(`tbd:asset-source-type:${asset.sourceType}`), `asset ${index} should tag its sourceType`);
  assert.ok(asset.assetTags.includes(`tbd:asset-id:${asset.sourceId}`), `asset ${index} should tag its sourceId`);
}

test("Shopify asset manifests use Vercel Blob backups without legacy API metadata", () => {
  const manifests = MANIFEST_PATHS.map((relativePath) => [relativePath, readManifest(relativePath)]);
  const publicManifest = manifests[0][1];
  const publicIds = publicManifest.assets.map((asset) => String(asset.sourceId));
  const publicIdSet = [...new Set(publicIds)].sort();

  assert.equal(publicManifest.source, "Vercel Blob asset backups");
  assert.equal(publicManifest.assetCount, publicManifest.assets.length);
  assert.equal(publicManifest.totalFromApi, publicManifest.assets.length);
  assert.equal(new Set(publicIds).size, publicIds.length, "public manifest sourceIds should be unique");

  for (const sourceType of REQUIRED_SOURCE_TYPES) {
    assert.ok(publicManifest.typeCounts[sourceType] > 0, `expected source type ${sourceType}`);
  }
  assert.equal(
    Object.values(publicManifest.typeCounts).reduce((total, count) => total + count, 0),
    publicManifest.assets.length,
    "typeCounts should add up to assetCount"
  );

  for (const [relativePath, manifest] of manifests) {
    const serialized = JSON.stringify(manifest);
    assert.doesNotMatch(serialized, LEGACY_ENDPOINT_PATTERN, `${relativePath} should not expose legacy API metadata`);
    assert.equal(manifest.source, "Vercel Blob asset backups", `${relativePath} should identify Blob backups as source`);
    assert.equal(manifest.assetCount, publicManifest.assetCount, `${relativePath} should keep the same asset count`);
    assert.equal(manifest.assets.length, publicManifest.assets.length, `${relativePath} should keep all assets`);
    assert.deepEqual(manifest.typeCounts, publicManifest.typeCounts, `${relativePath} should keep type count parity`);

    const ids = manifest.assets.map((asset) => String(asset.sourceId));
    assert.deepEqual([...new Set(ids)].sort(), publicIdSet, `${relativePath} should keep sourceId parity with the public manifest`);
    manifest.assets.forEach(assertBlobAsset);
  }
});
