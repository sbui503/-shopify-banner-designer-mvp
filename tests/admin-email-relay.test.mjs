import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import handler from "../api/admin-email-relay.js";

function request({ method = "POST", headers = {}, body = {} } = {}) {
  const stream = Readable.from([JSON.stringify(body)]);
  stream.method = method;
  stream.headers = headers;
  return stream;
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test("rejects unauthenticated fulfillment email relay requests", async () => {
  const previousKey = process.env.TEAM_BANNER_API_KEY;
  process.env.TEAM_BANNER_API_KEY = "qa-shared-key";
  const result = response();

  try {
    await handler(request({
      headers: { "x-tsb-admin-key": "wrong-key" },
      body: { subject: "Fulfillment test", html: "<p>Test</p>" }
    }), result);
    assert.equal(result.statusCode, 401);
    assert.equal(result.payload.error, "Authentication required");
  } finally {
    if (previousKey === undefined) delete process.env.TEAM_BANNER_API_KEY;
    else process.env.TEAM_BANNER_API_KEY = previousKey;
  }
});

test("rejects non-POST requests", async () => {
  const result = response();
  await handler(request({ method: "GET" }), result);
  assert.equal(result.statusCode, 405);
});
