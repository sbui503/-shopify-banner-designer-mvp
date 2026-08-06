const DEFAULT_FROM = "Team Sport Banners <orders@teamsportbanners.com>";
const DEFAULT_FALLBACK_FROM = "Team Sport Banners <onboarding@resend.dev>";

export type FulfillmentEmailResult = {
  ok: boolean;
  result: Record<string, unknown>;
};

async function sendResendEmail(apiKey: string, body: Record<string, unknown>): Promise<FulfillmentEmailResult> {
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
    return { ok: response.ok, result };
  }

  const primary = await attempt(body);
  if (primary.ok) return primary;
  const fallbackFrom = process.env.PROOF_EMAIL_FALLBACK_FROM || DEFAULT_FALLBACK_FROM;
  if (fallbackFrom && body.from !== fallbackFrom && /domain is not verified/i.test(JSON.stringify(primary.result || {}))) {
    return attempt({ ...body, from: fallbackFrom });
  }
  return primary;
}

async function sendThroughCustomerRelay(body: Record<string, unknown>): Promise<FulfillmentEmailResult> {
  const apiKey = String(process.env.TEAM_BANNER_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, result: { error: "Email delivery is not configured." } };
  }
  const origin = String(process.env.CUSTOMER_TOOL_ORIGIN || "https://teamsportbanners.vercel.app").replace(/\/+$/, "");
  const response = await fetch(`${origin}/api/admin-email-relay`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-TSB-Admin-Key": apiKey
    },
    body: JSON.stringify({ subject: body.subject, html: body.html })
  });
  return { ok: response.ok, result: await response.json().catch(() => ({})) };
}

export async function deliverFulfillmentEmail(body: Record<string, unknown>) {
  const payload = {
    from: process.env.PROOF_EMAIL_FROM || DEFAULT_FROM,
    ...body
  };
  const localResendKey = String(process.env.RESEND_API_KEY || "").trim();
  return localResendKey
    ? sendResendEmail(localResendKey, payload)
    : sendThroughCustomerRelay(payload);
}

