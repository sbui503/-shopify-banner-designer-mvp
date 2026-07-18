const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_INLINE_BYTES = 36 * 1024 * 1024;

const TRUSTED_PROXY_HOSTS = new Set([
  "files-mentioned-by-the-user-shopify.vercel.app",
  "teamsportbanners.vercel.app"
]);

const TRUSTED_IMAGE_HOSTS = new Set([
  "cdn.shopify.com",
  "lct-designs.s3.us-west-1.amazonaws.com",
  "teamsportbanners.com",
  "teambannersports.com"
]);

function decodeXmlAttribute(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function trustedImageUrl(value, origin) {
  const url = new URL(decodeXmlAttribute(value), origin);
  const requestOrigin = new URL(origin).origin;

  if (url.origin === requestOrigin) return url.href;
  if (TRUSTED_IMAGE_HOSTS.has(url.hostname) && url.protocol === "https:") return url.href;
  if (TRUSTED_PROXY_HOSTS.has(url.hostname) && url.pathname === "/api/image-proxy") return url.href;

  throw new Error(`Layered SVG image host is not allowed: ${url.hostname}`);
}

async function imageDataUrl(url, fetchImage) {
  const result = await fetchImage(url, {
    redirect: "follow",
    headers: { accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" }
  });
  if (!result.ok) throw new Error(`Could not embed layered SVG image (${result.status}).`);

  const contentType = String(result.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!/^image\//.test(contentType)) throw new Error("Layered SVG asset did not return an image.");

  const body = Buffer.from(await result.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) throw new Error("Layered SVG image is too large to embed.");
  return `data:${contentType};base64,${body.toString("base64")}`;
}

export async function inlineSvgImages(svg, { origin, fetchImage = fetch } = {}) {
  const source = String(svg || "");
  if (!source || !/<svg(?:\s|>)/i.test(source)) return source;
  if (!origin) throw new Error("Layered SVG export requires a request origin.");

  const imageHrefPattern = /(<image\b[^>]*?\b(?:xlink:href|href)=)(["'])([^"']+)\2/gi;
  const hrefs = [...source.matchAll(imageHrefPattern)]
    .map((match) => match[3])
    .filter((href) => href && !/^(?:data:|#)/i.test(href));
  const uniqueHrefs = [...new Set(hrefs)];
  if (!uniqueHrefs.length) return source;

  const embedded = new Map(await Promise.all(uniqueHrefs.map(async (href) => {
    const target = trustedImageUrl(href, origin);
    return [href, await imageDataUrl(target, fetchImage)];
  })));

  const result = source.replace(imageHrefPattern, (match, prefix, quote, href) => {
    const replacement = embedded.get(href);
    return replacement ? `${prefix}${quote}${replacement}${quote}` : match;
  });
  if (Buffer.byteLength(result, "utf8") > MAX_INLINE_BYTES) {
    throw new Error("Layered SVG is too large after embedding its images.");
  }
  return result;
}
