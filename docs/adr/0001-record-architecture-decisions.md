# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

## Context

The project has accumulated non-obvious design decisions (mock-mode frontend,
Upstash-REST shim for local Redis, R2 media keying, quota guards, JWT sessions)
that today live only in code comments, commit messages, and one engineer's head.
As the surface grows — trust scores, roles/moderation, media policy — we need a
durable, reviewable record of *why* each architectural choice was made, so future
changes can build on (or deliberately overturn) them rather than rediscover them.

## Decision

We will keep **Architecture Decision Records** under `docs/adr/`, one Markdown
file per decision, numbered `NNNN-short-title.md`, in the light Nygard style
described in [`docs/adr/README.md`](README.md).

Each ADR has a **Status** (`Proposed` → `Accepted` → `Deprecated` / `Superseded`).
ADRs are append-only: superseding a decision means a new ADR plus a status flip
and back-link on the old one, never an in-place rewrite. New significant
architectural or cross-cutting decisions get an ADR; small local refactors do not.

## Consequences

- A single place to read the system's rationale; onboarding and review get easier.
- A tiny per-decision cost (write the record) and the discipline to keep the index
  current.
- "Proposed" ADRs become the natural review surface for architectural change —
  e.g. trust-based limits and RBAC land here as proposals before any code.

## Alternatives considered

- **A single `DECISIONS.md`** — simpler, but merges/diffs poorly and has no
  per-decision status or supersession trail.
- **Wiki / external doc** — drifts from the code; not versioned with the change
  that implements it. ADRs-in-repo travel with the diff that realizes them.
