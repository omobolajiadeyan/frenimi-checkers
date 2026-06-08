const crypto = require("crypto");
const { initDatabase, generateId } = require("./store");

const SIZE = 8;
const RED = "r";
const BLACK = "b";
const FILES = "abcdefgh";
const DRAW_NON_PROGRESS_LIMIT = 80;
const DEFAULT_RATING = 1200;
const CHECKERS_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const TIME_CONTROL_VALUES = new Set(["classic", "blitz30", "rapid120", "standard300"]);
const CAPTURE_RULE_VALUES = new Set(["forced", "casual"]);

let schemaReady = false;

function createError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function nowIso() {
  return new Date().toISOString();
}

function getDb() {
  const db = initDatabase();
  if (!schemaReady) {
    ensureSchema(db);
    schemaReady = true;
  }
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkers_players (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1200,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checkers_players_rating ON checkers_players(rating DESC);

    CREATE TABLE IF NOT EXISTS checkers_sessions (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checkers_sessions_player ON checkers_sessions(player_id);
    CREATE INDEX IF NOT EXISTS idx_checkers_sessions_expiry ON checkers_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS checkers_matchmaking_queue (
      player_id TEXT PRIMARY KEY,
      time_control TEXT NOT NULL,
      capture_rule TEXT NOT NULL,
      rating_at_join INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checkers_queue_created_at ON checkers_matchmaking_queue(created_at);

    CREATE TABLE IF NOT EXISTS checkers_matches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      time_control TEXT NOT NULL,
      capture_rule TEXT NOT NULL,
      red_player_id TEXT NOT NULL,
      black_player_id TEXT NOT NULL,
      turn TEXT NOT NULL,
      board_state TEXT NOT NULL,
      forced_piece INTEGER,
      move_index INTEGER NOT NULL DEFAULT 0,
      move_log TEXT NOT NULL,
      since_progress INTEGER NOT NULL DEFAULT 0,
      position_counts TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      result_type TEXT,
      winner_player_id TEXT,
      winner_color TEXT,
      result_reason TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checkers_matches_status ON checkers_matches(status);
    CREATE INDEX IF NOT EXISTS idx_checkers_matches_red ON checkers_matches(red_player_id);
    CREATE INDEX IF NOT EXISTS idx_checkers_matches_black ON checkers_matches(black_player_id);
  `);
}

function sanitizeDisplayName(input) {
  const clean = String(input || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return clean || "Player";
}

function normalizeTimeControl(input) {
  const value = String(input || "").trim().toLowerCase();
  return TIME_CONTROL_VALUES.has(value) ? value : "rapid120";
}

function normalizeCaptureRule(input) {
  const value = String(input || "").trim().toLowerCase();
  return CAPTURE_RULE_VALUES.has(value) ? value : "forced";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function safeJsonParse(input, fallback) {
  try {
    return JSON.parse(input);
  } catch (_err) {
    return fallback;
  }
}

function mapPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    rating: Number(row.rating) || DEFAULT_RATING,
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    losses: Number(row.losses) || 0,
    draws: Number(row.draws) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function idx(row, col) {
  return row * SIZE + col;
}

function rc(index) {
  return { row: Math.floor(index / SIZE), col: index % SIZE };
}

function inBounds(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function isDark(row, col) {
  return (row + col) % 2 === 1;
}

function owner(piece) {
  return piece ? piece.toLowerCase() : null;
}

function isKing(piece) {
  return piece === "R" || piece === "B";
}

function opposite(turn) {
  return turn === RED ? BLACK : RED;
}

function directions(piece) {
  if (isKing(piece)) return [-1, 1];
  return owner(piece) === RED ? [-1] : [1];
}

function coord(index) {
  const pos = rc(index);
  return `${FILES[pos.col]}${SIZE - pos.row}`;
}

function maybePromote(piece, destination) {
  const row = rc(destination).row;
  if (piece === "r" && row === 0) return "R";
  if (piece === "b" && row === SIZE - 1) return "B";
  return piece;
}

function createInitialBoard() {
  const board = Array(SIZE * SIZE).fill(null);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!isDark(row, col)) continue;
      if (row <= 2) board[idx(row, col)] = "b";
      if (row >= 5) board[idx(row, col)] = "r";
    }
  }
  return board;
}

function getMovesForPiece(board, from, turn, forceCapture) {
  const piece = board[from];
  if (!piece || owner(piece) !== turn) return [];

  const fromRC = rc(from);
  const dirs = directions(piece);
  const moves = [];

  for (const dr of dirs) {
    for (const dc of [-1, 1]) {
      const row1 = fromRC.row + dr;
      const col1 = fromRC.col + dc;
      if (!inBounds(row1, col1)) continue;

      const step1 = idx(row1, col1);
      const piece1 = board[step1];

      if (!forceCapture && !piece1) {
        moves.push({ from, to: step1, capture: null });
      }

      if (piece1 && owner(piece1) !== turn) {
        const row2 = fromRC.row + dr * 2;
        const col2 = fromRC.col + dc * 2;
        if (!inBounds(row2, col2)) continue;
        const step2 = idx(row2, col2);
        if (!board[step2]) {
          moves.push({ from, to: step2, capture: step1 });
        }
      }
    }
  }

  return forceCapture ? moves.filter((m) => m.capture !== null) : moves;
}

function getLegalAtomicMoves(board, turn, forcedPiece = null, enforceCaptureRule = true) {
  const all = [];
  let hasCapture = false;

  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece || owner(piece) !== turn) continue;
    if (forcedPiece !== null && i !== forcedPiece) continue;
    const pieceMoves = getMovesForPiece(board, i, turn, false);
    if (pieceMoves.some((m) => m.capture !== null)) hasCapture = true;
    all.push(...pieceMoves);
  }

  if (hasCapture && enforceCaptureRule) return all.filter((m) => m.capture !== null);
  return all;
}

function applyAtomicMoveOnBoard(board, move) {
  const moving = board[move.from];
  board[move.from] = null;
  const promotedPiece = maybePromote(moving, move.to);
  board[move.to] = promotedPiece;
  if (move.capture !== null) board[move.capture] = null;
  return {
    movedPiece: moving,
    promotedPiece,
    promoted: moving !== promotedPiece,
  };
}

function countPieces(board) {
  const counts = {
    red: 0,
    black: 0,
  };

  for (const piece of board) {
    if (!piece) continue;
    if (owner(piece) === RED) counts.red += 1;
    if (owner(piece) === BLACK) counts.black += 1;
  }
  return counts;
}

function getWinner(board, turn, enforceCaptureRule) {
  const counts = countPieces(board);
  if (counts.red === 0) return BLACK;
  if (counts.black === 0) return RED;
  const legal = getLegalAtomicMoves(board, turn, null, enforceCaptureRule);
  if (legal.length === 0) return opposite(turn);
  return null;
}

function currentPositionKey(board, turn) {
  return `${turn}|${board.map((cell) => cell || ".").join("")}`;
}

function getDrawReason(board, turn, sinceProgress, positionCounts) {
  if (sinceProgress >= DRAW_NON_PROGRESS_LIMIT) {
    return "Draw by no capture or promotion for 40 moves each.";
  }
  const seen = positionCounts[currentPositionKey(board, turn)] || 0;
  if (seen >= 3) {
    return "Draw by threefold repetition.";
  }
  return null;
}

function createStartingPositionCounts(board, turn) {
  const key = currentPositionKey(board, turn);
  return { [key]: 1 };
}

function createMoveNotation(moveIndex, color, move, promoted) {
  const side = color === RED ? "Red" : "Black";
  const sep = move.capture !== null ? "x" : "-";
  const promo = promoted ? " (K)" : "";
  return `${moveIndex}. ${side}: ${coord(move.from)}${sep}${coord(move.to)}${promo}`;
}

function rowToMatch(row, viewerPlayerId) {
  if (!row) return null;
  const board = safeJsonParse(row.board_state, createInitialBoard());
  const moveLog = safeJsonParse(row.move_log, []);
  const yourColor =
    viewerPlayerId === row.red_player_id
      ? RED
      : viewerPlayerId === row.black_player_id
        ? BLACK
        : null;
  const opponentId = yourColor === RED ? row.black_player_id : row.red_player_id;
  const opponentName = yourColor === RED ? row.black_name : row.red_name;
  const opponentRating = yourColor === RED ? Number(row.black_rating) : Number(row.red_rating);

  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    timeControl: row.time_control,
    captureRule: row.capture_rule,
    turn: row.turn,
    board,
    forcedPiece: row.forced_piece === null || row.forced_piece === undefined
      ? null
      : Number(row.forced_piece),
    moveIndex: Number(row.move_index) || 0,
    moveLog: Array.isArray(moveLog) ? moveLog : [],
    sinceProgress: Number(row.since_progress) || 0,
    resultType: row.result_type || null,
    winnerPlayerId: row.winner_player_id || null,
    winnerColor: row.winner_color || null,
    resultReason: row.result_reason || "",
    revision: Number(row.revision) || 1,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at || null,
    players: {
      red: {
        id: row.red_player_id,
        name: row.red_name,
        rating: Number(row.red_rating) || DEFAULT_RATING,
      },
      black: {
        id: row.black_player_id,
        name: row.black_name,
        rating: Number(row.black_rating) || DEFAULT_RATING,
      },
    },
    you: yourColor
      ? {
          id: viewerPlayerId,
          color: yourColor,
        }
      : null,
    opponent: opponentId
      ? {
          id: opponentId,
          name: opponentName,
          rating: Number(opponentRating) || DEFAULT_RATING,
        }
      : null,
  };
}

function getPlayerById(playerId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM checkers_players WHERE id = ? LIMIT 1").get(playerId);
  return mapPlayer(row);
}

function createPlayerSession({ displayName }) {
  const db = getDb();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + CHECKERS_SESSION_TTL_MS).toISOString();
  const playerId = generateId("ckp");
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(sessionToken);
  const safeName = sanitizeDisplayName(displayName);

  const txn = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO checkers_players (
        id, display_name, rating, games_played, wins, losses, draws, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)
    `
    ).run(playerId, safeName, DEFAULT_RATING, now, now);

    db.prepare(
      `
      INSERT INTO checkers_sessions (
        id, player_id, token_hash, created_at, expires_at, last_seen_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)
    `
    ).run(generateId("cks"), playerId, tokenHash, now, expiresAt, now);
  });

  txn();
  return {
    token: sessionToken,
    expiresAt,
    player: getPlayerById(playerId),
  };
}

