const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("labeled interactive groups expose an allowed ARIA role", () => {
  assert.match(
    html,
    /id="variantPicker"[^>]*role="group"[^>]*aria-label="Checkers variant"/,
  );
  assert.match(
    html,
    /id="board"[^>]*role="group"[^>]*aria-label="Checkers board"/,
  );
});
