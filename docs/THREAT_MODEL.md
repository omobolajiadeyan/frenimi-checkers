# FreNiMi Checkers Threat Model

FreNiMi Checkers is a real-time multiplayer game with authenticated sessions,
WebSocket notifications, persistent ratings, and public browser clients. This
threat model documents the primary trust boundaries and security controls.

## Assets

- Player session tokens
- Match state and move history
- Ratings and leaderboard records
- SQLite persistence
- WebSocket connection state
- Public static game assets

## Trust Boundaries

| Boundary | Risk | Control |
| --- | --- | --- |
| Browser to HTTP API | Forged or abusive requests | CORS allow-listing, rate limits, input validation, security headers |
| Browser to WebSocket server | Unauthenticated realtime commands | Authenticated WebSocket messages and bounded payloads |
| Session token to database | Token disclosure or replay | Random tokens stored only as SHA-256 hashes |
| Matchmaking queue to match creation | Stale or revoked sessions being matched | Explicit session revocation and queue cleanup |
| Data export/import | Accidental bearer-token leakage | Data export excludes session tokens |
| Reverse proxy to application | Spoofed client IP headers | `TRUST_PROXY=true` only after proxy hardening |

## Security Controls

- Session tokens are not stored in plaintext.
- Tokens are not accepted through URLs.
- Players can revoke the current online session.
- Active-match logout is rejected to protect game integrity.
- WebSocket payloads are bounded and origin-checked.
- HTTP routes use request limits and rate limiting.
- Static deployment is separated from the full multiplayer service.
- Automated tests cover engine, API, multiplayer, and security behavior.

## Residual Risks

- SQLite is appropriate for a small deployment but should be reviewed before
  high-concurrency production use.
- Public play can attract automated abuse; production deployments should add
  monitoring, backups, and stronger abuse controls.
- The browser client is untrusted. Server-side validation must remain the source
  of truth for multiplayer state.

## Security Review Priorities

1. Keep session lifecycle tests current.
2. Expand WebSocket abuse-case coverage.
3. Add rate-limit regression coverage for matchmaking endpoints.
4. Review deployment headers after any hosting change.
5. Keep dependency audit and CodeQL checks passing.
