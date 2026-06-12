# Deployment

FreNiMi Checkers is a stateful Node.js web service. The full multiplayer game
requires HTTP, WebSocket support, and persistent storage for SQLite, so it
cannot be deployed as a GitHub Pages static site.

## Render Blueprint

The repository includes `render.yaml` for a production web service with:

- Node.js 20.19
- HTTPS and WSS at the Render edge
- `/api/health` health checks
- a persistent disk for `data/checkers.sqlite`
- trusted-proxy handling for rate limiting
- graceful shutdown during deploys

To deploy:

1. Sign in to Render and create a new Blueprint.
2. Connect `omobolajiadeyan/frenimi-checkers`.
3. Review the proposed `frenimi-checkers` web service and persistent disk.
4. Apply the Blueprint and wait for the health check to pass.
5. Open the assigned `onrender.com` URL and test local play, session creation,
   matchmaking in two separate browser profiles, and WebSocket updates.

Render supplies `RENDER_EXTERNAL_URL`, which the application automatically
adds to its allowed HTTP and WebSocket origins. Add any custom domain to
`CORS_ORIGINS` before directing traffic to it.

The Blueprint uses a paid Starter instance because persistent disks are
required for durable ratings and matches. A free preview without a disk will
lose SQLite data whenever the service restarts or redeploys.

## Docker

The included `Dockerfile` provides a portable production image:

```bash
docker build -t frenimi-checkers:1.0.0 .
docker run --rm -p 4000:4000 \
  -e HOST=0.0.0.0 \
  -e CORS_ORIGINS=http://localhost:4000 \
  -v frenimi-checkers-data:/app/data \
  frenimi-checkers:1.0.0
```

For an internet deployment, terminate TLS at a maintained reverse proxy and
set `CORS_ORIGINS` to the exact public HTTPS origins.
