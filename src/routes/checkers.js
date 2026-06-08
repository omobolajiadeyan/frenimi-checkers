const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  normalizeTimeControl,
  normalizeCaptureRule,
  createPlayerSession,
  getPlayerBySessionToken,
  joinRankedQueue,
  leaveRankedQueue,
  getMatchmakingStatus,
  getMatchForPlayer,
  submitMove,
  surrenderMatch,
  listLeaderboard,
} = require("../data/checkersStore");

const router = express.Router();

const sessionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkers session requests. Try again shortly." },
});

const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
});

function notifyMatchRealtime(req, match, type = "match_changed") {
  const realtime = req.app && req.app.locals ? req.app.locals.checkersRealtime : null;
  if (!realtime || !match || !match.players) return;
  const redId = match.players.red && match.players.red.id;
  const blackId = match.players.black && match.players.black.id;
  const players = [redId, blackId].filter(Boolean);
  if (players.length === 0) return;
  realtime.notifyPlayers(players, {
    type,
    matchId: match.id,
    revision: match.revision,
    status: match.status,
    at: new Date().toISOString(),
  });
}

function extractToken(req) {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

function requireCheckersAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing checkers session token." });
  }

  const player = getPlayerBySessionToken(token);
  if (!player) {
    return res.status(401).json({ error: "Invalid or expired checkers session." });
  }

  req.checkersPlayer = player;
  return next();
}

function handleError(res, error) {
  const status = Number(error && error.status) || 500;
  const message = status >= 500 ? "Internal server error." : String(error.message || "Request failed.");
  return res.status(status).json({ error: message });
}

router.post("/session", sessionLimiter, (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "Player name is required." });
    }
    const session = createPlayerSession({ displayName: name });
    return res.status(201).json({
      token: session.token,
      expiresAt: session.expiresAt,
      player: session.player,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get("/me", requireCheckersAuth, (req, res) => {
  return res.json({ player: req.checkersPlayer });
});

router.get("/leaderboard", (req, res) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const entries = listLeaderboard({ limit });
    return res.json({
      leaderboard: entries,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post("/matchmaking/join", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const timeControl = normalizeTimeControl(req.body.timeControl);
    const captureRule = normalizeCaptureRule(req.body.captureRule);
    const result = joinRankedQueue({
      playerId: req.checkersPlayer.id,
      timeControl,
      captureRule,
    });
    if (result.state === "matched" && result.match) {
      notifyMatchRealtime(req, result.match, "match_found");
    }
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.get("/matchmaking/status", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const result = getMatchmakingStatus({
      playerId: req.checkersPlayer.id,
    });
    return res.json(result);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post("/matchmaking/leave", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const left = leaveRankedQueue({ playerId: req.checkersPlayer.id });
    return res.json({ left });
  } catch (error) {
    return handleError(res, error);
  }
});

router.get("/matches/:matchId", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const match = getMatchForPlayer({
      matchId: req.params.matchId,
      playerId: req.checkersPlayer.id,
    });

    const since = Number(req.query.since);
    if (Number.isInteger(since) && since >= 0 && match.revision === since) {
      return res.json({
        unchanged: true,
        revision: match.revision,
      });
    }

    return res.json({
      unchanged: false,
      match,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post("/matches/:matchId/move", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const from = req.body.from;
    const to = req.body.to;
    const match = submitMove({
      matchId: req.params.matchId,
      playerId: req.checkersPlayer.id,
      from,
      to,
    });
    notifyMatchRealtime(req, match, "match_changed");
    return res.json({ match });
  } catch (error) {
    return handleError(res, error);
  }
});

router.post("/matches/:matchId/surrender", actionLimiter, requireCheckersAuth, (req, res) => {
  try {
    const match = surrenderMatch({
      matchId: req.params.matchId,
      playerId: req.checkersPlayer.id,
    });
    notifyMatchRealtime(req, match, "match_changed");
    return res.json({ match });
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;
