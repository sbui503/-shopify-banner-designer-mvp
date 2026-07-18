import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const DEFAULT_TO = "info@tsbanners.com";
const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";
const DEFAULT_FALLBACK_FROM = "Team Sport Banners <onboarding@resend.dev>";
const MAX_PROOF_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_PROOF_ATTACHMENTS = 20;

type ResendAttachment = {
  filename: string;
  content: string;
};

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeItems(payload: Record<string, unknown>, designId: string) {
  const items = Array.isArray(payload.items) ? payload.items.filter(Boolean).slice(0, 50) : [];
  if (items.length) return items as Array<Record<string, unknown>>;
  return [{
    designId,
    previewUrl: payload.previewUrl || "",
    jsonUrl: payload.jsonUrl || "",
    sourceSvgUrl: payload.sourceSvgUrl || "",
    manifestUrl: payload.manifestUrl || "",
    lookupUrl: payload.lookupUrl || "",
    productTitle: payload.productTitle || "",
    productHandle: payload.productHandle || "",
    teamName: payload.teamName || "",
    quantity: payload.quantity || 1
  }];
}

function isEmail(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function truthyFlag(value: unknown) {
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function noPrintProofRequested(payload: Record<string, unknown>) {
  return truthyFlag(payload.noPrintProof) || truthyFlag(payload.customerProofOptOut) || truthyFlag(payload.skipCustomerProof);
}

function parsePngAttachment(value: unknown, filename = "team-banner-proof.png"): ResendAttachment | null {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(value || ""));
  if (!match) return null;
  return { filename, content: match[1] };
}

function proofFileName(index: number, itemCount: number) {
  return itemCount > 1
    ? `team-banner-proof-item-${String(index + 1).padStart(2, "0")}.png`
    : "team-banner-proof.png";
}

async function fetchPreviewAttachment(url: unknown, filename: string): Promise<ResendAttachment | null> {
  const href = String(url || "").trim();
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const response = await fetch(href);
    if (!response.ok) return null;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_PROOF_ATTACHMENT_BYTES) return null;
    const extension = contentType.includes("jpeg") || contentType.includes("jpg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
    return {
      filename: filename.replace(/\.(png|jpg|jpeg|webp)$/i, `.${extension}`),
      content: bytes.toString("base64")
    };
  } catch {
    return null;
  }
}

async function proofAttachments(payload: Record<string, unknown>, items: Array<Record<string, unknown>>): Promise<ResendAttachment[]> {
  const direct = parsePngAttachment(payload.proofImage);
  if (direct) return [direct];

  const candidates = [
    { previewUrl: payload.previewUrl },
    ...items
  ].filter((item) => item && item.previewUrl);

  const attachments: ResendAttachment[] = [];
  const seen = new Set<string>();
  for (const [index, item] of candidates.slice(0, MAX_PROOF_ATTACHMENTS).entries()) {
    const url = String(item.previewUrl || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const attachment = await fetchPreviewAttachment(url, proofFileName(index, candidates.length));
    if (attachment) attachments.push(attachment);
  }
  return attachments;
}

async function sendResendEmail(apiKey: string, body: Record<string, unknown>) {
  async function attempt(nextBody: Record<string, unknown>) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(nextBody)
    });
    const result = await response.json().catch(() => ({}));
    return { ok: response.ok, result, from: String(nextBody.from || "") };
  }

  const primary = await attempt(body);
  if (primary.ok) return primary;

  const detail = JSON.stringify(primary.result || {});
  const fallbackFrom = process.env.PROOF_EMAIL_FALLBACK_FROM || DEFAULT_FALLBACK_FROM;
  if (fallbackFrom && body.from !== fallbackFrom && /domain is not verified/i.test(detail)) {
    const fallback = await attempt({ ...body, from: fallbackFrom });
    if (fallback.ok) return fallback;
    return { ...fallback, primaryError: primary.result };
  }

  return primary;
}

