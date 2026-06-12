# FreNiMi Checkers

FreNiMi Checkers is a secure, cross-platform checkers application with local
AI play and realtime ranked multiplayer. It was extracted into a clean,
standalone codebase so the game contains no unrelated application data,
accounts, or services.

Copyright (c) 2026 FreNiMi.

## Play

Play the public local-AI and two-player demo:

https://omobolajiadeyan.github.io/frenimi-checkers/

The browser demo works offline after its first load. Ranked multiplayer and
persistent ratings require the Node.js deployment described below.

Share browser, accessibility, offline-install, rules, or AI-balance feedback
in the [public playtest issue](https://github.com/omobolajiadeyan/frenimi-checkers/issues/4).
Report security concerns privately through [SECURITY.md](SECURITY.md).

## Highlights

- American checkers rules with mandatory captures, multi-jumps, kings,
  threefold repetition, and the 40-move non-progress draw rule
- Minimax AI with alpha-beta pruning, move ordering, and difficulty levels
- Realtime multiplayer matchmaking and WebSocket notifications
- SQLite-backed matches, sessions, ratings, and leaderboard
- Installable Progressive Web App with offline game assets
- Security headers, strict CORS, request limits, rate limiting, hashed session
  tokens, bounded WebSocket payloads, and origin validation
- Automated engine, API, multiplayer, and security regression tests

## Requirements

- Node.js 20.19 or newer
- npm 10 or newer

## Run Locally

```bash
npm ci
copy .env.example .env
npm test
npm start
```

Open `http://127.0.0.1:4000`.

For macOS or Linux, use `cp .env.example .env`.

`HTTP_RATE_LIMIT_MAX` controls the maximum requests accepted from one client
during `HTTP_RATE_LIMIT_WINDOW_MS`. The defaults are 300 requests per minute.
When deploying behind a trusted reverse proxy, set `TRUST_PROXY=true` only
after configuring that proxy to replace untrusted forwarded-address headers.

## Verification

```bash
npm run check
npm run policy
npm test
npm run audit
```

## Publish

GitHub Pages publishes the offline local-AI and two-player game from `public/`.
The full game requires a Node.js server, WebSocket support, and persistent
SQLite storage. Use the included Render Blueprint or Docker image described in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for ranked multiplayer and
persistence.

## Architecture

- `public/index.html`: responsive game interface and online client
- `public/assets/js/checkers-core.js`: rules engine and minimax AI
- `src/routes/checkers.js`: authenticated multiplayer API
- `src/data/checkersStore.js`: game rules, matchmaking, ratings, and persistence
- `src/realtime/checkersRealtime.js`: authenticated WebSocket notifications
- `tests/`: engine, multiplayer, API, and security coverage

## Security

Session tokens are random values stored only as SHA-256 hashes in SQLite.
Tokens are accepted through authorization headers or an authenticated
WebSocket message, never through URLs. Production deployments should use HTTPS
and WSS behind a maintained reverse proxy.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT License. See [LICENSE](LICENSE).
