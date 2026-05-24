const MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_TO = "info@tsbanners.com";
const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parsePngAttachment(value) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(String(value || ""));
  if (!match) return null;
  return {
    filename: "team-banner-proof.png",
    content: match[1]
  };
}

function proofEmailHtml(payload) {
  const rows = [
    ["Design ID", payload.designId],
    ["Proof URL", payload.previewUrl],
    ["Editable Design URL", payload.jsonUrl],
    ["Product", payload.productTitle],
    ["Product Handle", payload.productHandle],
    ["Team Name", payload.teamName],
    ["Checkout URL", payload.checkoutUrl]
  ].filter(([, value]) => value);

  const rowHtml = rows.map(([label, value]) => {
    const safeValue = escapeHtml(value);
    const isUrl = /^https?:\/\//i.test(String(value || ""));
    const content = isUrl ? `<a href="${safeValue}">${safeValue}</a>` : safeValue;
    return `<tr><th align="left" style="padding:8px 12px;border:1px solid #ddd;background:#f7f7f7;">${escapeHtml(label)}</th><td style="padding:8px 12px;border:1px solid #ddd;">${content}</td></tr>`;
  }).join("");

  const proof = payload.previewUrl
    ? `<p><a href="${escapeHtml(payload.previewUrl)}">Open proof image</a></p><p><img src="${escapeHtml(payload.previewUrl)}" alt="Team banner proof" style="max-width:100%;border:1px solid #ddd;"></p>`
    : "<p>The proof image is attached to this email.</p>";

  return `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;color:#222;line-height:1.45;">
    <h2 style="margin:0 0 12px;">New Team Banner Custom Design</h2>
    ${proof}
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;width:100%;max-width:760px;">${rowHtml}</table>
  </body>
</html>`;
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

  try {
    const payload = JSON.parse(await readBody(request));
    const designId = String(payload.designId || payload.id || "").trim();
    if (!designId) {
      response.status(400).json({ error: "Missing designId" });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      response.status(200).json({
        skipped: true,
        warning: "RESEND_API_KEY is not configured. Proof email was not sent."
      });
      return;
    }

    const attachment = parsePngAttachment(payload.proofImage);
    const attachments = attachment && !payload.previewUrl ? [attachment] : [];
    const subjectParts = ["New custom banner design", designId];
    if (payload.productTitle) subjectParts.push(payload.productTitle);

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.PROOF_EMAIL_FROM || DEFAULT_FROM,
        to: [process.env.PROOF_EMAIL_TO || DEFAULT_TO],
        subject: subjectParts.join(" - "),
        html: proofEmailHtml({ ...payload, designId }),
        attachments
      })
    });

    const result = await resendResponse.json().catch(() => ({}));
    if (!resendResponse.ok) {
      response.status(502).json({
        error: "Proof email failed",
        detail: result
      });
      return;
    }

    response.status(200).json({
      sent: true,
      id: result.id || ""
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Invalid proof email payload" });
  }
}
