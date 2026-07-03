# Multiplayer Deployment Smoke Test

Use this checklist after deploying the full FreNiMi Checkers Node.js service.
The static GitHub Pages demo only supports offline/local play; ranked
multiplayer requires the server deployment.

## Inputs

- Public service URL, for example `https://example.onrender.com`
- Two browser profiles or one normal window and one private window
- Access to deployment logs

## Checklist

### 1. Service Health

```bash
curl https://example.onrender.com/api/health
```

Expected result:

- HTTP `200`
- JSON response showing the service is healthy

### 2. Static Page Load

Open the service URL in a browser.

Expected result:

- The game board loads.
- Local two-player mode is available.
- No mixed-content or insecure-context browser warnings appear.

### 3. Session Creation

Create an online session with a display name.

Expected result:

- The UI shows the player as connected.
- The session token is not visible in the URL.
- Refreshing the page restores the session from local browser storage.

### 4. Matchmaking

Use two browser profiles:

1. Create a session in browser one.
2. Create a session in browser two.
3. Join matchmaking from both browsers.

Expected result:

- Both players are paired into the same match.
- Each browser shows the correct side and turn state.

### 5. WebSocket Updates

Make one legal move from the active player.

Expected result:

- The other browser receives the move without a full page refresh.
- Deployment logs do not show WebSocket origin or auth errors.

### 6. Session Revocation

Click **Disconnect Session** after the match is finished or resigned.

Expected result:

- The session is revoked.
- The browser cannot continue online actions until a new session is created.
- Matchmaking state is cleaned up.

### 7. Security Headers And CORS

Review browser dev tools and deployment logs.

Expected result:

- Requests use HTTPS/WSS.
- Only the configured public origin is accepted.
- No session token appears in URLs, exported data, or log output.

## Follow-Up

If any step fails, open an issue with:

- deployment URL;
- failing checklist step;
- browser and operating system;
- relevant sanitized logs;
- whether the failure happened on the static demo or full server deployment.
