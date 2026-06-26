# ADR-0005: Graduated upload limits by trust

- **Status:** Proposed
- **Date:** 2026-06-25
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

> **Proposed** — not implemented. This depends on the trust attribute from
> [ADR-0004](0004-per-user-trust-score.md) and on a (still undefined) mechanism
> for trust to actually change. Implement only once accepted.

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
