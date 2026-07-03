# Session Revocation Demo Script

This script is designed for a short public demo of the secure online session
lifecycle in FreNiMi Checkers. It uses the running Node.js service, not the
static GitHub Pages demo.

## Goal

Show that a player can create an online session, use multiplayer controls, and
explicitly revoke the session without exposing bearer tokens in URLs or data
exports.

## Setup

1. Start the service locally:

   ```bash
   npm ci
   copy .env.example .env
   npm start
   ```

2. Open `http://127.0.0.1:4000` in a browser.
3. Open a second browser profile or private window for the second player.

For macOS or Linux, use `cp .env.example .env`.

## 60-Second Walkthrough

1. Show the homepage and point out that local play works without an account.
2. In browser one, create an online session with a simple display name.
3. In browser two, create a second online session.
4. Join matchmaking from both browsers and confirm that a match is created.
5. Make one legal move and show the realtime update in the other browser.
6. Return to browser one and click **Disconnect Session**.
7. Confirm the UI reports that the online session was revoked.
8. Try an online action again and show that the player must reconnect first.

## Security Talking Points

- Session tokens are random values stored only as SHA-256 hashes in SQLite.
- Tokens are sent through authorization headers or authenticated WebSocket
  messages, not through URLs.
- Player data export does not include session tokens.
- Revocation removes the session and cleans up matchmaking state.
- Active-match disconnection is blocked until the match is finished or resigned
  so the game state is not abandoned silently.

## Links To Mention

- Threat model: `docs/THREAT_MODEL.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Public evidence: `docs/PUBLIC_EVIDENCE.md`

## Verification

Before recording, run:

```bash
npm run check
npm run policy
npm test
npm run audit
```
