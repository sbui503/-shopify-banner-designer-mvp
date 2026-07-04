import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const MANIFESTS = [
  {
    label: "public hosted manifest",
    path: "public/team-banner-assets.shopify.json"
  },
  {
    label: "theme asset manifest",
    path: "shopify-banner-designer/assets/team-banner-assets.shopify.json"
  },
  {
    label: "app extension asset manifest",
    path: "shopify-banner-designer-app/extensions/team-banner-designer/assets/team-banner-assets.shopify.json"
  }
];

const EXPECTED_SOURCE_TYPES = [
  "accessory",
  "bg_hem_grommets",
  "bg_home_plate",
  "bg_pole_pocket",
  "bg_triangle",
  "clipart",
  "teamname"
];

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const LEGACY_REFERENCE = /sv\.lct\.vn\/crud\/find|teambannersports\.com\/design-tool\/\?m=5/i;

function readManifest({ label, path }) {
  const text = fs.readFileSync(path, "utf8");
  const manifest = JSON.parse(text);
  const assets = manifest.assets;
  assert.ok(Array.isArray(assets), `${label} exposes assets[]`);
  return { label, path, text, manifest, assets };
}

function assetBySourceId(assets) {
  return new Map(assets.map((asset) => [String(asset.sourceId), asset]));
}

function comparableAsset(asset) {
  return {
    name: asset.name,
    category: asset.category,
    url: asset.url,
    svgUrl: asset.svgUrl,
    sourceType: asset.sourceType,
    role: asset.role,
    storage: asset.storage
  };
}

const manifests = MANIFESTS.map(readManifest);

test("Vercel Blob manifest metadata is present on every deploy copy", () => {
  for (const { label, text, manifest, assets } of manifests) {
    assert.doesNotMatch(text, LEGACY_REFERENCE, `${label} does not leak the legacy asset API`);
    assert.equal(manifest.source, "Vercel Blob asset backups", `${label} declares the Blob backup source`);
    assert.equal(Object.hasOwn(manifest, "sourceApi"), false, `${label} omits internal sourceApi`);
    assert.equal(manifest.assetCount, assets.length, `${label} assetCount matches assets[] length`);
    assert.equal(manifest.totalFromApi, assets.length, `${label} totalFromApi matches deployable assets`);
    assert.equal(manifest.uncategorizedCount, 0, `${label} keeps all assets categorized`);
    assert.ok(manifest.droppedLegacyAssetCount > 0, `${label} records that legacy asset references were dropped`);
    assert.equal(
      manifest.blobRewrite?.source,
      "team-banner-design-tool-blob-asset-backups.json",
      `${label} records the Blob backup rewrite source`
    );
    assert.match(
      manifest.blobRewrite?.reason || "",
      /legacy asset references/i,
      `${label} documents why the Blob rewrite exists`
    );

    const typeTotal = Object.values(manifest.typeCounts || {}).reduce((sum, count) => sum + count, 0);
    assert.equal(typeTotal, assets.length, `${label} typeCounts sum to the asset count`);
    for (const sourceType of EXPECTED_SOURCE_TYPES) {
      assert.ok(manifest.typeCounts?.[sourceType] > 0, `${label} includes ${sourceType} assets`);
    }
  }
});

test("every asset uses unique IDs, required tags, and Vercel Blob URLs", () => {
  for (const { label, assets } of manifests) {
    const sourceIds = new Set();
    const failures = [];

    for (const [index, asset] of assets.entries()) {
      const sourceId = String(asset.sourceId || "");
      if (!sourceId) {
        failures.push(`#${index}: missing sourceId`);
        continue;
      }
      if (sourceIds.has(sourceId)) failures.push(`${sourceId}: duplicate sourceId`);
      sourceIds.add(sourceId);

      for (const field of ["name", "category", "url", "svgUrl", "sourceType", "role"]) {
        if (!asset[field]) failures.push(`${sourceId}: missing ${field}`);
      }

      if (asset.storage !== "vercel-blob") failures.push(`${sourceId}: storage is ${asset.storage}`);

      const tags = Array.isArray(asset.assetTags) ? asset.assetTags : [];
      for (const tag of ["tbd:design-tool-asset", `tbd:asset-id:${sourceId}`, `tbd:asset-role:${asset.role}`]) {
        if (!tags.includes(tag)) failures.push(`${sourceId}: missing tag ${tag}`);
      }

      for (const field of ["url", "svgUrl"]) {
        try {
          const url = new URL(asset[field]);
          if (url.protocol !== "https:") failures.push(`${sourceId}: ${field} is not https`);
          if (!url.hostname.endsWith(BLOB_HOST_SUFFIX)) failures.push(`${sourceId}: ${field} is not a Blob URL`);
          if (!url.pathname.startsWith("/team-banner-assets/")) {
            failures.push(`${sourceId}: ${field} is outside /team-banner-assets/`);
          }
        } catch {
          failures.push(`${sourceId}: ${field} is not an absolute URL`);
        }
      }
    }

    assert.deepEqual(failures.slice(0, 20), [], `${label} has invalid assets`);
    assert.equal(sourceIds.size, assets.length, `${label} source IDs are unique`);
  }
});

test("theme and app-extension manifests deploy the same asset set as the hosted manifest", () => {
  const [hostedManifest, ...deployManifests] = manifests;
  const hostedAssets = assetBySourceId(hostedManifest.assets);

  for (const { label, assets } of deployManifests) {
    const deployAssets = assetBySourceId(assets);
    assert.deepEqual([...deployAssets.keys()].sort(), [...hostedAssets.keys()].sort(), `${label} source IDs match hosted manifest`);

    const mismatches = [];
    for (const [sourceId, hostedAsset] of hostedAssets) {
      const deployAsset = deployAssets.get(sourceId);
      if (!deployAsset) continue;
      try {
        assert.deepEqual(comparableAsset(deployAsset), comparableAsset(hostedAsset));
      } catch {
        mismatches.push(sourceId);
      }
    }

    assert.deepEqual(mismatches.slice(0, 20), [], `${label} asset URLs and routing fields match hosted manifest`);
  }
});