function getPlayerBySessionToken(token) {
  if (!token) return null;
  const db = getDb();
  const tokenHash = hashToken(token);

  const row = db.prepare(
    `
      SELECT
        s.id AS session_id,
        p.*
      FROM checkers_sessions s
      JOIN checkers_players p ON p.id = s.player_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND datetime(s.expires_at) > datetime('now')
      LIMIT 1
    `
  ).get(tokenHash);

  if (!row) return null;

  db.prepare("UPDATE checkers_sessions SET last_seen_at = ? WHERE id = ?")
    .run(nowIso(), row.session_id);

  return mapPlayer(row);
}

function getMatchRowById(matchId) {
  const db = getDb();
  return db.prepare(
    `
      SELECT
        m.*,
        rp.display_name AS red_name,
        bp.display_name AS black_name,
        rp.rating AS red_rating,
        bp.rating AS black_rating
      FROM checkers_matches m
      JOIN checkers_players rp ON rp.id = m.red_player_id
      JOIN checkers_players bp ON bp.id = m.black_player_id
      WHERE m.id = ?
      LIMIT 1
    `
  ).get(matchId);
}

function getActiveMatchRowForPlayer(playerId) {
  const db = getDb();
  return db.prepare(
    `
      SELECT
        m.*,
        rp.display_name AS red_name,
        bp.display_name AS black_name,
        rp.rating AS red_rating,
        bp.rating AS black_rating
      FROM checkers_matches m
      JOIN checkers_players rp ON rp.id = m.red_player_id
      JOIN checkers_players bp ON bp.id = m.black_player_id
      WHERE m.status = 'active'
        AND (m.red_player_id = ? OR m.black_player_id = ?)
      ORDER BY datetime(m.started_at) DESC
      LIMIT 1
    `
  ).get(playerId, playerId);
}

