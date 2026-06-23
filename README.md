# ratemyvibecodedthing.ai

A library shelf of **vibe-coded** projects. Each submission is a book; you see only
the spines. Click a spine and the book opens to reveal the project's description,
links, and user-supplied images/video. Visitors can up/down-vote (one vote per
visitor); account holders vote freely, leave free-form notes, and follow makers.

Design: minimal, editorial, typography-forward (in the spirit of
[Since You Arrived](https://www.awwwards.com/sites/since-you-arrived)), with an
"AI" sensibility — Fraunces / Space Grotesk / Space Mono, dark ink ground, and
faint PCB circuit traces with travelling light pulses around the periphery.
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
```

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

GET    /projects               top of shelf, by net score
GET    /projects/:id
POST   /projects               (Bearer) create
POST   /projects/:id/vote      {dir:"up"|"down", note?}  (anon: 1/IP; user: +note)
POST   /projects/:id/media     (Bearer, raw image/video body) → stored in R2
GET    /media/<key>            serve R2 object

GET    /me/projects            (Bearer) your submissions

POST   /users/:name/follow     (Bearer)        SADD following/followers
DELETE /users/:name/follow     (Bearer)        SREM following/followers
GET    /users/:name/graph      → {followers, following} counts
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
