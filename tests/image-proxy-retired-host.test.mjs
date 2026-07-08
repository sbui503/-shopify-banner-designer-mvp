import assert from "node:assert/strict";
import test from "node:test";

import handler from "../api/image-proxy.js";

const RETIRED_STOREFRONT_HOST = ["teamsportbanners", "com"].join(".");

function createResponse() {
  return {
    body: undefined,
    headers: new Map(),
    statusCode: 200,
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
    end(payload = "") {
      this.body = payload;
      this.ended = true;
      return this;
    },
    send(payload) {
      this.body = payload;
      this.ended = true;
      return this;
    }
  };
}

function imageRequest(targetUrl) {
  return {
    method: "GET",
    url: `/?url=${encodeURIComponent(targetUrl)}`,
    headers: { host: "designer.example.test" }
  };
}

test("image proxy rejects the retired storefront host before fetching", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for blocked hosts");
  };

  try {
    const response = createResponse();
    await handler(imageRequest(`https://${RETIRED_STOREFRONT_HOST}/products/banner.png`), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Image host is not allowed." });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image proxy still permits current Shopify and Vercel Blob image hosts", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: new Headers({ "content-type": "image/svg+xml" }),
      arrayBuffer: async () => new TextEncoder().encode("<svg></svg>").buffer
    };
  };

  try {
    for (const targetUrl of [
      "https://cdn.shopify.com/s/files/1/0649/3844/2958/files/banner.png",
      "https://b4cuoooyldjrdeea.public.blob.vercel-storage.com/team-banner-assets/banner.svg"
    ]) {
      const response = createResponse();
      await handler(imageRequest(targetUrl), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers.get("content-type"), "image/svg+xml");
      assert.ok(Buffer.isBuffer(response.body));
    }

    assert.deepEqual(calls.map((call) => call.url), [
      "https://cdn.shopify.com/s/files/1/0649/3844/2958/files/banner.png",
      "https://b4cuoooyldjrdeea.public.blob.vercel-storage.com/team-banner-assets/banner.svg"
    ]);
    assert.equal(calls.every((call) => call.options.redirect === "follow"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("image proxy rejects lookalike Vercel Blob hostnames", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called for blocked hosts");
  };

  try {
    const response = createResponse();
    await handler(imageRequest("https://b4cuoooyldjrdeea.public.blob.vercel-storage.com.evil.test/banner.svg"), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Image host is not allowed." });
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