function createMatchRow({
  redPlayerId,
  blackPlayerId,
  timeControl,
  captureRule,
}) {
  const db = getDb();
  const board = createInitialBoard();
  const turn = RED;
  const now = nowIso();
  const matchId = generateId("ckm");
  const positionCounts = createStartingPositionCounts(board, turn);

  db.prepare(
    `
      INSERT INTO checkers_matches (
        id, status, mode, time_control, capture_rule,
        red_player_id, black_player_id, turn, board_state, forced_piece,
        move_index, move_log, since_progress, position_counts,
        revision, result_type, winner_player_id, winner_color, result_reason,
        created_at, started_at, completed_at
      ) VALUES (
        @id, 'active', 'ranked', @time_control, @capture_rule,
        @red_player_id, @black_player_id, @turn, @board_state, NULL,
        0, '[]', 0, @position_counts,
        1, NULL, NULL, NULL, '',
        @created_at, @started_at, NULL
      )
    `
  ).run({
    id: matchId,
    time_control: timeControl,
    capture_rule: captureRule,
    red_player_id: redPlayerId,
    black_player_id: blackPlayerId,
    turn,
    board_state: JSON.stringify(board),
    position_counts: JSON.stringify(positionCounts),
    created_at: now,
    started_at: now,
  });

  return getMatchRowById(matchId);
}

