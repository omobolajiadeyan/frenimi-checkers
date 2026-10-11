const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../public/assets/js/checkers-core");

test("initial board has twelve pieces per side", () => {
  const board = engine.createBoard();
  const counts = engine.countPieces(board);
  assert.equal(counts.red, 12);
  assert.equal(counts.black, 12);
});

test("mandatory capture suppresses ordinary moves", () => {
  const board = Array(64).fill(null);
  board[40] = "r";
  board[33] = "b";
  const moves = engine.getLegalAtomicMoves(board, "r");
  assert.deepEqual(moves, [{ from: 40, to: 26, capture: 33 }]);
});

test("pieces promote on the final row", () => {
  const board = Array(64).fill(null);
  board[9] = "r";
  engine.applyAtomicMoveOnBoard(board, { from: 9, to: 0, capture: null });
  assert.equal(board[0], "R");
});

test("a capture sequence ends when a man is crowned", () => {
  const board = Array(64).fill(null);
  board[17] = "r";
  board[10] = "b";
  board[12] = "b";

  const [action] = engine.generateActions(board, "r");

  assert.equal(action.sequence.length, 1);
  assert.deepEqual(action.sequence[0], { from: 17, to: 3, capture: 10 });
  assert.equal(action.boardAfter[3], "R");
  assert.equal(action.boardAfter[10], null);
  assert.equal(action.boardAfter[12], "b");
});

test("a man can complete a multi-jump before it reaches the king row", () => {
  const board = Array(64).fill(null);
  board[44] = "r";
  board[35] = "b";
  board[17] = "b";

  const [action] = engine.generateActions(board, "r");

  assert.deepEqual(action.sequence, [
    { from: 44, to: 26, capture: 35 },
    { from: 26, to: 8, capture: 17 },
  ]);
  assert.equal(action.boardAfter[8], "r");
  assert.equal(action.boardAfter[35], null);
  assert.equal(action.boardAfter[17], null);
});

test("draw detection enforces the non-progress and threefold thresholds", () => {
  const board = engine.createBoard();
  const positionKey = `r|${board.map((cell) => cell || ".").join("")}`;

  assert.equal(engine.drawReason(board, "r", 79, {}), null);
  assert.match(engine.drawReason(board, "r", 80, {}), /40 moves each/);
  assert.equal(engine.drawReason(board, "r", 0, { [positionKey]: 2 }), null);
  assert.equal(
    engine.drawReason(board, "r", 0, { [positionKey]: 3 }),
    "Draw by threefold repetition."
  );
});

test("AI returns a legal action without mutating the board", () => {
  const board = engine.createBoard();
  const before = board.slice();
  const action = engine.chooseAction({
    board,
    turn: "r",
    aiColor: "r",
    level: "easy",
  });
  assert.ok(action);
  assert.deepEqual(board, before);
  assert.ok(engine.generateActions(board, "r").some((item) =>
    JSON.stringify(item.sequence) === JSON.stringify(action.sequence)
  ));
});
