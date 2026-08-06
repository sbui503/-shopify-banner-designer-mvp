export type ShopifyOrderLookup =
  | { kind: "id"; gid: string; display: string }
  | { kind: "name"; query: string; display: string };

export function parseShopifyOrderLookup(value: unknown): ShopifyOrderLookup | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const gidMatch = raw.match(/^gid:\/\/shopify\/Order\/(\d+)$/i);
  if (gidMatch) {
    return {
      kind: "id",
      gid: `gid://shopify/Order/${gidMatch[1]}`,
      display: gidMatch[1]
    };
  }

  const urlMatch = raw.match(/\/admin\/orders\/(\d+)(?:[/?#]|$)/i);
  if (urlMatch) {
    return {
      kind: "id",
      gid: `gid://shopify/Order/${urlMatch[1]}`,
      display: urlMatch[1]
    };
  }

  const numeric = raw.replace(/^#/, "");
  if (!/^\d+$/.test(numeric)) return null;
  if (numeric.length >= 10) {
    return {
      kind: "id",
      gid: `gid://shopify/Order/${numeric}`,
      display: numeric
    };
  }

  return {
    kind: "name",
    query: `name:#${numeric}`,
    display: `#${numeric}`
  };
}
