const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env"), quiet: true });

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function parseOrigins(value, renderExternalUrl) {
  const fallback = renderExternalUrl
    ? []
    : ["http://localhost:4000", "http://127.0.0.1:4000"];
  const configured = value ? String(value).split(",") : fallback;
  const origins = configured
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (renderExternalUrl) {
    origins.push(String(renderExternalUrl).trim().replace(/\/+$/, ""));
  }
  return [...new Set(origins)];
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
const isProduction = process.env.NODE_ENV === "production";

module.exports = {
  isProduction,
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1"),
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
  corsOrigins: parseOrigins(
    process.env.CORS_ORIGINS,
    process.env.RENDER_EXTERNAL_URL
  ),
  dbFile:
    configuredDbFile === ":memory:"
      ? configuredDbFile
      : path.resolve(root, configuredDbFile),
  publicRoot: path.join(root, "public"),
};
