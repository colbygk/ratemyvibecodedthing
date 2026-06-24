# Docker: local dev + testing

Everything runs in Docker — local development, unit tests, and end-to-end/system
tests — so the only host requirement is **Docker** (Compose v2). No host Node/npm,
no Cloudflare/Upstash account, no secrets. Production is never touched.

## Why a Redis-REST shim?

The Worker talks to **Upstash Redis over its REST API** (`UPSTASH_REDIS_REST_URL`
/ `_TOKEN`), not the Redis wire protocol. So a plain `redis` container isn't
enough. We run:

```
Worker (wrangler dev)  ──HTTP/REST──▶  serverless-redis-http  ──RESP──▶  redis
       env.MEDIA (R2) simulated locally by wrangler / Miniflare
```

`serverless-redis-http` (image `hiett/serverless-redis-http`) speaks the Upstash
REST dialect and proxies to a normal `redis` container. R2 needs nothing extra —
`wrangler dev` runs the Worker in local mode with a Miniflare-simulated `MEDIA`
bucket on disk.

## Services (`docker-compose.yml`)

| Service        | Profile | Role |
|----------------|---------|------|
| `redis`        | —       | datastore |
| `redis-rest`   | —       | Upstash-REST shim in front of `redis` |
| `api`          | —       | the Worker via `wrangler dev` (R2 local), port **8787** |
| `web`          | `dev`   | Vite dev server, port **5173**, `VITE_API_BASE=http://localhost:8787` |
| `web-e2e`      | `e2e`   | Vite dev server with `VITE_API_BASE=http://api:8787` (browser runs *inside* the network) |
| `playwright`   | `e2e`   | Playwright system tests against `web-e2e` |
| `web-unit`     | `unit`  | `vitest` for the frontend |
| `api-unit`     | `unit`  | `vitest` for the Worker |

The `api` service injects local-only config with `wrangler dev --var` (Redis URL/
token, a throwaway `JWT_SECRET`, and the allowed CORS origins for both the host
and in-network browsers).

### The one subtlety: `VITE_API_BASE`

`VITE_API_BASE` is read by the **browser**, so its value depends on where the
browser runs:

- **`make dev`** — your browser is on the host → it calls the host-mapped
  `http://localhost:8787`.
- **`make e2e`** — the browser runs inside the Playwright container → it calls the
  compose hostname `http://api:8787`.

That's why there are two web services (`web` and `web-e2e`). The Worker's allowed
CORS origins include both `http://localhost:5173` and `http://web-e2e:5173`.

## Commands (via the `Makefile`)

```bash
make dev        # full dev stack with live reload (Ctrl-C to stop)
make test       # all unit tests in Docker  (= test-api + test-web)
make test-web   # web unit tests only
make test-api   # api unit tests only
make e2e        # stack up + Playwright, exits with the test status, then tears down
make down       # stop everything + remove volumes (fresh slate)
make build      # pre-build all images
make help       # list targets
```

Under the hood these are plain compose calls, e.g.:

```bash
docker compose --profile dev up
docker compose run --rm api-unit
docker compose --profile e2e up --build --abort-on-container-exit --exit-code-from playwright
```

## End-to-end tests (`e2e/`)

Playwright (Chromium) drives the real UI against the full stack:

1. home page renders the shelf + auth actions,
2. signup → create a project → upvote it,
3. owner uploads media and it serves back from (local) R2.

`e2e/global-setup.js` waits for the API and web to answer before tests start.
Failures keep a Playwright trace (`trace: retain-on-failure`).

## Notes

- The `api` image is **Node 22** (wrangler 4 requires ≥ 22) on debian-slim
  (workerd is a glibc binary, so not alpine). `web` and `e2e` are fine on Node 20.
- Source is bind-mounted for live reload; `node_modules` live in named volumes
  (seeded from each image), so host/linux binaries never clash.
- Redis data is in-memory (no volume) → every `make e2e` / restart starts clean.
- This is **local-only**. Production still deploys via GitHub Pages (frontend) and
  `wrangler deploy` (Worker) against real Upstash + R2 — see `docs/DEPLOY.md`.
