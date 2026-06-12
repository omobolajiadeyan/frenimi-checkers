const http = require("http");
const path = require("path");
const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const morgan = require("morgan");
const config = require("./config");
const { closeDatabase, initDatabase } = require("./data/store");
const checkersRoutes = require("./routes/checkers");
const { createCheckersRealtime } = require("./realtime/checkersRealtime");

function createCorsOptions() {
  const allowed = new Set(config.corsOrigins.map((origin) => origin.toLowerCase()));
  return {
    origin(origin, callback) {
      if (!origin || allowed.has(String(origin).toLowerCase().replace(/\/+$/, ""))) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin denied"));
    },
    methods: ["GET", "HEAD", "OPTIONS", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 600,
  };
}

function createApp(options = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'", "data:"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  const httpRateLimiter = rateLimit({
    windowMs: options.httpRateLimitWindowMs ?? config.httpRateLimitWindowMs,
    limit: options.httpRateLimitMax ?? config.httpRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Try again shortly." },
  });
  app.use(httpRateLimiter);
  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use(morgan(config.isProduction ? "combined" : "dev"));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "frenimi-checkers",
      timestamp: new Date().toISOString(),
    });
  });
  app.use("/api/checkers", checkersRoutes);
  app.use(express.static(config.publicRoot, { index: "index.html", dotfiles: "deny" }));
  app.get("/", (_req, res) => res.sendFile(path.join(config.publicRoot, "index.html")));
  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((error, _req, res, _next) => {
    if (error && error.message === "CORS origin denied") {
      return res.status(403).json({ error: "CORS origin denied." });
    }
    if (error && error.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large." });
    }
    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ error: "Invalid JSON payload." });
    }
    return res.status(500).json({ error: "Internal server error." });
  });
  return app;
}

function startServer() {
  initDatabase();
  const app = createApp();
  const server = http.createServer(app);
  const realtime = createCheckersRealtime(server);
  let shuttingDown = false;
  app.locals.checkersRealtime = realtime;
  server.listen(config.port, config.host, () => {
    console.log(`FreNiMi Checkers running at http://${config.host}:${config.port}`);
  });
  server.on("close", () => {
    realtime.close();
    closeDatabase();
  });

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down FreNiMi Checkers.`);
    server.close((error) => {
      if (error) {
        console.error("Graceful shutdown failed.", error);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}

if (require.main === module) startServer();

module.exports = { createApp, startServer };
