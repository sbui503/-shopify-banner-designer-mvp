import { put } from "@vercel/blob";

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

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
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
