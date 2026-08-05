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

test("every generated board square receives a descriptive accessible name", () => {
  assert.match(html, /const coordinate = `\$\{FILES\[actual\.col\]\}\$\{SIZE - actual\.row\}`/);
  assert.match(html, /square\.setAttribute\("aria-label", `\$\{coordinate\}: \$\{occupant\}\$\{squareState\}`\)/);
});

test("footer copy uses the accessible high-contrast color", () => {
  assert.match(html, /\.footer-note\s*\{[^}]*color: #526274;/s);
});