function queuePosition(playerId) {
  const db = getDb();
  const row = db.prepare(
    `
      SELECT q.time_control, q.capture_rule, q.created_at
      FROM checkers_matchmaking_queue q
      WHERE q.player_id = ?
      LIMIT 1
    `
  ).get(playerId);
  if (!row) return null;

  const pos = db.prepare(
    `
      SELECT COUNT(*) AS position
      FROM checkers_matchmaking_queue q
      WHERE q.time_control = ?
        AND q.capture_rule = ?
        AND datetime(q.created_at) <= datetime(?)
    `
  ).get(row.time_control, row.capture_rule, row.created_at);

  const size = db.prepare(
    `
      SELECT COUNT(*) AS size
      FROM checkers_matchmaking_queue q
      WHERE q.time_control = ?
        AND q.capture_rule = ?
    `
  ).get(row.time_control, row.capture_rule);

  return {
    position: Number(pos.position) || 1,
    queueSize: Number(size.size) || 1,
    joinedAt: row.created_at,
  };
}

function joinRankedQueue({ playerId, timeControl, captureRule }) {
  const db = getDb();
  const normalizedTimeControl = normalizeTimeControl(timeControl);
  const normalizedCaptureRule = normalizeCaptureRule(captureRule);

  const active = getActiveMatchRowForPlayer(playerId);
  if (active) {
    return {
      state: "matched",
      match: rowToMatch(active, playerId),
    };
  }

  const player = getPlayerById(playerId);
  if (!player) {
    throw createError("Player not found.", 404);
  }

  const txn = db.transaction(() => {
    db.prepare("DELETE FROM checkers_matchmaking_queue WHERE player_id = ?").run(playerId);

    const opponent = db.prepare(
      `
      SELECT
        q.player_id,
        q.created_at,
        p.rating
      FROM checkers_matchmaking_queue q
      JOIN checkers_players p ON p.id = q.player_id
      WHERE q.player_id <> ?
        AND q.time_control = ?
        AND q.capture_rule = ?
      ORDER BY ABS(p.rating - ?) ASC, datetime(q.created_at) ASC
      LIMIT 1
      `
    ).get(playerId, normalizedTimeControl, normalizedCaptureRule, player.rating);

    if (opponent) {
      db.prepare("DELETE FROM checkers_matchmaking_queue WHERE player_id = ?")
        .run(opponent.player_id);

      const redPlayerId = Math.random() < 0.5 ? playerId : opponent.player_id;
      const blackPlayerId = redPlayerId === playerId ? opponent.player_id : playerId;
      const match = createMatchRow({
        redPlayerId,
        blackPlayerId,
        timeControl: normalizedTimeControl,
        captureRule: normalizedCaptureRule,
      });
      return {
        state: "matched",
        match: rowToMatch(match, playerId),
      };
    }

    const joinedAt = nowIso();
    db.prepare(
      `
      INSERT INTO checkers_matchmaking_queue (
        player_id, time_control, capture_rule, rating_at_join, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET
        time_control = excluded.time_control,
        capture_rule = excluded.capture_rule,
        rating_at_join = excluded.rating_at_join,
        created_at = excluded.created_at
    `
    ).run(playerId, normalizedTimeControl, normalizedCaptureRule, player.rating, joinedAt);

    const queue = queuePosition(playerId) || { position: 1, queueSize: 1, joinedAt };
    return {
      state: "queued",
      queue,
    };
  });

  return txn();
}

