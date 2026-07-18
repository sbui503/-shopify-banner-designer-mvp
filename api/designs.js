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

    if (!process.env.BLOB_READ_WRITE_TOKEN || !png) {
      response.status(200).json({
        id,
        previewUrl: "",
        warning: "Design was accepted, but permanent image storage requires Vercel Blob and BLOB_READ_WRITE_TOKEN."
      });
      return;
    }

    const [imageBlob, jsonBlob] = await Promise.all([
      put(`team-banner-designs/${id}.png`, png, {
        access: "public",
        contentType: "image/png"
      }),
      put(`team-banner-designs/${id}.json`, JSON.stringify(payload.json || {}, null, 2), {
        access: "public",
        contentType: "application/json"
      })
    ]);

    response.status(200).json({
      id,
      previewUrl: imageBlob.url,
      jsonUrl: jsonBlob.url
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Invalid design payload" });
  }
}
