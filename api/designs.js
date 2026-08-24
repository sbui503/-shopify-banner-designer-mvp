import { copy, list, put } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";
import {
  createDesignId,
  createDesignUploadToken,
  designArtifact,
  verifyDesignUploadToken
} from "../lib/design-upload-session.js";
import { designSvgUrl, fulfillmentLookupUrl } from "../lib/fulfillment-url.js";
import { inlineSvgImages } from "../lib/inline-svg-images.js";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_RECENT_DESIGNS = 100;

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parsePngDataUrl(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(value || "");
  return match ? Buffer.from(match[1], "base64") : null;
}

function parseSvg(value) {
  const svg = String(value || "").trim();
  return /<svg(?:\s|>)/i.test(svg) ? svg : "";
}

function cleanString(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function designObjects(value) {
  if (Array.isArray(value?.objects)) return value.objects;
  if (Array.isArray(value?.canvas?.objects)) return value.canvas.objects;
  return [];
}

function designLayers(objects) {
  return objects
    .map((object, index) => ({ object, index }))
    .slice(0, 500)
    .map(({ object, index }) => ({
      id: cleanString(object.id, 100) || `layer-${index + 1}`,
      name: cleanString(object.name || object.sourceName || object.data?.name, 160) || `Artwork ${index + 1}`,
      role: cleanString(object.role || object.data?.role, 100),
      type: cleanString(object.type, 100),
      text: cleanString(object.text || object.value, 1000),
      data: {
        name: cleanString(object.data?.name, 160),
        role: cleanString(object.data?.role, 100)
      }
    }));
}

function normalizedMetadata(payload) {
  const metadata = payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const rawProduct = metadata.product && typeof metadata.product === "object" ? metadata.product : {};
  const rawArtboard = metadata.artboard && typeof metadata.artboard === "object" ? metadata.artboard : {};
  return {
    savedAt: cleanString(metadata.savedAt, 80) || new Date().toISOString(),
    teamName: cleanString(metadata.teamName, 240),
    parentDesignId: safeDesignId(metadata.parentDesignId),
    product: {
      title: cleanString(rawProduct.title, 240),
      handle: cleanString(rawProduct.handle, 240),
      headline: cleanString(rawProduct.headline, 240),
      sizeLabel: cleanString(rawProduct.sizeLabel, 120),
      price: cleanString(rawProduct.price, 80)
    },
    artboard: {
      width: cleanNumber(rawArtboard.width),
      height: cleanNumber(rawArtboard.height),
      shape: cleanString(rawArtboard.shape, 80),
      backgroundColor: cleanString(rawArtboard.backgroundColor, 80)
    }
  };
}

function cleanSourceStats(value, layers) {
  const stats = value && typeof value === "object" ? value : {};
  const textLayerCount = layers.filter((layer) => cleanString(layer.text)).length;
  return {
    objectCount: Math.max(0, Number.parseInt(stats.objectCount, 10) || 0),
    imageCount: Math.max(0, Number.parseInt(stats.imageCount, 10) || 0),
    rasterImageCount: Math.max(0, Number.parseInt(stats.rasterImageCount, 10) || 0),
    vectorObjectCount: Math.max(0, Number.parseInt(stats.vectorObjectCount, 10) || 0),
    namedLayerCount: Math.max(0, Number.parseInt(stats.namedLayerCount, 10) || 0),
    textCount: Math.max(0, Number.parseInt(stats.textCount, 10) || textLayerCount),
    layered: Boolean(stats.layered),
    illustratorLayered: Boolean(stats.illustratorLayered)
  };
}

function blobDownloadUrl(blob) {
  return blob?.downloadUrl || blob?.url || "";
}

async function finalizeDirectDesign(request, payload) {
  const id = safeDesignId(payload.id);
  if (!id || !verifyDesignUploadToken(id, payload.uploadToken)) {
    throw new Error("Design save authorization expired. Please save again.");
  }

  const artifactPaths = {
    proof: designArtifact(id, "proof")?.pathname,
    editable: designArtifact(id, "editable")?.pathname,
    source: designArtifact(id, "source")?.pathname
  };
  const result = await list({ prefix: `team-banner-designs/${id}.`, limit: 20 });
  const blobs = Array.isArray(result.blobs) ? result.blobs : [];
  const artifacts = Object.fromEntries(Object.entries(artifactPaths).map(([kind, pathname]) => [
    kind,
    blobs.find((blob) => blob.pathname === pathname)
  ]));
  if (!artifacts.proof || !artifacts.editable || !artifacts.source) {
    throw new Error("One or more saved design files did not finish uploading. Please retry.");
  }

  const metadata = normalizedMetadata(payload);
  const layers = designLayers(Array.isArray(payload.layers) ? payload.layers : []);
  const sourceSvgStats = cleanSourceStats(payload.sourceSvgStats, layers);
  const backupPrefix = `team-banner-design-backups/${id}`;
  const [backupProof, backupEditable, backupSource] = await Promise.all([
    copy(artifacts.proof.url, `${backupPrefix}/proof.png`, {
      access: "public",
      contentType: "image/png",
      allowOverwrite: true
    }),
    copy(artifacts.editable.url, `${backupPrefix}/design.json`, {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true
    }),
    copy(artifacts.source.url, `${backupPrefix}/source.svg`, {
      access: "public",
      contentType: "image/svg+xml",
      allowOverwrite: true
    })
  ]);

  const manifest = {
    version: 2,
    savePipeline: "direct-artifact-upload",
    id,
    savedAt: metadata.savedAt,
    previewUrl: artifacts.proof.url,
    jsonUrl: artifacts.editable.url,
    sourceSvgUrl: artifacts.source.url,
    sourceSvgBlobUrl: artifacts.source.url,
    sourceSvgDownloadUrl: blobDownloadUrl(artifacts.source),
    printSourceUrl: blobDownloadUrl(artifacts.source),
    lookupUrl: fulfillmentLookupUrl(id),
    productTitle: metadata.product.title,
    productHandle: metadata.product.handle,
    teamName: metadata.teamName,
    parentDesignId: metadata.parentDesignId,
    product: metadata.product,
    artboard: metadata.artboard,
    layers,
    sourceSvgStats,
    artifactSizes: {
      proof: artifacts.proof.size || cleanNumber(payload?.artifactSizes?.proof) || 0,
      editable: artifacts.editable.size || cleanNumber(payload?.artifactSizes?.editable) || 0,
      source: artifacts.source.size || cleanNumber(payload?.artifactSizes?.source) || 0
    },
    backupStatus: "complete",
    backup: {
      previewUrl: backupProof.url,
      jsonUrl: backupEditable.url,
      sourceSvgUrl: backupSource.url,
      sourceSvgDownloadUrl: blobDownloadUrl(backupSource)
    }
  };
  const backupManifestBlob = await put(`${backupPrefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
  manifest.backupManifestUrl = backupManifestBlob.url;
  const manifestBlob = await put(`team-banner-designs/${id}.manifest.json`, JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });

  return {
    ...manifest,
    manifestUrl: manifestBlob.url,
    uploadCompleted: true,
    requestOrigin: requestOrigin(request)
  };
}

function safeDesignId(value) {
  const clean = String(value || "").trim();
  return /^design_[0-9]+_[a-z0-9]+$/i.test(clean) ? clean : "";
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length
    && leftBuffer.length > 0
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function requestAdminKey(request) {
  const authorization = String(request.headers.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  return String(request.headers["x-tsb-admin-key"] || bearer).trim();
}

function canListDesigns(request) {
  const configured = String(process.env.TEAM_BANNER_API_KEY || "").trim();
  return Boolean(configured) && safeEqual(requestAdminKey(request), configured);
}

function requestOrigin(request) {
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "teamsportbanners.vercel.app").split(",")[0].trim();
  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${protocol}://${host}`;
}

async function readStoredDesign(request, id) {
  const result = await list({
    prefix: `team-banner-designs/${id}`,
    limit: 20
  });
  const blobs = Array.isArray(result.blobs) ? result.blobs : [];
  const sourceSvg = blobs.find((blob) => /\.svg$/i.test(blob.pathname));
  const manifestBlob = blobs.find((blob) => /(?:^|[.-])manifest(?:-[a-z0-9]+)?\.json$/i.test(blob.pathname));
  const preview = blobs.find((blob) => /\.png$/i.test(blob.pathname));
  const editableJson = blobs.find((blob) => /\.json$/i.test(blob.pathname) && blob !== manifestBlob);
  if (manifestBlob) {
    const manifestResponse = await fetch(manifestBlob.url, { cache: "no-store" });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      return {
        ...manifest,
        id,
        previewUrl: preview?.url || manifest.previewUrl || "",
        jsonUrl: editableJson?.url || manifest.jsonUrl || "",
        lookupUrl: fulfillmentLookupUrl(id),
        sourceSvgUrl: manifest.sourceSvgUrl || (sourceSvg ? designSvgUrl(requestOrigin(request), id) : ""),
        sourceSvgBlobUrl: sourceSvg?.url || manifest.sourceSvgBlobUrl || manifest.sourceSvgUrl || "",
        sourceSvgDownloadUrl: manifest.sourceSvgDownloadUrl || blobDownloadUrl(sourceSvg),
        printSourceUrl: manifest.printSourceUrl || manifest.sourceSvgDownloadUrl || blobDownloadUrl(sourceSvg),
        manifestUrl: manifest.manifestUrl || manifestBlob.url
      };
    }
  }

  if (!preview && !editableJson && !sourceSvg) return null;

  return {
    id,
    previewUrl: preview?.url || "",
    jsonUrl: editableJson?.url || "",
    sourceSvgUrl: sourceSvg ? designSvgUrl(requestOrigin(request), id) : "",
    sourceSvgBlobUrl: sourceSvg?.url || "",
    sourceSvgDownloadUrl: blobDownloadUrl(sourceSvg),
    printSourceUrl: blobDownloadUrl(sourceSvg),
    manifestUrl: manifestBlob?.url || "",
    lookupUrl: fulfillmentLookupUrl(id)
  };
}

function designIdFromManifestPath(pathname) {
  return safeDesignId(String(pathname || "").match(/(design_[0-9]+_[a-z0-9]+)\.manifest\.json$/i)?.[1]);
}

function designIdFromBlobPath(pathname) {
  return safeDesignId(String(pathname || "").match(/(design_[0-9]+_[a-z0-9]+)(?:[./]|$)/i)?.[1]);
}

async function readRecentDesigns(request, limit) {
  const allBlobs = [];
  let cursor;

  do {
    const result = await list({
      prefix: "team-banner-designs/",
      cursor,
      limit: 1000
    });
    allBlobs.push(...(result.blobs || []));
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  const groups = new Map();
  allBlobs.forEach((blob) => {
    const id = designIdFromBlobPath(blob.pathname);
    if (!id) return;
    const group = groups.get(id) || { id, blobs: [], uploadedAt: blob.uploadedAt };
    group.blobs.push(blob);
    if (new Date(blob.uploadedAt).getTime() > new Date(group.uploadedAt).getTime()) group.uploadedAt = blob.uploadedAt;
    groups.set(id, group);
  });

  const selected = [...groups.values()]
    .sort((left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime())
    .slice(0, limit);

  return (await Promise.all(selected.map(async (group) => {
    const manifestBlob = group.blobs.find((blob) => /\.manifest\.json$/i.test(blob.pathname));
    const previewBlob = group.blobs.find((blob) => /\.png$/i.test(blob.pathname));
    const jsonBlob = group.blobs.find((blob) => /\.json$/i.test(blob.pathname) && blob !== manifestBlob);
    const svgBlob = group.blobs.find((blob) => /\.svg$/i.test(blob.pathname));
    let manifest = {};
    if (manifestBlob) {
      const manifestResponse = await fetch(manifestBlob.url, { cache: "no-store" });
      if (manifestResponse.ok) manifest = await manifestResponse.json();
    }
    const id = safeDesignId(manifest.id) || group.id || designIdFromManifestPath(manifestBlob?.pathname);
    return {
      ...manifest,
      id,
      savedAt: manifest.savedAt || group.uploadedAt,
      previewUrl: manifest.previewUrl || previewBlob?.url || "",
      jsonUrl: manifest.jsonUrl || jsonBlob?.url || "",
      sourceSvgUrl: manifest.sourceSvgUrl || (svgBlob ? designSvgUrl(requestOrigin(request), id) : ""),
      sourceSvgBlobUrl: svgBlob?.url || manifest.sourceSvgBlobUrl || "",
      sourceSvgDownloadUrl: manifest.sourceSvgDownloadUrl || blobDownloadUrl(svgBlob),
      printSourceUrl: manifest.printSourceUrl || manifest.sourceSvgDownloadUrl || blobDownloadUrl(svgBlob),
      manifestUrl: manifest.manifestUrl || manifestBlob?.url || "",
      lookupUrl: fulfillmentLookupUrl(id)
    };
  }))).filter(Boolean);
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-TSB-Admin-Key");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method === "GET") {
    const recent = Number.parseInt(String(request.query?.recent || ""), 10);
    if (Number.isFinite(recent) && recent > 0) {
      if (!process.env.TEAM_BANNER_API_KEY) {
        response.status(503).json({ error: "Protected design feed is not configured." });
        return;
      }
      if (!canListDesigns(request)) {
        response.status(401).json({ error: "Authentication required." });
        return;
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        response.status(503).json({ error: "Design storage is not configured." });
        return;
      }
      try {
        const limit = Math.min(Math.max(recent, 1), MAX_RECENT_DESIGNS);
        const designs = await readRecentDesigns(request, limit);
        response.setHeader("Cache-Control", "private, no-store, max-age=0");
        response.status(200).json({ designs, count: designs.length });
      } catch (error) {
        response.status(400).json({ error: error.message || "Recent design lookup failed" });
      }
      return;
    }

    const id = safeDesignId(request.query?.id || request.query?.designId);
    if (!id) {
      response.status(400).json({ error: "Missing design id." });
      return;
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      response.status(503).json({ error: "Design storage is not configured." });
      return;
    }
    try {
      const design = await readStoredDesign(request, id);
      if (!design) {
        response.status(404).json({ error: "Design not found." });
        return;
      }
      const includeEditable = String(request.query?.include || "").toLowerCase() === "editable";
      if (includeEditable && design.jsonUrl) {
        const editableResponse = await fetch(design.jsonUrl, { cache: "no-store" });
        if (!editableResponse.ok) {
          response.status(502).json({ error: "Editable design source is unavailable." });
          return;
        }
        design.editableJson = await editableResponse.json();
      }
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      response.status(200).json(design);
    } catch (error) {
      response.status(400).json({ error: error.message || "Design lookup failed" });
    }
    return;
  }

  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = await readBody(request);
    const payload = JSON.parse(body);
    const action = cleanString(payload.action, 40).toLowerCase();
    if (action === "reserve") {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        response.status(503).json({ error: "Design storage is not configured." });
        return;
      }
      const id = createDesignId();
      response.status(200).json({
        id,
        uploadToken: createDesignUploadToken(id),
        uploadUrl: `${requestOrigin(request)}/api/design-upload`
      });
      return;
    }
    if (action === "finalize") {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        response.status(503).json({ error: "Design storage is not configured." });
        return;
      }
      response.status(200).json(await finalizeDirectDesign(request, payload));
      return;
    }

    const id = createDesignId();
    const png = parsePngDataUrl(payload.image);
    const rawSourceSvg = parseSvg(payload.svg);
    const sourceSvg = rawSourceSvg
      ? await inlineSvgImages(rawSourceSvg, { origin: requestOrigin(request) })
      : "";

    if (!process.env.BLOB_READ_WRITE_TOKEN || !png) {
      response.status(200).json({
        id,
        previewUrl: "",
        warning: "Design was accepted, but permanent image storage requires Vercel Blob and BLOB_READ_WRITE_TOKEN."
      });
      return;
    }

    const [imageBlob, jsonBlob, sourceSvgBlob] = await Promise.all([
      put(`team-banner-designs/${id}.png`, png, {
        access: "public",
        contentType: "image/png"
      }),
      put(`team-banner-designs/${id}.json`, JSON.stringify(payload.json || {}, null, 2), {
        access: "public",
        contentType: "application/json"
      }),
      sourceSvg
        ? put(`team-banner-designs/${id}.svg`, sourceSvg, {
          access: "public",
          contentType: "image/svg+xml"
        })
        : Promise.resolve(null)
    ]);

    const objects = designObjects(payload.json);
    const textLayers = designTextLayers(objects);
    const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    const rawProduct = metadata.product && typeof metadata.product === "object" ? metadata.product : {};
    const rawArtboard = metadata.artboard && typeof metadata.artboard === "object" ? metadata.artboard : {};
    const product = {
      title: cleanString(rawProduct.title, 240),
      handle: cleanString(rawProduct.handle, 240),
      headline: cleanString(rawProduct.headline, 240),
      sizeLabel: cleanString(rawProduct.sizeLabel, 120),
      price: cleanString(rawProduct.price, 80)
    };
    const artboard = {
      width: cleanNumber(rawArtboard.width),
      height: cleanNumber(rawArtboard.height),
      shape: cleanString(rawArtboard.shape, 80),
      backgroundColor: cleanString(rawArtboard.backgroundColor, 80)
    };
    const manifest = {
      version: 1,
      id,
      savedAt: cleanString(metadata.savedAt, 80) || new Date().toISOString(),
      previewUrl: imageBlob.url,
      jsonUrl: jsonBlob.url,
      sourceSvgUrl: sourceSvgBlob ? designSvgUrl(requestOrigin(request), id) : "",
      sourceSvgBlobUrl: sourceSvgBlob?.url || "",
      sourceSvgDownloadUrl: blobDownloadUrl(sourceSvgBlob),
      printSourceUrl: blobDownloadUrl(sourceSvgBlob),
      lookupUrl: fulfillmentLookupUrl(id),
      productTitle: cleanString(product.title, 240),
      productHandle: cleanString(product.handle, 240),
      teamName: cleanString(metadata.teamName, 240),
      parentDesignId: safeDesignId(metadata.parentDesignId),
      product,
      artboard,
      layers: textLayers,
      sourceSvgStats: {
        objectCount: objects.length,
        imageCount: objects.filter((object) => cleanString(object?.type).toLowerCase() === "image").length,
        textCount: textLayers.length,
        layered: Boolean(sourceSvgBlob && objects.length > 1)
      }
    };
    const manifestBlob = await put(`team-banner-designs/${id}.manifest.json`, JSON.stringify(manifest, null, 2), {
      access: "public",
      contentType: "application/json"
    });

    response.status(200).json({
      ...manifest,
      manifestUrl: manifestBlob.url
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Invalid design payload" });
  }
}
