import { list, put } from "@vercel/blob";

const MAX_BODY_BYTES = 8 * 1024 * 1024;

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

function designTextLayers(objects) {
  return objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => cleanString(object?.text || object?.value))
    .slice(0, 250)
    .map(({ object, index }) => ({
      id: cleanString(object.id, 100) || `text-layer-${index + 1}`,
      name: cleanString(object.name || object.sourceName, 160) || `Text layer ${index + 1}`,
      role: cleanString(object.role || object.data?.role, 100),
      type: cleanString(object.type, 100),
      text: cleanString(object.text || object.value, 1000)
    }));
}

function safeDesignId(value) {
  const clean = String(value || "").trim();
  return /^design_[0-9]+_[a-z0-9]+$/i.test(clean) ? clean : "";
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
  const manifestBlob = blobs.find((blob) => /(?:^|[.-])manifest(?:-[a-z0-9]+)?\.json$/i.test(blob.pathname));
  if (manifestBlob) {
    const manifestResponse = await fetch(manifestBlob.url, { cache: "no-store" });
    if (manifestResponse.ok) {
      const manifest = await manifestResponse.json();
      return { ...manifest, id, manifestUrl: manifest.manifestUrl || manifestBlob.url };
    }
  }

  const preview = blobs.find((blob) => /\.png$/i.test(blob.pathname));
  const editableJson = blobs.find((blob) => /\.json$/i.test(blob.pathname) && blob !== manifestBlob);
  const sourceSvg = blobs.find((blob) => /\.svg$/i.test(blob.pathname));
  if (!preview && !editableJson && !sourceSvg) return null;

  return {
    id,
    previewUrl: preview?.url || "",
    jsonUrl: editableJson?.url || "",
    sourceSvgUrl: sourceSvg?.url || "",
    manifestUrl: manifestBlob?.url || "",
    lookupUrl: `${requestOrigin(request)}/fulfillment.html?designId=${encodeURIComponent(id)}`
  };
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method === "GET") {
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
    const id = `design_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const png = parsePngDataUrl(payload.image);
    const sourceSvg = parseSvg(payload.svg);

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
      sourceSvgUrl: sourceSvgBlob?.url || "",
      lookupUrl: `${requestOrigin(request)}/fulfillment.html?designId=${encodeURIComponent(id)}`,
      productTitle: cleanString(product.title, 240),
      productHandle: cleanString(product.handle, 240),
      teamName: cleanString(metadata.teamName, 240),
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
