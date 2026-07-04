import assert from "node:assert/strict";
import { test } from "node:test";

import handler from "../api/image-proxy.js";

function requestFor(targetUrl, method = "GET") {
  return {
    method,
    url: `/api/image-proxy?url=${encodeURIComponent(targetUrl)}`,
    headers: { host: "files-mentioned-by-the-user-shopify.vercel.app" }
  };
}

function createResponse() {
  return {
    body: undefined,
    headers: new Map(),
    statusCode: undefined,
    ended: false,
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

async function withFetch(fetchStub, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("proxies image responses from any Vercel Blob public bucket host", async () => {
  const targetUrl = "https://team-banners-20260704.public.blob.vercel-storage.com/previews/banner.svg";
  let fetchedUrl = "";

  await withFetch(async (url, options) => {
    fetchedUrl = url;
    assert.equal(options.redirect, "follow");
    assert.match(options.headers.accept, /image\/svg\+xml/);
    return new Response("<svg viewBox=\"0 0 1 1\"/>", {
      status: 200,
      headers: { "content-type": "image/svg+xml" }
    });
  }, async () => {
    const response = createResponse();
    await handler(requestFor(targetUrl), response);

    assert.equal(fetchedUrl, targetUrl);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.body.toString(), "<svg viewBox=\"0 0 1 1\"/>");
  });
});

test("rejects lookalike blob hostnames instead of forwarding them upstream", async () => {
  await withFetch(async () => {
    throw new Error("fetch should not be called for disallowed hosts");
  }, async () => {
    const response = createResponse();
    await handler(requestFor("https://public.blob.vercel-storage.com.evil.example/banner.svg"), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Image host is not allowed." });
  });
});
