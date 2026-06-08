(function initCheckersCore(globalScope) {
  const SIZE = 8;
  const RED = "r";
  const BLACK = "b";
  const DRAW_NON_PROGRESS_LIMIT = 80;
  const PIECE_WEIGHT = {
    man: 100,
    king: 175,
  };

  const AI_LEVELS = {
    easy: { depth: 2, mistakeChance: 0.45, topPool: 4 },
    soft: { depth: 4, mistakeChance: 0.18, topPool: 3 },
    hard: { depth: 6, mistakeChance: 0.0, topPool: 1 },
    expert: { depth: 7, mistakeChance: 0.0, topPool: 1 },
  };

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

  function maybePromote(piece, destination) {
    const row = rc(destination).row;
    if (piece === "r" && row === 0) return "R";
    if (piece === "b" && row === SIZE - 1) return "B";
    return piece;
  }

  function createBoard() {
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

    return forceCapture ? moves.filter((move) => move.capture !== null) : moves;
  }

  function getLegalAtomicMoves(board, turn, forcedPiece = null, enforceCaptureRule = true) {
    const all = [];
    let hasCapture = false;

    for (let i = 0; i < board.length; i++) {
      const piece = board[i];
      if (!piece || owner(piece) !== turn) continue;
      if (forcedPiece !== null && i !== forcedPiece) continue;

      const pieceMoves = getMovesForPiece(board, i, turn, false);
      if (pieceMoves.some((move) => move.capture !== null)) hasCapture = true;
      all.push(...pieceMoves);
    }

    if (hasCapture && enforceCaptureRule) return all.filter((move) => move.capture !== null);
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

  function captureSequences(board, turn, fromIndex, prefix) {
    const captures = getMovesForPiece(board, fromIndex, turn, true);
    if (captures.length === 0) {
      return [{ sequence: prefix, boardAfter: board }];
    }

    const variants = [];
    for (const move of captures) {
      const b2 = board.slice();
      applyAtomicMoveOnBoard(b2, move);
      variants.push(...captureSequences(b2, turn, move.to, [...prefix, move]));
    }
    return variants;
  }

  function generateActions(board, turn, options = {}) {
    const forcedPiece = options.forcedPiece === undefined ? null : options.forcedPiece;
    const enforceCaptureRule =
      options.enforceCaptureRule === undefined ? true : Boolean(options.enforceCaptureRule);
    const legal = getLegalAtomicMoves(board, turn, forcedPiece, enforceCaptureRule);
    if (legal.length === 0) return [];

    const captureMode = legal.some((move) => move.capture !== null) && enforceCaptureRule;
    const actions = [];

    if (!captureMode) {
      for (const move of legal) {
        const nextBoard = board.slice();
        applyAtomicMoveOnBoard(nextBoard, move);
        actions.push({ sequence: [move], boardAfter: nextBoard });
      }
      return actions;
    }

    for (const move of legal) {
      const b1 = board.slice();
      applyAtomicMoveOnBoard(b1, move);
      actions.push(...captureSequences(b1, turn, move.to, [move]));
    }
    return actions;
  }

  function countPieces(board) {
    const counts = {
      red: 0,
      black: 0,
      redKings: 0,
      blackKings: 0,
    };

    for (const piece of board) {
      if (!piece) continue;
      if (owner(piece) === RED) {
        counts.red += 1;
        if (isKing(piece)) counts.redKings += 1;
      } else {
        counts.black += 1;
        if (isKing(piece)) counts.blackKings += 1;
      }
    }
    return counts;
  }

  function getWinner(board, turn, options = {}) {
    const enforceCaptureRule =
      options.enforceCaptureRule === undefined ? true : Boolean(options.enforceCaptureRule);
    const counts = countPieces(board);
    if (counts.red === 0) return BLACK;
    if (counts.black === 0) return RED;
    const legal = getLegalAtomicMoves(board, turn, null, enforceCaptureRule);
    if (legal.length === 0) return opposite(turn);
    return null;
  }

  function evaluate(board, aiColor, options = {}) {
    const enforceCaptureRule =
      options.enforceCaptureRule === undefined ? true : Boolean(options.enforceCaptureRule);
    let score = 0;
    for (let i = 0; i < board.length; i++) {
      const piece = board[i];
      if (!piece) continue;
      const side = owner(piece);
      const sign = side === aiColor ? 1 : -1;
      const { row, col } = rc(i);

      if (isKing(piece)) {
        score += sign * PIECE_WEIGHT.king;
      } else {
        score += sign * PIECE_WEIGHT.man;
        const advance = side === RED ? SIZE - 1 - row : row;
        score += sign * advance * 2;
      }

      if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
        score += sign * 6;
      }
    }

    const enemy = opposite(aiColor);
    const aiMoves = getLegalAtomicMoves(board, aiColor, null, enforceCaptureRule).length;
    const enemyMoves = getLegalAtomicMoves(board, enemy, null, enforceCaptureRule).length;
    score += (aiMoves - enemyMoves) * 3;
    return score;
  }

  function actionOrderScore(action, turn) {
    const captures = action.sequence.filter((step) => step.capture !== null).length;
    const lengthBonus = action.sequence.length;
    const counts = countPieces(action.boardAfter);
    const material = turn === RED
      ? counts.red + counts.redKings - counts.black - counts.blackKings
      : counts.black + counts.blackKings - counts.red - counts.redKings;
    return captures * 120 + lengthBonus * 15 + material * 4;
  }

  function orderActions(actions, turn) {
    return actions
      .slice()
      .sort((a, b) => actionOrderScore(b, turn) - actionOrderScore(a, turn));
  }

  function boardHash(board) {
    return board.map((cell) => cell || ".").join("");
  }

  function minimaxAlphaBeta(board, turn, depth, alpha, beta, aiColor, options = {}, cache = null) {
    const enforceCaptureRule =
      options.enforceCaptureRule === undefined ? true : Boolean(options.enforceCaptureRule);
    const cacheKey = cache ? `${turn}|${depth}|${boardHash(board)}|${enforceCaptureRule ? 1 : 0}` : "";
    if (cache && cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const winner = getWinner(board, turn, { enforceCaptureRule });
    if (winner) {
      const result = winner === aiColor ? { score: 100000 + depth } : { score: -100000 - depth };
      if (cache) cache.set(cacheKey, result);
      return result;
    }

    if (depth === 0) {
      const result = { score: evaluate(board, aiColor, { enforceCaptureRule }) };
      if (cache) cache.set(cacheKey, result);
      return result;
    }

    const actions = orderActions(generateActions(board, turn, { enforceCaptureRule }), turn);
    const maximizing = turn === aiColor;
    let bestAction = null;
    let cut = false;

    if (maximizing) {
      let bestScore = -Infinity;
      for (const action of actions) {
        const out = minimaxAlphaBeta(
          action.boardAfter,
          opposite(turn),
          depth - 1,
          alpha,
          beta,
          aiColor,
          { enforceCaptureRule },
          cache
        );
        if (out.score > bestScore) {
          bestScore = out.score;
          bestAction = action;
        }
        alpha = Math.max(alpha, bestScore);
        if (beta <= alpha) {
          cut = true;
          break;
        }
      }
      const result = { score: bestScore, action: bestAction };
      if (cache && !cut) cache.set(cacheKey, result);
      return result;
    }

    let bestScore = Infinity;
    for (const action of actions) {
      const out = minimaxAlphaBeta(
        action.boardAfter,
        opposite(turn),
        depth - 1,
        alpha,
        beta,
        aiColor,
        { enforceCaptureRule },
        cache
      );
      if (out.score < bestScore) {
        bestScore = out.score;
        bestAction = action;
      }
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) {
        cut = true;
        break;
      }
    }
    const result = { score: bestScore, action: bestAction };
    if (cache && !cut) cache.set(cacheKey, result);
    return result;
  }

  function chooseAction(input) {
    const board = Array.isArray(input.board) ? input.board.slice() : createBoard();
    const turn = input.turn === BLACK ? BLACK : RED;
    const aiColor = input.aiColor === BLACK ? BLACK : RED;
    const level = AI_LEVELS[input.level] ? input.level : "soft";
    const enforceCaptureRule =
      input.enforceCaptureRule === undefined ? true : Boolean(input.enforceCaptureRule);
    const profile = AI_LEVELS[level];
    const actions = generateActions(board, turn, { enforceCaptureRule });
    if (actions.length === 0) return null;
    if (actions.length === 1) return actions[0];

    const cache = new Map();
    const scored = actions.map((action) => {
      const out = minimaxAlphaBeta(
        action.boardAfter,
        opposite(turn),
        profile.depth - 1,
        -Infinity,
        Infinity,
        aiColor,
        { enforceCaptureRule },
        cache
      );
      return { action, score: out.score };
    });
    scored.sort((a, b) => b.score - a.score);

    if (profile.mistakeChance > 0 && Math.random() < profile.mistakeChance) {
      const pool = scored.slice(1, Math.min(scored.length, profile.topPool + 2));
      if (pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)].action;
      }
    }

    const top = scored.slice(0, Math.min(profile.topPool, scored.length));
    return top[Math.floor(Math.random() * top.length)].action;
  }

  function currentPositionKey(board, turn) {
    return `${turn}|${boardHash(board)}`;
  }

  function drawReason(board, turn, sinceProgress, positionCounts) {
    if (Number(sinceProgress) >= DRAW_NON_PROGRESS_LIMIT) {
      return "Draw by no capture or king promotion for 40 moves each.";
    }
    const seen = positionCounts[currentPositionKey(board, turn)] || 0;
    if (seen >= 3) {
      return "Draw by threefold repetition.";
    }
    return null;
  }

  function createSyncState(input) {
    const board = Array.isArray(input.board) ? input.board.slice(0, SIZE * SIZE) : createBoard();
    const turn = input.turn === BLACK ? BLACK : RED;
    return {
      schema: "checkers-sync-v1",
      board,
      turn,
      forcedPiece: Number.isInteger(input.forcedPiece) ? input.forcedPiece : null,
      moveIndex: Number.isFinite(input.moveIndex) ? Number(input.moveIndex) : 0,
      sinceProgress: Number.isFinite(input.sinceProgress) ? Number(input.sinceProgress) : 0,
      positionKey: currentPositionKey(board, turn),
      createdAt: new Date().toISOString(),
    };
  }

  const api = {
    SIZE,
    RED,
    BLACK,
    AI_LEVELS,
    createBoard,
    getMovesForPiece,
    getLegalAtomicMoves,
    applyAtomicMoveOnBoard,
    generateActions,
    countPieces,
    getWinner,
    evaluate,
    minimaxAlphaBeta,
    chooseAction,
    createSyncState,
    drawReason,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  globalScope.CheckersCore = api;
})(typeof window !== "undefined" ? window : globalThis);
