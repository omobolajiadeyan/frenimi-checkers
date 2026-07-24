const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");

process.env.DB_FILE = ":memory:";

const { createApp } = require("../src/server");
const { closeDatabase, initDatabase } = require("../src/data/store");
const { createCheckersRealtime } = require("../src/realtime/checkersRealtime");

let server;
let realtime;
let wsUrl;

test.before(async () => {
  initDatabase();
  server = createApp().listen(0, "127.0.0.1");
  realtime = createCheckersRealtime(server);
  await new Promise((resolve) => server.once("listening", resolve));
  wsUrl = `ws://127.0.0.1:${server.address().port}/api/checkers/ws`;
});

test.after(async () => {
  if (realtime) realtime.close();
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  closeDatabase();
});

function connect() {
  return new WebSocket(wsUrl);
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      ws.off("close", onClose);
    };
    const onMessage = (data) => {
      cleanup();
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = (code) => {
      cleanup();
      reject(new Error(`WebSocket closed before a message arrived (${code})`));
    };

    ws.once("message", onMessage);
    ws.once("error", onError);
    ws.once("close", onClose);
  });
}

function closed(ws) {
  return new Promise((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
}

test("malformed WebSocket payload is rejected without crashing the connection", async () => {
  const ws = connect();
  await nextMessage(ws); // initial "hello"

  ws.send("not valid json{");
  const reply = await nextMessage(ws);
  assert.equal(reply.type, "error");
  assert.equal(reply.message, "Invalid JSON payload.");

  // The connection must still be usable after a malformed payload: a
  // well-formed message should still get a normal response, not a dropped
  // socket or an unhandled exception on the server.
  ws.send(JSON.stringify({ type: "ping" }));
  const followUp = await nextMessage(ws);
  assert.equal(followUp.type, "auth_required");

  ws.close();
  await closed(ws);
});

test("oversized WebSocket payload is closed at the protocol level", async () => {
  const ws = connect();
  await nextMessage(ws); // initial "hello"

  // maxPayload is configured to 16 KiB in createCheckersRealtime; send a
  // frame well past that so the abuse case is unambiguous.
  const oversizedMessage = JSON.stringify({
    type: "ping",
    pad: "a".repeat(64 * 1024),
  });
  ws.send(oversizedMessage);

  const result = await closed(ws);
  // ws closes oversized frames with 1009 ("Message Too Big") before the
  // application layer ever sees them.
  assert.equal(result.code, 1009);
});

test("unrelated multiplayer flows still work after abuse-case traffic", async () => {
  const ws = connect();
  await nextMessage(ws); // initial "hello"

  ws.send("{{{not json");
  await nextMessage(ws); // error reply, discarded

  ws.send(JSON.stringify({ type: "subscribe_match", matchId: "does-not-exist" }));
  const reply = await nextMessage(ws);
  assert.equal(reply.type, "auth_required");

  ws.close();
  await closed(ws);
});
