import { handleUpload } from "@vercel/blob/client";
import {
  designArtifact,
  safeDesignId,
  verifyDesignUploadToken
} from "../lib/design-upload-session.js";

function requestBody(request) {
  if (request.body && typeof request.body === "object") return Promise.resolve(request.body);
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 64 * 1024) reject(new Error("Upload token request is too large."));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("Invalid upload token request."));
      }
    });
    request.on("error", reject);
  });
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    response.status(503).json({ error: "Design storage is not configured." });
    return;
  }

  try {
    const body = await requestBody(request);
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (multipart) throw new Error("Multipart design uploads are not enabled.");
        let payload = {};
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch (error) {
          throw new Error("Invalid design upload details.");
        }
        const id = safeDesignId(payload.id);
        const artifact = designArtifact(id, payload.kind);
        if (!artifact || pathname !== artifact.pathname || !verifyDesignUploadToken(id, payload.uploadToken)) {
          throw new Error("Design upload authorization failed.");
        }
        return {
          allowedContentTypes: [artifact.contentType],
          maximumSizeInBytes: artifact.maximumSizeInBytes,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ id, kind: artifact.kind })
        };
      }
    });
    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({ error: error.message || "Design upload token failed." });
  }
}
