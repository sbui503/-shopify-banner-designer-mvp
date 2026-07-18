import { list } from "@vercel/blob";

import { inlineSvgImages } from "../lib/inline-svg-images.js";

function safeDesignId(value) {
  const clean = String(value || "").trim();
  return /^design_[0-9]+_[a-z0-9]+$/i.test(clean) ? clean : "";
}

function requestOrigin(request) {
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || "teamsportbanners.vercel.app").split(",")[0].trim();
  const protocol = String(request.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return `${protocol}://${host}`;
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
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
    const result = await list({ prefix: `team-banner-designs/${id}`, limit: 20 });
    const sourceSvg = (result.blobs || []).find((blob) => /\.svg$/i.test(blob.pathname));
    if (!sourceSvg) {
      response.status(404).json({ error: "Layered SVG not found." });
      return;
    }

    const storedResponse = await fetch(sourceSvg.url, { cache: "no-store" });
    if (!storedResponse.ok) throw new Error("Could not read layered SVG.");
    const svg = await inlineSvgImages(await storedResponse.text(), { origin: requestOrigin(request) });

    response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    response.setHeader("Content-Disposition", `inline; filename="${id}.svg"`);
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(svg);
  } catch (error) {
    response.status(502).json({ error: error.message || "Layered SVG delivery failed." });
  }
}
