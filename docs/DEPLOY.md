# Deployment runbook

## Status

| Piece | State |
|-------|-------|
| GitHub repo | `colbygk/ratemyvibecodedthing` (public) |
| CI (tests) | runs on every push/PR |
| GitHub Pages | enabled, **Actions** source, custom domain `ratemyvibecodedthing.ai` |
| Frontend | deployed (mock mode until `VITE_API_BASE` is set) |
| Cloudflare Worker | **not yet deployed** (needs `wrangler login` + secrets) |
| Upstash Redis | **not yet created** |
| R2 bucket | **not yet created** |
| DNS | **not yet configured** |

## 1. DNS — point the apex at GitHub Pages

At your DNS host for `ratemyvibecodedthing.ai`, add:

```
# Apex A records → GitHub Pages
@   A      185.199.108.153
@   A      185.199.109.153
@   A      185.199.110.153
@   A      185.199.111.153
# Apex AAAA records (IPv6)
@   AAAA   2606:50c0:8000::153
@   AAAA   2606:50c0:8001::153
@   AAAA   2606:50c0:8002::153
@   AAAA   2606:50c0:8003::153
# optional www → repo
www CNAME  colbygk.github.io.
```

Redirect the `.tech`, `.com`, `.online` domains to `https://ratemyvibecodedthing.ai`
(301) at the registrar.

After DNS propagates, in repo Settings → Pages, tick **Enforce HTTPS**
(or it flips on automatically once the cert is issued).

## 2. Backend — Cloudflare Worker + Upstash + R2

```bash
cd api
npx wrangler login                                  # interactive (browser)

# Upstash: create a Redis database at https://console.upstash.com → copy the
# "REST API" URL and token.

npx wrangler r2 bucket create rmvct-media
npx wrangler secret put UPSTASH_REDIS_REST_URL      # paste REST URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN    # paste REST token
npx wrangler secret put JWT_SECRET                  # any long random string

npm run deploy                                      # → prints the Worker URL
```

The deploy prints a URL like `https://rmvct-api.<subdomain>.workers.dev`.

## 3. Connect frontend → API

Set the repo Actions **variable** `VITE_API_BASE` to the Worker URL, then redeploy:

```bash
gh variable set VITE_API_BASE --repo colbygk/ratemyvibecodedthing \
  --body "https://rmvct-api.<subdomain>.workers.dev"
gh workflow run "Deploy frontend to GitHub Pages" --repo colbygk/ratemyvibecodedthing
```

The next Pages build bakes in the API base and the site leaves mock mode.

## 4. (Optional, later) API on a custom subdomain

To serve the API from `api.ratemyvibecodedthing.ai`, move the zone's DNS to
Cloudflare, then in `api/wrangler.toml` uncomment the `[[routes]]` custom_domain
block and redeploy. Until then the `*.workers.dev` URL works fine.
