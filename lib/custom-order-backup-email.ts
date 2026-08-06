import type { CustomOrderBackupManifest } from "@/lib/custom-order-backup";
import { deliverFulfillmentEmail } from "@/lib/fulfillment-email";

const DEFAULT_TO = "info@tsbanners.com";

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

function customOrderBackupEmailHtml(manifest: CustomOrderBackupManifest, adminUrl: string) {
  const rows = manifest.fields.map((field) => `<tr>
    <th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${escapeHtml(fieldLabel(field.key))}</th>
    <td style="padding:8px 12px;border:1px solid #ddd;word-break:break-word;white-space:pre-wrap;">${escapeHtml(field.value)}</td>
  </tr>`).join("");
  const files = manifest.files.map((file) => `<section style="margin-top:20px;">
    <h3 style="margin:0 0 8px;">${escapeHtml(fieldLabel(file.fieldKey))}: ${escapeHtml(file.name)}</h3>
    <p><a href="${escapeHtml(file.downloadUrl || file.url)}">Open original uploaded file</a></p>
    ${String(file.contentType || "").startsWith("image/")
      ? `<img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name)}" style="display:block;max-width:520px;max-height:360px;border:1px solid #ddd;">`
      : ""}
  </section>`).join("");

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.45;">
    <div style="padding:12px 16px;background:#ecfdf5;border:2px solid #047857;font-weight:700;">CUSTOM ORDER BACKUP SAVED</div>
    <h2>${escapeHtml(manifest.productTitle || "Team Sport Banners custom order")}</h2>
    <p><strong>Submission ID:</strong> ${escapeHtml(manifest.id)}</p>
    <p><strong>Saved:</strong> ${escapeHtml(manifest.updatedAt)}</p>
    <p><a href="${escapeHtml(adminUrl)}">Open all order details in TSBanner Admin</a></p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:900px;">
      <tr><th align="left" style="width:190px;padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Product</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(manifest.productTitle || "Not provided")}</td></tr>
      <tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Product page</th><td style="padding:8px 12px;border:1px solid #ddd;word-break:break-all;"><a href="${escapeHtml(manifest.pageUrl)}">${escapeHtml(manifest.pageUrl)}</a></td></tr>
      ${rows}
    </table>
    ${files}
  </body></html>`;
}

export async function sendCustomOrderBackupEmail(manifest: CustomOrderBackupManifest, adminOrigin: string) {
  const to = String(process.env.PROOF_EMAIL_TO || DEFAULT_TO).trim();
  const adminUrl = `${adminOrigin.replace(/\/+$/, "")}/admin/orders?submissionId=${encodeURIComponent(manifest.id)}`;
  const result = await deliverFulfillmentEmail({
    to: [to],
    subject: `Custom order backup ${manifest.id}: ${manifest.productTitle || "Team Sport Banners order"}`,
    html: customOrderBackupEmailHtml(manifest, adminUrl)
  });
  return { ...result, to };
}