function leaveRankedQueue({ playerId }) {
  const db = getDb();
  const out = db.prepare("DELETE FROM checkers_matchmaking_queue WHERE player_id = ?").run(playerId);
  return out.changes > 0;
}

function getMatchmakingStatus({ playerId }) {
  const active = getActiveMatchRowForPlayer(playerId);
  if (active) {
    return {
      state: "matched",
      match: rowToMatch(active, playerId),
    };
  }

  const queue = queuePosition(playerId);
  if (queue) {
    const waitedSec = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(queue.joinedAt || nowIso())) / 1000)
    );
    return {
      state: "queued",
      queue: {
        ...queue,
        waitedSec,
      },
    };
  }

  return { state: "idle" };
}

function getMatchForPlayer({ matchId, playerId }) {
  const row = getMatchRowById(matchId);
  if (!row) {
    throw createError("Match not found.", 404);
  }

  if (row.red_player_id !== playerId && row.black_player_id !== playerId) {
    throw createError("You are not part of this match.", 403);
  }

  return rowToMatch(row, playerId);
}

function updateRatingsForMatch(row, resultType, winnerColor) {
  const db = getDb();
  const red = getPlayerById(row.red_player_id);
  const black = getPlayerById(row.black_player_id);
  if (!red || !black) return;

  const redScore = resultType === "draw" ? 0.5 : winnerColor === RED ? 1 : 0;
  const blackScore = 1 - redScore;
  const expectedRed = 1 / (1 + Math.pow(10, (black.rating - red.rating) / 400));
  const expectedBlack = 1 - expectedRed;
  const k = 28;

  const newRedRating = Math.max(600, Math.round(red.rating + k * (redScore - expectedRed)));
  const newBlackRating = Math.max(600, Math.round(black.rating + k * (blackScore - expectedBlack)));

  db.prepare(
    `
      UPDATE checkers_players
      SET
        rating = ?,
        games_played = games_played + 1,
        wins = wins + ?,
        losses = losses + ?,
        draws = draws + ?,
        updated_at = ?
      WHERE id = ?
    `
  ).run(
    newRedRating,
    redScore === 1 ? 1 : 0,
    redScore === 0 ? 1 : 0,
    redScore === 0.5 ? 1 : 0,
    nowIso(),
    red.id
  );

  db.prepare(
    `
      UPDATE checkers_players
      SET
        rating = ?,
        games_played = games_played + 1,
        wins = wins + ?,
        losses = losses + ?,
        draws = draws + ?,
        updated_at = ?
      WHERE id = ?
    `
  ).run(
    newBlackRating,
    blackScore === 1 ? 1 : 0,
    blackScore === 0 ? 1 : 0,
    blackScore === 0.5 ? 1 : 0,
    nowIso(),
    black.id
  );
}

