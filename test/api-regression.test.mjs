import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import designsHandler from "../api/designs.js";
import imageProxyHandler from "../api/image-proxy.js";
import sendProofEmailHandler from "../api/send-proof-email.js";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  PROOF_EMAIL_FROM: process.env.PROOF_EMAIL_FROM,
  PROOF_EMAIL_TO: process.env.PROOF_EMAIL_TO,
  RESEND_API_KEY: process.env.RESEND_API_KEY
};

function restoreGlobals() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function request({ method = "POST", url = "/", body = "", headers = {} } = {}) {
  const chunks = body === "" ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(body)];
  const stream = Readable.from(chunks);
  stream.method = method;
  stream.url = url;
  stream.headers = { host: "example.test", ...headers };
  return stream;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    },
    end(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    }
  };
}

test.afterEach(() => {
  restoreGlobals();
});

test("designs handler accepts valid payloads when Blob storage is not configured", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const res = response();

  await designsHandler(request({
    body: JSON.stringify({
      image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
      json: { layers: [] }
    })
  }), res);

  assert.equal(res.statusCode, 200);
  assert.match(res.body.id, /^design_\d+_[a-z0-9]+$/);
  assert.equal(res.body.previewUrl, "");
  assert.match(res.body.warning, /permanent image storage requires Vercel Blob/);
  assert.equal(res.headers["access-control-allow-origin"], "*");
});

test("designs handler rejects malformed JSON payloads", async () => {
  const res = response();

  await designsHandler(request({ body: "not-json" }), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Unexpected token|JSON/);
});

test("proof email handler requires a design id before sending or skipping email", async () => {
  const res = response();

  await sendProofEmailHandler(request({ body: JSON.stringify({ productTitle: "No ID" }) }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Missing designId" });
});

test("proof email handler skips delivery safely when Resend is not configured", async () => {
  delete process.env.RESEND_API_KEY;
  const res = response();

  await sendProofEmailHandler(request({ body: JSON.stringify({ designId: "design_123" }) }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.skipped, true);
  assert.match(res.body.warning, /RESEND_API_KEY is not configured/);
});

test("proof email handler escapes merchant-entered fields and preserves checkout links", async () => {
  process.env.RESEND_API_KEY = "test_resend_key";
  process.env.PROOF_EMAIL_TO = "proofs@example.test";
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ id: "email_123" }) };
  };
  const res = response();

  await sendProofEmailHandler(request({
    body: JSON.stringify({
      id: "design_escaped",
      productTitle: "<Banners & \"More\">",
      teamName: "Aces <script>alert(1)</script>",
      checkoutUrl: "https://teambannersports.com/cart/123:1"
    })
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { sent: true, id: "email_123" });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://api.resend.com/emails");
  assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer test_resend_key");
  assert.deepEqual(fetchCalls[0].body.to, ["proofs@example.test"]);
  assert.match(fetchCalls[0].body.html, /&lt;Banners &amp; &quot;More&quot;&gt;/);
  assert.match(fetchCalls[0].body.html, /Aces &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(fetchCalls[0].body.html, /<a href="https:\/\/teambannersports\.com\/cart\/123:1">/);
});

test("proof email handler attaches proof images only when no preview URL exists", async () => {
  process.env.RESEND_API_KEY = "test_resend_key";
  const fetchCalls = [];
  globalThis.fetch = async (_url, options) => {
    fetchCalls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: "email_attachment" }) };
  };
  const res = response();

  await sendProofEmailHandler(request({
    body: JSON.stringify({
      designId: "design_with_attachment",
      proofImage: "data:image/png;base64,cHJvb2Y="
    })
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(fetchCalls[0].attachments, [{
    filename: "team-banner-proof.png",
    content: "cHJvb2Y="
  }]);
});

test("image proxy rejects non-HTTPS targets before fetching", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called for rejected targets");
  };
  const res = response();

  await imageProxyHandler(request({
    method: "GET",
    url: "/api/image-proxy?url=http%3A%2F%2Fcdn.shopify.com%2Fproof.png"
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Only HTTPS images are supported." });
});

test("image proxy rejects unknown hosts before fetching", async () => {
  globalThis.fetch = async () => {
    throw new Error("fetch should not be called for rejected hosts");
  };
  const res = response();

  await imageProxyHandler(request({
    method: "GET",
    url: "/api/image-proxy?url=https%3A%2F%2Fevil.example%2Fproof.png"
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Image host is not allowed." });
});

test("image proxy rejects allowed URLs that do not return an image", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => Buffer.from("<html>").buffer
  });
  const res = response();

  await imageProxyHandler(request({
    method: "GET",
    url: "/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fproof.html"
  }), res);

  assert.equal(res.statusCode, 415);
  assert.deepEqual(res.body, { error: "URL did not return an image" });
});

test("image proxy forwards allowed image responses with cache and nosniff headers", async () => {
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const fetchCalls = [];
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => imageBytes
    };
  };
  const res = response();

  await imageProxyHandler(request({
    method: "GET",
    url: "/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fproof.png"
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(fetchCalls[0].url, "https://cdn.shopify.com/proof.png");
  assert.equal(fetchCalls[0].options.redirect, "follow");
  assert.equal(res.headers["content-type"], "image/png");
  assert.equal(res.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(res.body, imageBytes);
});
