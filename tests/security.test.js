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