function submitMove({ matchId, playerId, from, to }) {
  const db = getDb();
  const source = Number(from);
  const destination = Number(to);
  if (!Number.isInteger(source) || !Number.isInteger(destination)) {
    throw createError("Move coordinates are required.");
  }

  const txn = db.transaction(() => {
    const row = getMatchRowById(matchId);
    if (!row) throw createError("Match not found.", 404);
    if (row.red_player_id !== playerId && row.black_player_id !== playerId) {
      throw createError("You are not part of this match.", 403);
    }
    if (row.status !== "active") {
      throw createError("Match is no longer active.", 409);
    }

    const playerColor = row.red_player_id === playerId ? RED : BLACK;
    if (row.turn !== playerColor) {
      throw createError("It is not your turn.", 409);
    }

    const enforceCaptureRule = row.capture_rule !== "casual";
    const board = safeJsonParse(row.board_state, createInitialBoard());
    const positionCounts = safeJsonParse(row.position_counts, {});
    const moveLog = safeJsonParse(row.move_log, []);
    const forcedPiece =
      row.forced_piece === null || row.forced_piece === undefined
        ? null
        : Number(row.forced_piece);

    const legal = getLegalAtomicMoves(board, row.turn, forcedPiece, enforceCaptureRule);
    const chosen = legal.find((move) => move.from === source && move.to === destination);
    if (!chosen) {
      throw createError("Illegal move.", 409);
    }

    const outcome = applyAtomicMoveOnBoard(board, chosen);
    let sinceProgress = Number(row.since_progress) || 0;
    const madeProgress = chosen.capture !== null || outcome.promoted;
    sinceProgress = madeProgress ? 0 : sinceProgress + 1;

    let nextTurn = row.turn;
    let nextForcedPiece = null;
    if (chosen.capture !== null && enforceCaptureRule) {
      const continueCaps = getMovesForPiece(board, chosen.to, row.turn, true);
      if (continueCaps.length > 0) {
        nextForcedPiece = chosen.to;
      } else {
        nextTurn = opposite(row.turn);
      }
    } else {
      nextTurn = opposite(row.turn);
    }

    if (nextTurn !== row.turn) {
      const key = currentPositionKey(board, nextTurn);
      positionCounts[key] = (positionCounts[key] || 0) + 1;
    }

    const nextMoveIndex = (Number(row.move_index) || 0) + 1;
    moveLog.push(createMoveNotation(nextMoveIndex, playerColor, chosen, outcome.promoted));

    const winnerColor = getWinner(board, nextTurn, enforceCaptureRule);
    const drawReason = winnerColor ? null : getDrawReason(board, nextTurn, sinceProgress, positionCounts);
    const finished = Boolean(winnerColor || drawReason);
    const resultType = winnerColor ? "win" : drawReason ? "draw" : null;
    const winnerPlayerId = winnerColor
      ? winnerColor === RED
        ? row.red_player_id
        : row.black_player_id
      : null;
    const revision = (Number(row.revision) || 1) + 1;

    db.prepare(
      `
      UPDATE checkers_matches
      SET
        status = @status,
        turn = @turn,
        board_state = @board_state,
        forced_piece = @forced_piece,
        move_index = @move_index,
        move_log = @move_log,
        since_progress = @since_progress,
        position_counts = @position_counts,
        revision = @revision,
        result_type = @result_type,
        winner_player_id = @winner_player_id,
        winner_color = @winner_color,
        result_reason = @result_reason,
        completed_at = @completed_at
      WHERE id = @id
    `
    ).run({
      id: row.id,
      status: finished ? "finished" : "active",
      turn: nextTurn,
      board_state: JSON.stringify(board),
      forced_piece: nextForcedPiece,
      move_index: nextMoveIndex,
      move_log: JSON.stringify(moveLog),
      since_progress: sinceProgress,
      position_counts: JSON.stringify(positionCounts),
      revision,
      result_type: resultType,
      winner_player_id: winnerPlayerId,
      winner_color: winnerColor,
      result_reason: drawReason || "",
      completed_at: finished ? nowIso() : null,
    });

    if (finished) {
      updateRatingsForMatch(row, resultType, winnerColor);
    }

    return getMatchForPlayer({ matchId, playerId });
  });

  return txn();
}

function surrenderMatch({ matchId, playerId }) {
  const db = getDb();
  const txn = db.transaction(() => {
    const row = getMatchRowById(matchId);
    if (!row) throw createError("Match not found.", 404);
    if (row.red_player_id !== playerId && row.black_player_id !== playerId) {
      throw createError("You are not part of this match.", 403);
    }
    if (row.status !== "active") {
      throw createError("Match is no longer active.", 409);
    }

    const loserColor = row.red_player_id === playerId ? RED : BLACK;
    const winnerColor = opposite(loserColor);
    const winnerPlayerId = winnerColor === RED ? row.red_player_id : row.black_player_id;
    const revision = (Number(row.revision) || 1) + 1;

    db.prepare(
      `
      UPDATE checkers_matches
      SET
        status = 'finished',
        result_type = 'win',
        winner_player_id = ?,
        winner_color = ?,
        result_reason = ?,
        revision = ?,
        completed_at = ?
      WHERE id = ?
    `
    ).run(winnerPlayerId, winnerColor, "Win by resignation.", revision, nowIso(), row.id);

    updateRatingsForMatch(row, "win", winnerColor);
    return getMatchForPlayer({ matchId, playerId });
  });

  return txn();
}

function listLeaderboard({ limit = 25 } = {}) {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25));
  const rows = db.prepare(
    `
      SELECT *
      FROM checkers_players
      ORDER BY rating DESC, wins DESC, games_played DESC, datetime(created_at) ASC
      LIMIT ?
    `
  ).all(safeLimit);
  return rows.map(mapPlayer);
}

module.exports = {
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
};
