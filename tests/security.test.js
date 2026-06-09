const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_FILE = ":memory:";

const { createApp } = require("../src/server");
const { closeDatabase, initDatabase } = require("../src/data/store");

let server;
let baseUrl;

test.before(async () => {
  initDatabase();
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  closeDatabase();
});

test("security headers and health metadata are present", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
  const body = await response.json();
  assert.equal(body.service, "frenimi-checkers");
});

test("unapproved browser origins are denied", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(response.status, 403);
});

test("oversized JSON requests are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/checkers/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x".repeat(40_000) }),
  });
  assert.equal(response.status, 413);
});

test("session tokens are not accepted in query strings", async () => {
  const created = await fetch(`${baseUrl}/api/checkers/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Security Test" }),
  });
  const { token } = await created.json();
  const response = await fetch(`${baseUrl}/api/checkers/me?token=${token}`);
  assert.equal(response.status, 401);
});

test("global HTTP rate limiting protects static and fallback routes", async () => {
  const limitedApp = createApp({
    httpRateLimitWindowMs: 60_000,
    httpRateLimitMax: 2,
  });
  const limitedServer = limitedApp.listen(0, "127.0.0.1");
  await new Promise((resolve) => limitedServer.once("listening", resolve));
  const limitedBaseUrl = `http://127.0.0.1:${limitedServer.address().port}`;

  try {
    const first = await fetch(`${limitedBaseUrl}/missing-one`);
    const second = await fetch(`${limitedBaseUrl}/missing-two`);
    const blocked = await fetch(`${limitedBaseUrl}/missing-three`);

    assert.equal(first.status, 404);
    assert.equal(second.status, 404);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("x-content-type-options"), "nosniff");
    assert.equal(blocked.headers.get("ratelimit-remaining"), "0");
    assert.ok(blocked.headers.get("retry-after"));
    assert.deepEqual(await blocked.json(), {
      error: "Too many requests. Try again shortly.",
    });
  } finally {
    await new Promise((resolve, reject) =>
      limitedServer.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
