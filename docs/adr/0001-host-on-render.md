# ADR 0001: Host on Render as a single in-memory instance

- Status: Accepted
- Date: 2026-11-09

## Context

The game needs a public host that supports long-lived WebSocket connections
(Socket.io). All game state (queue, active games) is held in server memory.
The project is small and maintained by one person; operational effort should
be minimal.

## Options considered

1. **Render web service** — connect the Git repo; HTTPS, logs, health checks,
   automatic restarts and deploys included. Supports WebSockets.
2. **Railway / Fly.io** — similar managed platforms, also support WebSockets.
3. **VPS (e.g. DigitalOcean, Hetzner) + Caddy** — cheapest at steady load, but
   OS updates, TLS, process supervision (pm2/systemd) are our responsibility.
4. **Vercel / Netlify** — rejected: serverless functions cannot hold
   WebSocket connections open.

## Decision

Deploy to Render as **one** web service instance, keeping state in memory.

## Consequences

- HTTPS, restarts and deploy pipeline come from the platform, not our code.
- The server sits behind Render's proxy: client IPs are read from
  `X-Forwarded-For` (enabled automatically via Render's `RENDER` env var).
- **Every deploy or restart ends all games in progress.** Acceptable for a
  casual game; players see "Connection lost" and can start again.
- **Cannot scale to multiple instances** as-is: players on different
  instances could not be matched. Scaling would require a shared store
  (e.g. Redis with the Socket.io Redis adapter) and sticky sessions; revisit
  only if one instance becomes insufficient.
- Free-tier instances may sleep when idle, causing a slow first load.
