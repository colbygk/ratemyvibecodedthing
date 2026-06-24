# Cost & abuse guardrails

Goal: **no surprise bills.** Protection is layered. The app-level quotas are a
safety net; the provider-side caps are the real guarantee. **Do both.**

## Layer 1 — Provider-side caps (the real guarantee — set these once)

These cannot be bypassed by an app bug, a traffic spike, or Redis being down.

### Cloudflare Workers — stay on the **Free** plan
The Free plan **hard-blocks at 100,000 requests/day** and never bills overage.
Do not upgrade to Workers Paid unless you intend to pay for overages. (If you do
upgrade, the Layer-2 `request` quota below becomes your stand-in cap.)

### Upstash Redis — Free tier or a budget cap
The danger is pay-as-you-go billing. Either:
- Keep the database on the **Free** tier (it **rejects** commands past the daily
  limit instead of charging), **or**
- In the Upstash console → your database → set a **monthly budget cap** to a low
  value. Past it, Upstash disables the DB rather than billing more.

### Cloudflare R2 — billing alerts (R2 does **not** auto-stop)
R2 is the only piece that bills overage with no automatic cutoff. So:
- Cloudflare dashboard → **Notifications** → create a **Billing / usage** alert
  (e.g. notify at $1). 
- The Layer-2 storage cap below keeps stored bytes under the 10 GB free tier, but
  the alert is your backstop if anything slips.

## Layer 2 — App-level daily quotas (graceful degradation)

Implemented in `api/src/lib/quota.js`, enforced in the Worker. Counters are
per-UTC-day Redis keys with a 48h TTL; R2 storage is tracked cumulatively. When a
limit is hit, the API returns **HTTP 429** with a clear message naming the limit
and that it **resets at 00:00 UTC** — the frontend surfaces this to the user.

| Resource | Default cap | Guards against | Override var |
|----------|-------------|----------------|--------------|
| `request` | 20,000 / day | Workers requests + Upstash commands | `LIMIT_REQUEST` |
| `r2_upload` | 500 / day | R2 Class A (write) ops | `LIMIT_R2_UPLOAD` |
| `r2_read` | 20,000 / day | R2 Class B (read) ops | `LIMIT_R2_READ` |
| storage total | ~9 GB | R2 storage ($/GB-month) | `MAX_STORAGE_BYTES` |
| per file | 25 MB | huge single uploads | `MAX_UPLOAD_BYTES` |

Defaults sit well under the free tiers. The `request` cap is a proxy: one API
request issues several Redis commands, so keep `LIMIT_REQUEST` × (~8 commands)
under your Upstash daily command budget.

Override any cap without a code change:
```bash
cd api
npx wrangler deploy --var LIMIT_REQUEST:10000   # or set [vars] in wrangler.toml
```

### Check current usage
```
GET https://rmvct-api.ratemyvibecodedthing.workers.dev/usage
```
Returns today's `used` vs `limit` per resource plus stored bytes. This endpoint
is intentionally **not** counted, so monitoring never trips the limit.

## Fail-safe behavior

- **R2 checks run before any R2 write/read.** If Redis is unreachable, the check
  throws and the upload/serve is **refused** (fail-closed = cost-safe).
- Storage reservations **roll back** if the total cap would be exceeded, so a
  rejected upload never inflates the counter.
- If Upstash itself hits its cap, its commands start failing and the API returns
  an error — degraded, but still no charge (on Free / budget-capped Upstash).
