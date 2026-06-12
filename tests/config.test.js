const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function loadConfig(environment) {
  const output = execFileSync(
    process.execPath,
    ["-e", "process.stdout.write(JSON.stringify(require('./src/config')))"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CORS_ORIGINS: "",
        HOST: "",
        RENDER_EXTERNAL_URL: "",
        ...environment,
      },
    }
  );
  return JSON.parse(output);
}

test("development configuration remains local by default", () => {
  const config = loadConfig({ NODE_ENV: "development" });

  assert.equal(config.host, "127.0.0.1");
  assert.deepEqual(config.corsOrigins, [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
  ]);
});

test("Render production URL becomes the only default browser origin", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    RENDER_EXTERNAL_URL: "https://frenimi-checkers.onrender.com/",
  });

  assert.equal(config.host, "0.0.0.0");
  assert.deepEqual(config.corsOrigins, [
    "https://frenimi-checkers.onrender.com",
  ]);
});

test("custom domains are combined with and deduplicated against Render", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    CORS_ORIGINS:
      "https://play.frenimi.com/, https://frenimi-checkers.onrender.com",
    RENDER_EXTERNAL_URL: "https://frenimi-checkers.onrender.com/",
  });

  assert.deepEqual(config.corsOrigins, [
    "https://play.frenimi.com",
    "https://frenimi-checkers.onrender.com",
  ]);
});
