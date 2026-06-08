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