function proofEmailHtml(payload: Record<string, unknown>, items: Array<Record<string, unknown>>, options: { toCustomer?: boolean } = {}) {
  const noPrintProof = noPrintProofRequested(payload);
  const rows = [
    ["Design ID", payload.designId || payload.id],
    ["Product", payload.productTitle],
    ["Team Name", payload.teamName],
    ["Customer Email", payload.customerEmail],
    ["Customer Print Proof", noPrintProof ? "No print proof requested" : "Send PNG proof to customer"],
    ["Checkout URL", payload.checkoutUrl],
    ["Cart Items", items.length]
  ].filter(([, value]) => value);

  const rowHtml = rows.map(([label, value]) => (
    `<tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${escapeHtml(label)}</th><td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(value)}</td></tr>`
  )).join("");

  const itemRows = items.map((item, index) => {
    const links = [
      item.previewUrl ? `<a href="${escapeHtml(item.previewUrl)}">PNG proof</a>` : "",
      !options.toCustomer && item.jsonUrl ? `<a href="${escapeHtml(item.jsonUrl)}">Editable JSON</a>` : "",
      !options.toCustomer && item.lookupUrl ? `<a href="${escapeHtml(item.lookupUrl)}">Fulfillment lookup</a>` : ""
    ].filter(Boolean).join(" · ");
    return `<tr>
      <td style="padding:8px 12px;border:1px solid #ddd;">${index + 1}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(item.designId || item.id)}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(item.productTitle || item.title || "Custom banner")}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;">${escapeHtml(item.quantity || 1)}</td>
      <td style="padding:8px 12px;border:1px solid #ddd;">${links}</td>
    </tr>`;
  }).join("");
  const proofUrl = String(payload.previewUrl || items.find((item) => item.previewUrl)?.previewUrl || "");
  const proof = proofUrl
    ? `<p><a href="${escapeHtml(proofUrl)}">Open PNG proof</a></p><p><img src="${escapeHtml(proofUrl)}" alt="Team banner proof" style="max-width:100%;border:1px solid #ddd;"></p>`
    : "";

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.45;">
    <h2>New Team Banner Custom Design</h2>
    ${proof}
    ${options.toCustomer ? "" : `<p style="margin:12px 0;color:#555;">Layered SVG source is stored in the Admin/Fulfillment lookup and is not attached to this email.</p>`}
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;width:100%;max-width:760px;">${rowHtml}</table>
    <h3>Cart design items</h3>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:980px;">
      <thead><tr>
        <th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Item</th>
        <th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Design ID</th>
        <th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Product</th>
        <th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Qty</th>
        <th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">Files</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </body></html>`;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const designId = String(payload.designId || payload.id || "").trim();
    const items = normalizeItems(payload, designId);
    const noPrintProof = noPrintProofRequested(payload);
    if (!designId && !items.some((item) => item.designId || item.id)) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400, headers: corsHeaders() });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        skipped: true,
        warning: "RESEND_API_KEY is not configured. Proof email was not sent."
      }, { headers: corsHeaders() });
    }

    const from = process.env.PROOF_EMAIL_FROM || DEFAULT_FROM;
    const fulfillmentTo = String(payload.to || process.env.PROOF_EMAIL_TO || DEFAULT_TO);
    const html = proofEmailHtml({ ...payload, designId, cartItemCount: items.length }, items);
    const attachments = await proofAttachments(payload, items);
    const fulfillmentResult = await sendResendEmail(apiKey, {
      from,
      to: [fulfillmentTo],
      subject: ["New custom banner design", items.length > 1 ? `${items.length} items` : "", designId, noPrintProof ? "No print proof" : ""].filter(Boolean).join(" - "),
      html,
      attachments
    });

    if (!fulfillmentResult.ok) {
      return NextResponse.json({ error: "Proof email failed", detail: fulfillmentResult.result }, { status: 502, headers: corsHeaders() });
    }

    let customerResult: Record<string, unknown> | null = null;
    if (isEmail(payload.customerEmail) && !noPrintProof) {
      const customerResponse = await sendResendEmail(apiKey, {
        from: fulfillmentResult.from || from,
        to: [String(payload.customerEmail).trim()],
        subject: "Your TeamSportBanners design proof",
        html: proofEmailHtml({ ...payload, designId, cartItemCount: items.length }, items, { toCustomer: true }),
        attachments
      }).catch(() => null);
      customerResult = customerResponse?.ok ? customerResponse.result as Record<string, unknown> : null;
    }

    return NextResponse.json({
      sent: true,
      id: String(fulfillmentResult.result.id || ""),
      cartItemCount: items.length,
      attachedPngCount: attachments.length,
      attachedSvgCount: 0,
      sourceStoredInAdmin: true,
      customerProofSkipped: noPrintProof,
      customerEmailSent: Boolean(customerResult && customerResult.id),
      emailProviderFrom: fulfillmentResult.from
    }, { headers: corsHeaders() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid proof email payload" }, { status: 400, headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
