const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");

let database = null;

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function initDatabase() {
  if (database) return database;

  if (config.dbFile !== ":memory:") {
    fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  }

  database = new Database(config.dbFile);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

function closeDatabase() {
  if (!database) return;
  database.close();
  database = null;
}

module.exports = {
  closeDatabase,
  generateId,
  initDatabase,
};
