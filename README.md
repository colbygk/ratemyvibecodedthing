# ratemyvibecodedthing.ai

A library shelf of **vibe-coded** projects. Each submission is a book; you see only
the spines. Click a spine and the book opens to reveal the project's description,
links, and user-supplied images/video. Visitors can up/down-vote (one vote per
visitor); account holders vote freely, leave free-form notes, and follow makers.

Design: minimal, editorial, typography-forward (in the spirit of
[Since You Arrived](https://www.awwwards.com/sites/since-you-arrived)), with an
"AI" sensibility — Fraunces / Space Grotesk / Space Mono, dark ink ground, and a
faint, living node network in the periphery: nodes drift along a swirling flow
field and link with curved filaments (an organic, reaction-diffusion feel).
Built following the [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
minimalism guidance.

## Repository layout

```
web/                 Static frontend (Vite, vanilla JS) → GitHub Pages
  index.html
  public/CNAME       ratemyvibecodedthing.ai
  src/
    styles/          design tokens + main stylesheet
    lib/             api client, mock data, spine styling, toast
    components/      circuits (canvas), shelf, book, auth/submit modals
api/                 Cloudflare Worker API (Upstash Redis + R2)
  src/index.js
  wrangler.toml
.github/workflows/   GitHub Pages deploy
docs/adr/            Architecture Decision Records (see docs/adr/README.md)
```

## Architecture decisions

Significant design decisions are recorded as **ADRs** under
[`docs/adr/`](docs/adr/README.md) (Proposed → Accepted → Deprecated). Current set
covers media capture & presentation, surfacing project notes, the per-user trust
score, graduated upload limits by trust, and role-based access control carried in
the JWT (first user = super admin; moderators can hide projects and remove notes).

## Architecture

| Concern        | Choice | Free tier |
|----------------|--------|-----------|
| Frontend host  | **GitHub Pages** (static) | free |
| API            | **Cloudflare Workers** | 100k req/day |
| Accounts / votes / follow graph | **Upstash Redis** (REST) | 10k cmd/day |
| Images / video | **Cloudflare R2** | 10 GB + zero egress |

The follow graph uses Redis **sets** exactly as you described:
`following:<user>` and `followers:<user>`.

> **Mock mode:** with no `VITE_API_BASE` set, the frontend runs entirely on local
> sample data — open the shelf, browse, vote, "log in", submit — no backend needed.
> This is how it behaves out of the box.

## Engineering conventions

Further work follows **TDD, DRY, SOLID, YAGNI**:

- **TDD** — write/extend a failing test first, then the code. Pure logic lives in
  small modules (`web/src/lib/*`, `api/src/lib/*`) so it's testable without a
  browser or live Redis/R2. `npm test` in either package; CI runs both on push.
- **DRY** — shared helpers are extracted once (e.g. crypto + HTTP utils were
  pulled out of the Worker into `api/src/lib/`); no copy-pasted logic.
- **SOLID** — modules have one responsibility; side effects (clock, network) are
  injected, not hard-wired (e.g. `signJWT(payload, secret, nowMs)` takes the time
  so expiry is deterministically testable).
- **YAGNI** — build only what a current requirement needs; no speculative layers.

### Tests

```bash
cd web && npm test     # spine styling, mock data, mock-mode API (anon vote limit, sessions)
cd api && npm test     # PBKDF2 hashing, JWT sign/verify/expiry, validation, CORS, helpers
```

41 tests today. Two were red on first run and caught real bugs: signed-vs-unsigned
bit-shift in spine sizing, and a 204-with-body misuse — both fixed.

## Local stack with Docker (no host Node required)

Everything — dev, unit tests, and end-to-end/system tests — runs in Docker. The
Worker's Upstash Redis is served locally by a `redis` container behind an
Upstash-REST shim (`serverless-redis-http`), and R2 is simulated by `wrangler dev`.
No Cloudflare/Upstash account or secrets needed; production is never touched.

```bash
make dev     # full stack: web http://localhost:5173 → api http://localhost:8787
make test    # all unit tests (web + api) in containers
make e2e     # bring up the stack + run Playwright system tests, then exit
make down    # stop everything and wipe local volumes
```

See **[docs/DOCKER.md](docs/DOCKER.md)** for the architecture and details.

## Run the frontend locally

```bash
cd web
npm install
npm run dev          # http://localhost:5173  (mock mode)
```

## Run / deploy the API

```bash
cd api
npm install
# one-time setup:
wrangler r2 bucket create rmvct-media
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put JWT_SECRET           # any long random string
npm run dev          # local Worker
npm run deploy       # → Cloudflare
```

Then connect the frontend to the live API by setting a GitHub repo **variable**
`VITE_API_BASE` (Settings → Secrets and variables → Actions → Variables) to your
Worker URL, e.g. `https://api.ratemyvibecodedthing.ai`.

## Domains

`ratemyvibecodedthing.ai` is the canonical site (see `web/public/CNAME`). Point
the `.tech`, `.com`, and `.online` domains at it with a 301 redirect at your
registrar/DNS.

## API surface (Worker)

```
POST   /auth/signup            {username, password} → {token, user}
POST   /auth/login             {username, password} → {token, user}
GET    /auth/me                (Bearer) → user
PATCH  /auth/me                (Bearer) update own profile {bio?, github?, links?}

GET    /projects               top of shelf, by net score
GET    /projects/:id
POST   /projects               (Bearer) create
POST   /projects/:id/vote      {dir:"up"|"down", note?}  (anon: 1/IP; user: +note)
GET    /projects/:id/notes     → {notes:[{username, note}]}  (public read)
POST   /projects/:id/versions  (Bearer, owner) publish a new doc version (ADR-0007)
GET    /projects/:id/versions  → {versions:[{v, created, changelog, current}]}
GET    /projects/:id/versions/:v → that version's preserved docs
POST   /projects/:id/media     (Bearer, raw image/video body) → R2  (max 3/project)
GET    /media/<key>            serve R2 object

GET    /me/projects            (Bearer) your submissions

POST   /users/:name/follow     (Bearer)        SADD following/followers
DELETE /users/:name/follow     (Bearer)        SREM following/followers
GET    /users/:name/graph      → {followers, following} counts

# moderation / admin (RBAC via JWT role claim — ADR-0006)
POST   /projects/:id/hide        {hidden}            (moderator+)  soft-hide off the shelf
DELETE /projects/:id/notes/:user                     (moderator+)  remove a note
GET    /users/:name/admin        → {role, trust}     (moderator+)
POST   /users/:name/role         {role}              (super_admin) grant/revoke role
POST   /users/:name/trust        {trust}             (super_admin) set trust (ADR-0005)
```

## Status / next steps

- [x] Frontend scaffold: shelves, spines, opening-book overlay, circuit canvas, auth + submit modals, mock mode
- [x] Worker API skeleton: auth (PBKDF2 + JWT), projects, voting, follow sets, R2 media
- [x] Test suites (Vitest) for web + api, CI workflow, pure-logic modules extracted
- [x] Wide-display layout (shelves span up to 2600px instead of capping at 1600px)
- [ ] Wire media upload UI to `POST /projects/:id/media`
- [ ] "My projects" / profile view + follow buttons in the UI
- [ ] Create GitHub repo, enable Pages (Source: GitHub Actions), add DNS + `VITE_API_BASE`
- [ ] Provision Upstash + R2, set Worker secrets, attach `api.` custom domain
```

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
