const ALLOWED_HOSTS = new Set([
  "cdn.shopify.com",
  "files-mentioned-by-the-user-shopify.vercel.app",
  "lct-designs.s3.us-west-1.amazonaws.com",
  "teamsportbanners.com",
  "teambannersports.com"
]);

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseTargetUrl(request) {
  const host = request.headers.host || "localhost";
  const requestUrl = new URL(request.url, `https://${host}`);
  const raw = requestUrl.searchParams.get("url") || "";
  const target = new URL(raw);
  if (target.protocol !== "https:") {
    throw new Error("Only HTTPS images are supported.");
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error("Image host is not allowed.");
  }
  return target;
}

export default async function handler(request, response) {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  let target;
  try {
    target = parseTargetUrl(request);
  } catch (error) {
    response.status(400).json({ error: error.message || "Invalid image URL" });
    return;
  }

  try {
    const upstream = await fetch(target.href, {
      redirect: "follow",
      headers: { accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
    });

    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Could not load image" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    if (!/^image\//i.test(contentType)) {
      response.status(415).json({ error: "URL did not return an image" });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.status(200).send(body);
  } catch (error) {
    response.status(502).json({ error: error.message || "Image proxy failed" });
  }
}
