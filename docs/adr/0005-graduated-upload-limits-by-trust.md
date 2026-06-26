# ADR-0005: Graduated upload limits by trust

- **Status:** Accepted
- **Date:** 2026-06-25 (accepted 2026-06-26)
- **Deciders:** cgk
- **Supersedes:** the fixed `MAX_MEDIA = 3` of [ADR-0002](0002-media-capture-and-presentation.md)
- **Superseded by:** —

> **Accepted & implemented.** Builds on the trust attribute from
> [ADR-0004](0004-per-user-trust-score.md). The manual trust-set endpoint from
> [ADR-0006](0006-role-based-access-control-via-jwt.md) is the interim mechanism
> by which trust changes (a super_admin sets it) until an automated progression
> model exists. See **Implementation** below for the as-built decisions.

## Context

Today the per-file upload limit is a single conservative constant
(`DEFAULT_MAX_UPLOAD_BYTES = 25 MB`, override `MAX_UPLOAD_BYTES`) applied to
everyone. 25 MB is **not** a hard free-tier limit; the real ceilings are
Cloudflare's proxy body limit (**100 MB** on the free plan — a hard wall for
anything streamed through the Worker) and R2 storage/egress cost (cumulative cap
~9 GB in `quota.js`).

A flat limit treats a brand-new account the same as a long-standing trusted one.
We'd like new/low-trust accounts to be more constrained (smaller files, fewer
items) and trusted accounts to be allowed more, as one lever against spam and
cost blow-ups.

## Decision (proposed)

Make the per-file size cap (and optionally the per-project media count) a pure
function of the user's `trust` score, evaluated server-side at upload time.

Proposed ladder (starting point for review — tune before accepting):

| Trust | Max file size | Media / project | Notes |
|------:|--------------:|----------------:|-------|
| 1 (new)        | 10 MB | 3 | default for every fresh account |
| 2–4            | 25 MB | 3 | current global default |
| 5–9            | 50 MB | 4 | established |
| 10+ (trusted)  | 90 MB | 5 | just under the 100 MB Worker wall |

- A pure `uploadLimitsFor(trust)` helper returns `{ maxBytes, maxMedia }`; the
  media endpoint calls it instead of reading a flat constant. Unit-tested across
  the tiers and boundaries.
- The absolute ceiling stays **< 100 MB** regardless of trust (Worker limit).
- `MAX_UPLOAD_BYTES` env override, if set, acts as a hard upper clamp over the
  whole ladder (ops kill-switch).

This stays inert until **trust can actually move** (a separate decision). With
every account pinned at `trust = 1`, accepting this ADR alone would simply lower
everyone to the 10 MB tier — so it should land *together with* a trust-progression
mechanism, or with the tier-1 size raised to today's 25 MB to avoid a regression.

## Implementation (as-built)

- **Tier 1 stays at today's 25 MB / 3** (not the originally-floated 10 MB) so
  introducing trust never *lowers* anyone's limit — with every account at
  `trust = 1`, nobody regresses; trust only ever grants *more*. Ladder:
  `trust 1 → 25 MB/3`, `2–4 → 35 MB/3`, `5–9 → 50 MB/4`, `≥10 → 90 MB/5`.
- Pure `uploadLimitsFor(trust, env)` in `api/src/lib/upload-limits.js`; the media
  endpoint reads the uploader's trust and applies `{maxBytes, maxMedia}`.
  `reserveStorage(...)` gained a per-file override arg. Client mirror in
  `web/src/lib/limits.js` sizes the picker (server stays authoritative).
- `MAX_UPLOAD_BYTES` env only ever *lowers* the ceiling (ops kill-switch); every
  tier stays < 100 MB.
- **Trust-change mechanism:** a super_admin sets a user's trust via
  `POST /users/:name/trust` (ADR-0006). Automated/behavioral progression remains
  future work.
- **Video gets a higher per-file cap than images:** `uploadLimitsFor` returns a
  separate `maxVideoBytes` with a **50 MB floor** (so even tier-1 video is 50 MB),
  rising with the tier and clamped under the 100 MB Worker wall. The media
  endpoint picks the cap by content-type.

## Consequences

- New accounts get less ability to burn storage/egress before they've earned
  trust; trusted makers get room for real video.
- Introduces a coupling: upload behavior now depends on the (future) trust model.
  Mis-tuned tiers could frustrate legitimate new users — hence "Proposed", tune
  with real data.
- Needs the count cap reconciled with [ADR-0002](0002-media-capture-and-presentation.md)
  (which fixed the count at 3); this ADR would make the count trust-dependent, so
  accepting it supersedes ADR-0002's fixed `MAX_MEDIA = 3`.

## Alternatives considered

- **Keep a flat 25 MB** — simplest, but no anti-abuse leverage and no reward for
  trusted makers.
- **Gate on account age instead of an explicit trust score** — implicit and
  unadjustable; can't pin/override a specific account. ADR-0004 chose an explicit
  score for exactly this reason.
- **Rate-limit count/bytes per day per account instead of per-file tiers** — a
  complementary lever (and probably also wanted), but orthogonal to per-file size;
  could be a further ADR.
