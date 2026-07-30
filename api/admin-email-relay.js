import { createHash, timingSafeEqual } from "node:crypto";

const MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_TO = "info@tsbanners.com";
const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";
const DEFAULT_FALLBACK_FROM = "Team Sport Banners <onboarding@resend.dev>";

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

function safeEqual(left, right) {
  const leftHash = createHash("sha256").update(String(left || "")).digest();
  const rightHash = createHash("sha256").update(String(right || "")).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function sendEmail(body) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return {
    ok: response.ok,
    result: await response.json().catch(() => ({}))
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const configuredKey = String(process.env.TEAM_BANNER_API_KEY || "");
    const providedKey = String(request.headers["x-tsb-admin-key"] || "");
    if (!configuredKey || !providedKey || !safeEqual(configuredKey, providedKey)) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!process.env.RESEND_API_KEY) {
      response.status(503).json({ error: "RESEND_API_KEY is not configured" });
      return;
    }

    const payload = JSON.parse(await readBody(request));
    const subject = String(payload.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
    const html = String(payload.html || "");
    if (!subject || !html || html.length > 750000) {
      response.status(400).json({ error: "A valid subject and HTML body are required" });
      return;
    }

    const to = String(process.env.PROOF_EMAIL_TO || DEFAULT_TO).trim();
    const from = process.env.PROOF_EMAIL_FROM || DEFAULT_FROM;
    let sent = await sendEmail({ from, to: [to], subject, html });
    const fallbackFrom = process.env.PROOF_EMAIL_FALLBACK_FROM || DEFAULT_FALLBACK_FROM;
    if (!sent.ok && fallbackFrom && from !== fallbackFrom && /domain is not verified/i.test(JSON.stringify(sent.result || {}))) {
      sent = await sendEmail({ from: fallbackFrom, to: [to], subject, html });
    }
    if (!sent.ok) {
      response.status(502).json({ error: "Resend rejected the fulfillment email", detail: sent.result });
      return;
    }

    response.status(200).json({
      sent: true,
      to,
      id: sent.result.id || ""
    });
  } catch (error) {
    response.status(400).json({ error: error.message || "Invalid email relay request" });
  }
}
