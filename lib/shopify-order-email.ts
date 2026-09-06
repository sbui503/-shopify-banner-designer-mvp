import { safeDesignId, type StoredDesignManifest } from "@/lib/admin-design-storage";
import { normalizeShopifyAttributes, type ShopifyCustomAttribute } from "@/lib/shopify-custom-order";

export type ShopifyEmailOrder = {
  id: string;
  name: string;
  createdAt?: string;
  email?: string;
  note?: string;
  customAttributes?: ShopifyCustomAttribute[];
  customer?: {
    displayName?: string;
    email?: string;
  } | null;
  lineItems?: {
    edges?: Array<{
      node: {
        id?: string;
        name?: string;
        quantity?: number;
        sku?: string;
        variantTitle?: string;
        customAttributes?: ShopifyCustomAttribute[];
      };
    }>;
  };
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fieldLabel(value: unknown) {
  return String(value || "")
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Custom field";
}

function nestedHttpUrl(value: unknown): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value.trim().replace(/&amp;/g, "&"));
      if (/^https?:$/.test(url.protocol)) return url.toString();
    } catch {
      return "";
    }
  }
  if (Array.isArray(value)) return value.map(nestedHttpUrl).find(Boolean) || "";
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(nestedHttpUrl).find(Boolean) || "";
  }
  return "";
}

function httpUrl(value: unknown) {
  const raw = String(value || "").trim();
  const direct = nestedHttpUrl(raw);
  if (direct) return direct;
  try {
    const parsed = nestedHttpUrl(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {}
  const match = raw.match(/https?:\/\/[^\s"'<>\\]+/i);
  return match ? nestedHttpUrl(match[0]) : "";
}

function isImageAttribute(attribute: ShopifyCustomAttribute, url: string) {
  return /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(url)
    || /(?:image|photo|logo|proof|artwork)/i.test(String(attribute.key || ""));
}

function attributeRows(attributes: ShopifyCustomAttribute[]) {
  return normalizeShopifyAttributes(attributes)
    .filter((attribute) => String(attribute.value || "").trim())
    .map((attribute) => {
      const label = escapeHtml(fieldLabel(attribute.key));
      const value = String(attribute.value || "").trim();
      const url = httpUrl(value);
      const content = url
        ? `<a href="${escapeHtml(url)}">${escapeHtml(value)}</a>${isImageAttribute(attribute, url)
          ? `<br><img src="${escapeHtml(url)}" alt="${label}" style="display:block;max-width:360px;max-height:240px;margin-top:8px;border:1px solid #ddd;">`
          : ""}`
        : escapeHtml(value);
      return `<tr>
        <th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${label}</th>
        <td style="padding:8px 12px;border:1px solid #ddd;word-break:break-word;">${content}</td>
      </tr>`;
    })
    .join("");
}

function designLinks(design: StoredDesignManifest, adminOrigin: string) {
  const designId = safeDesignId(design.id);
  if (!designId) return "";
  const adminUrl = `${adminOrigin}/admin/orders?designId=${encodeURIComponent(designId)}`;
  const sourceUrl = design.sourceSvgDownloadUrl || design.sourceSvgUrl || "";
  const links = [
    `<a href="${escapeHtml(adminUrl)}">Preview production files</a>`,
    design.designerUrl ? `<a href="${escapeHtml(design.designerUrl)}">Edit design layers</a>` : "",
    sourceUrl ? `<a href="${escapeHtml(sourceUrl)}">Download layered SVG</a>` : ""
  ].filter(Boolean).join(" &nbsp;|&nbsp; ");
  return `<div style="margin:12px 0;padding:12px;border:2px solid #047857;background:#ecfdf5;">
    <strong>Production Design ID: ${escapeHtml(designId)}</strong><br>${links}
  </div>`;
}

export function orderEmailHtml(
  order: ShopifyEmailOrder,
  adminUrl: string,
  testOnly = false,
  generatedDesigns: StoredDesignManifest[] = [],
  adminOrigin = ""
) {
  const customerName = order.customer?.displayName || "";
  const customerEmail = order.customer?.email || order.email || "";
  const orderRows = attributeRows(order.customAttributes || []);
  const lineItems = (order.lineItems?.edges || []).map((edge, index) => {
    const item = edge.node;
    const details = [item.variantTitle, item.sku ? `SKU ${item.sku}` : ""].filter(Boolean).join(" | ");
    const productionDesign = generatedDesigns.find((design) => design.shopifyLineItemId === item.id);
    const fields = attributeRows(item.customAttributes || [])
      || `<tr><td colspan="2" style="padding:8px 12px;border:1px solid #ddd;color:#666;">No custom fields attached.</td></tr>`;
    return `<h3 style="margin:24px 0 8px;">Item ${index + 1}: ${escapeHtml(item.quantity || 1)}x ${escapeHtml(item.name || "Custom product")}</h3>
      ${details ? `<p style="margin:0 0 8px;color:#555;">${escapeHtml(details)}</p>` : ""}
      ${productionDesign && adminOrigin ? designLinks(productionDesign, adminOrigin) : ""}
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;">${fields}</table>`;
  }).join("");

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.45;">
    ${testOnly ? `<div style="padding:14px 16px;border:2px solid #b45309;background:#fffbeb;color:#7c2d12;font-weight:700;">TEST ONLY - DO NOT PRINT OR FULFILL</div>` : ""}
    <h2 style="margin-bottom:8px;">${testOnly ? "Test custom order" : "Shopify custom order"} ${escapeHtml(order.name)}</h2>
    <p><a href="${escapeHtml(adminUrl)}">${testOnly ? "Open saved design in TSBanner Admin" : "Open order in Shopify Admin"}</a></p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;">
      <tr><th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Customer</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(customerName || "Not provided")}</td></tr>
      <tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Customer email</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(customerEmail || "Not provided")}</td></tr>
      <tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Order note</th><td style="padding:8px 12px;border:1px solid #ddd;white-space:pre-wrap;">${escapeHtml(order.note || "None")}</td></tr>
      ${orderRows}
    </table>
    ${lineItems}
  </body></html>`;
}
