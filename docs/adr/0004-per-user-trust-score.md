# ADR-0004: Per-user trust score

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

## Context

We want a lever to eventually resist abuse: brand-new accounts spamming, or many
slowly-created accounts that are individually under any rate limit but in
aggregate flood the system (a Sybil pattern). Before any such mechanism can act,
the system needs a per-user notion of how trusted an account is.

This ADR introduces *only the attribute*. Per the requirement, there are
**currently no adjustments to it and no behavior keyed on it** — that is the
subject of follow-on ADRs (see ADR-0005 for graduated upload limits).

## Decision

- Every user record gains a **`trust`** field, an integer that **starts at 1** at
  signup. It is stored alongside `pwhash`/`salt`/`created` in `user:<username>`.
- `trust` is returned in the public user shape (`/auth/me`, login response) so the
  client/UI can see it, but nothing reads it to make a decision yet.
- The default and the user-record field list are centralized in a small pure
  module (`api/src/lib/user.js`: `DEFAULT_TRUST`, `newUserFields`,
  `publicUserShape`) so the value lives in one place and is unit-tested.
- Backward compatible: users created before this change have no `trust` field;
  reads default a missing value to `1`.

## Consequences

- A foundation exists for anti-spam without committing to any specific policy.
- No behavior change today — trust is inert. Keeping it inert now (YAGNI) avoids
  baking in a scoring model before we understand the abuse we're defending.
- Future work (separate ADRs) will define: how trust changes over time/behavior,
  and what it gates (upload size, post rate, follow rate, etc.).

## Alternatives considered

- **Derive trust on the fly from account age / activity** — no stored field, but
  every consumer recomputes it and we can't pin/override a specific account.
  Storing an explicit integer is simpler and adjustable. 
- **Wait until a limit needs it** — but the requirement explicitly asks for the
  attribute now, and having it in place lets later ADRs focus purely on policy.
