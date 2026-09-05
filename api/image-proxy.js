const OWNED_BLOB_HOST = "b4cuoooyldjrdeea.public.blob.vercel-storage.com";
const ALLOWED_HOSTS = new Set([
  "cdn.shopify.com",
  "teamsportbanners.com",
  "www.teamsportbanners.com",
  OWNED_BLOB_HOST
]);
const MAX_REDIRECTS = 3;

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export function isAllowedImageUrl(value) {
  try {
    const target = value instanceof URL ? value : new URL(String(value || ""));
    return target.protocol === "https:" && ALLOWED_HOSTS.has(target.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function parseTargetUrl(request) {
  const host = request.headers.host || "localhost";
  const requestUrl = new URL(request.url, `https://${host}`);
  const raw = requestUrl.searchParams.get("url") || "";
  const target = new URL(raw);
  if (!isAllowedImageUrl(target)) {
    throw new Error("Image host is not owned or approved by Team Sport Banners.");
  }
  return target;
}

async function fetchApprovedImage(initialTarget) {
  let target = initialTarget;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const upstream = await fetch(target.href, {
      redirect: "manual",
      headers: { accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
    });
    if (upstream.status < 300 || upstream.status >= 400) return upstream;
    const location = upstream.headers.get("location");
    if (!location) return upstream;
    const nextTarget = new URL(location, target);
    if (!isAllowedImageUrl(nextTarget)) {
      throw new Error("Image redirect left Team Sport Banners approved storage.");
    }
    target = nextTarget;
  }
  throw new Error("Image redirected too many times.");
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
    const upstream = await fetchApprovedImage(target);
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
