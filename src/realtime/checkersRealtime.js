const { WebSocketServer } = require("ws");
const config = require("../config");
const { getPlayerBySessionToken } = require("../data/checkersStore");

function safeParseMessage(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_err) {
    return null;
  }
}

function createCheckersRealtime(server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 16 * 1024,
    perMessageDeflate: false,
  });
  const playerSockets = new Map();
  const allowedOrigins = new Set(
    config.corsOrigins.map((origin) => origin.toLowerCase().replace(/\/+$/, ""))
  );

  function send(ws, payload) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  function addPlayerSocket(playerId, ws) {
    if (!playerSockets.has(playerId)) {
      playerSockets.set(playerId, new Set());
    }
    playerSockets.get(playerId).add(ws);
  }

  function removePlayerSocket(playerId, ws) {
    if (!playerId) return;
    const set = playerSockets.get(playerId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      playerSockets.delete(playerId);
    }
  }

  function notifyPlayers(playerIds, payload) {
    const unique = new Set((playerIds || []).filter(Boolean));
    for (const playerId of unique) {
      const sockets = playerSockets.get(playerId);
      if (!sockets) continue;
      for (const ws of sockets) {
        send(ws, payload);
      }
    }
  }

  function processMessage(ws, message) {
    const type = String(message && message.type ? message.type : "");
    if (!type) {
      send(ws, { type: "error", message: "Invalid message." });
      return;
    }

    if (type === "auth") {
      const token = String(message.token || "").trim();
      if (!token) {
        send(ws, { type: "auth_error", message: "Missing token." });
        ws.close(4001, "Missing token");
        return;
      }
      const player = getPlayerBySessionToken(token);
      if (!player) {
        send(ws, { type: "auth_error", message: "Invalid or expired token." });
        ws.close(4001, "Invalid token");
        return;
      }

      if (ws.playerId && ws.playerId !== player.id) {
        removePlayerSocket(ws.playerId, ws);
      }

      ws.playerId = player.id;
      addPlayerSocket(player.id, ws);
      send(ws, {
        type: "auth_ok",
        player: {
          id: player.id,
          displayName: player.displayName,
          rating: player.rating,
        },
      });
      return;
    }

    if (!ws.playerId) {
      send(ws, { type: "auth_required", message: "Authenticate first." });
      return;
    }

    if (type === "subscribe_match") {
      const matchId = String(message.matchId || "").trim();
      ws.matchId = matchId || null;
      send(ws, { type: "subscribed", matchId: ws.matchId });
      return;
    }

    if (type === "ping") {
      send(ws, { type: "pong", at: Date.now() });
      return;
    }

    send(ws, { type: "error", message: `Unknown type: ${type}` });
  }

  wss.on("connection", (ws) => {
    ws.playerId = null;
    ws.matchId = null;
    ws.isAlive = true;
    send(ws, { type: "hello", service: "checkers-realtime", at: Date.now() });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      const parsed = safeParseMessage(raw);
      if (!parsed) {
        send(ws, { type: "error", message: "Invalid JSON payload." });
        return;
      }
      processMessage(ws, parsed);
    });

    ws.on("close", () => {
      removePlayerSocket(ws.playerId, ws);
    });

    ws.on("error", () => {
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      pathname = url.pathname;
    } catch (_err) {
      socket.destroy();
      return;
    }

    if (pathname !== "/api/checkers/ws") {
      socket.destroy();
      return;
    }

    const origin = String(req.headers.origin || "").toLowerCase().replace(/\/+$/, "");
    if (origin && !allowedOrigins.has(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  function close() {
    clearInterval(heartbeat);
    for (const ws of wss.clients) {
      try {
        ws.close(1001, "Server shutdown");
      } catch (_err) {
      }
    }
    playerSockets.clear();
  }

  return {
    notifyPlayers,
    close,
  };
}

module.exports = {
  createCheckersRealtime,
};
