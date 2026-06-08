const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");
process.env.DB_FILE = ":memory:";

const { closeDatabase, initDatabase } = require("../src/data/store");

let server;
let baseUrl;

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function createCheckersSession(name) {
  const response = await fetch(`${baseUrl}/api/checkers/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.ok(body.token);
  assert.ok(body.player?.id);
  return body;
}

test.before(async () => {
  initDatabase();

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  closeDatabase();
});

test("checkers matchmaking creates a ranked match and accepts moves", async () => {
  const a = await createCheckersSession("Rank QA A");
  const b = await createCheckersSession("Rank QA B");

  const joinA = await fetch(`${baseUrl}/api/checkers/matchmaking/join`, {
    method: "POST",
    headers: authHeaders(a.token),
    body: JSON.stringify({ timeControl: "rapid120", captureRule: "forced" }),
  });
  assert.equal(joinA.status, 200);
  const bodyA = await joinA.json();
  assert.ok(["queued", "matched"].includes(bodyA.state));

  const joinB = await fetch(`${baseUrl}/api/checkers/matchmaking/join`, {
    method: "POST",
    headers: authHeaders(b.token),
    body: JSON.stringify({ timeControl: "rapid120", captureRule: "forced" }),
  });
  assert.equal(joinB.status, 200);
  const bodyB = await joinB.json();
  assert.equal(bodyB.state, "matched");
  assert.ok(bodyB.match?.id);

  const matchId = bodyB.match.id;
  const matchAResp = await fetch(`${baseUrl}/api/checkers/matches/${matchId}`, {
    headers: { authorization: `Bearer ${a.token}` },
  });
  assert.equal(matchAResp.status, 200);
  const matchABody = await matchAResp.json();
  assert.equal(matchABody.unchanged, false);
  assert.equal(matchABody.match.id, matchId);

  const redToken = matchABody.match.players.red.id === a.player.id ? a.token : b.token;
  const blackToken = redToken === a.token ? b.token : a.token;

  const moveResp = await fetch(`${baseUrl}/api/checkers/matches/${matchId}/move`, {
    method: "POST",
    headers: authHeaders(redToken),
    body: JSON.stringify({ from: 40, to: 33 }),
  });
  assert.equal(moveResp.status, 200);
  const moveBody = await moveResp.json();
  assert.equal(moveBody.match.id, matchId);
  assert.ok(moveBody.match.revision >= 2);
  assert.equal(moveBody.match.turn, "b");

  const surrenderResp = await fetch(`${baseUrl}/api/checkers/matches/${matchId}/surrender`, {
    method: "POST",
    headers: authHeaders(blackToken),
    body: JSON.stringify({}),
  });
  assert.equal(surrenderResp.status, 200);
  const surrenderBody = await surrenderResp.json();
  assert.equal(surrenderBody.match.status, "finished");
  assert.equal(surrenderBody.match.resultType, "win");
});

test("checkers leaderboard returns players", async () => {
  const response = await fetch(`${baseUrl}/api/checkers/leaderboard?limit=5`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.leaderboard));
  assert.ok(body.leaderboard.length >= 1);
  assert.ok(body.leaderboard[0].displayName);
});
