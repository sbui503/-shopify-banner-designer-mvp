import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/image-proxy.js";

function createRequest(targetUrl) {
  return {
    method: "GET",
    headers: { host: "example.test" },
    url: `/api/image-proxy?url=${encodeURIComponent(targetUrl)}`
  };
}

function createResponse() {
  return {
    body: undefined,
    ended: false,
    headers: new Map(),
    statusCode: undefined,
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
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
    end() {
      this.ended = true;
      return this;
    }
  };
}

test("image proxy allows Vercel Blob team banner assets", async () => {
  const originalFetch = globalThis.fetch;
  const imageBytes = new Uint8Array([60, 115, 118, 103, 62]);
  const targetUrl = "https://b4cuoooyldjrdeea.public.blob.vercel-storage.com/team-banner-assets/logo.svg";
  let fetchedUrl;

  globalThis.fetch = async (url) => {
    fetchedUrl = url;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/svg+xml" }),
      arrayBuffer: async () => imageBytes.buffer
    };
  };

  try {
    const response = createResponse();

    await handler(createRequest(targetUrl), response);

    assert.equal(response.statusCode, 200);
    assert.equal(fetchedUrl, targetUrl);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.ok(Buffer.isBuffer(response.body));
    assert.deepEqual([...response.body], [...imageBytes]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image proxy rejects retired asset hosts before fetching", async () => {
  const originalFetch = globalThis.fetch;
  const retiredHost = `${["lct", "designs"].join("-")}.s3.us-west-1.amazonaws.com`;
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for blocked hosts");
  };

  try {
    const response = createResponse();

    await handler(createRequest(`https://${retiredHost}/banner.png`), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Image host is not allowed." });
    assert.equal(fetchCalled, false);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
