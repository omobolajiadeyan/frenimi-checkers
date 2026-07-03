# Public Evidence

FreNiMi Checkers is presented as secure real-time application engineering: a
playable browser game with server-backed multiplayer, session controls, and
automated security testing.

## Public Links

- Repository: https://github.com/omobolajiadeyan/frenimi-checkers
- Browser demo: https://omobolajiadeyan.github.io/frenimi-checkers/
- Public playtest issue: https://github.com/omobolajiadeyan/frenimi-checkers/issues/4

## Engineering Evidence

| Area | Evidence |
| --- | --- |
| Browser game | Offline-capable PWA demo with local AI and two-player mode |
| Multiplayer | WebSocket notifications, matchmaking, session-backed API |
| Persistence | SQLite matches, sessions, ratings, and leaderboard |
| Security | Hashed tokens, explicit revocation, strict CORS, payload bounds, rate limiting |
| Verification | Node test matrix, CodeQL, deployment-image check, npm audit |

## Current Positioning

The project is useful as public evidence of:

- secure session lifecycle design;
- WebSocket-aware application security;
- full-stack JavaScript delivery;
- public demo packaging with separated static and server-backed modes;
- security documentation around an accessible, playable product.

## Next Public Signals

- Record one short demo video using `docs/SESSION_REVOCATION_DEMO.md`.
- Run `docs/DEPLOYMENT_SMOKE_TEST.md` after the first public server deployment.
- Add public playtest feedback from real users.
- Publish a technical note on secure WebSocket session handling.
