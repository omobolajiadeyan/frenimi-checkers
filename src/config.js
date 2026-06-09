const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parseOrigins(value) {
  const fallback = ["http://localhost:4000", "http://127.0.0.1:4000"];
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

const root = path.resolve(__dirname, "..");
const configuredDbFile = process.env.DB_FILE || "data/checkers.sqlite";

module.exports = {
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "127.0.0.1",
  trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
  httpRateLimitWindowMs: parsePositiveInteger(
    process.env.HTTP_RATE_LIMIT_WINDOW_MS,
    60_000,
    "HTTP_RATE_LIMIT_WINDOW_MS"
  ),
  httpRateLimitMax: parsePositiveInteger(
    process.env.HTTP_RATE_LIMIT_MAX,
    300,
    "HTTP_RATE_LIMIT_MAX"
  ),
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS),
  dbFile:
    configuredDbFile === ":memory:"
      ? configuredDbFile
      : path.resolve(root, configuredDbFile),
  publicRoot: path.join(root, "public"),
};
