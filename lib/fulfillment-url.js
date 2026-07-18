const DEFAULT_ADMIN_ORIGIN = "https://admin-teamsportbanners.vercel.app";

export function fulfillmentLookupUrl(designId, configuredOrigin = process.env.ADMIN_APP_ORIGIN) {
  let origin = DEFAULT_ADMIN_ORIGIN;
  if (configuredOrigin) {
    try {
      origin = new URL(configuredOrigin).origin;
    } catch (error) {
      origin = DEFAULT_ADMIN_ORIGIN;
    }
  }
  return `${origin}/admin/orders?designId=${encodeURIComponent(designId)}`;
}

export function designSvgUrl(origin, designId) {
  return `${new URL(origin).origin}/api/design-svg?id=${encodeURIComponent(designId)}`;
}
