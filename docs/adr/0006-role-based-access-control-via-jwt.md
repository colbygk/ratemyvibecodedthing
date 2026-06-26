# ADR-0006: Role-based access control via JWT claims

- **Status:** Accepted
- **Date:** 2026-06-25 (accepted 2026-06-26)
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

> **Accepted & implemented.** Roles ride in the JWT; moderation endpoints + a
> moderator UI ship with this. See **Implementation** below for the as-built
> decisions (notably: first-user detection via SCAN rather than a counter, and
> soft-hide rather than hard-delete).

## Context

The site will need moderation: someone must be able to act on abusive content and
accounts. We want this driven by **roles**, and we want a role to be verifiable
**from the request itself** — carried as a signed JWT claim — so the common path
("can this caller do X?") is a constant-time HMAC verification we already perform,
not an extra Redis lookup per action.

In production the first account, `cgk`, was created by hand and must be treated as
**super admin**. Going forward, the first account created on a fresh deployment
should automatically be super admin.

## Decision (proposed)

**Role model.** Three roles, ordered:

| Role          | Can do |
|---------------|--------|
| `user`        | default; own content only |
| `moderator`   | hide/remove any project, remove note/media, soft-ban a user |
| `super_admin` | everything a moderator can, **plus** grant/revoke roles |

**Where the role lives.**
- Source of truth: a `role` field on `user:<username>` (default `user`).
- The role is **embedded as a claim in the JWT** at login/signup
  (`signJWT({ sub, role }, …)`), so `verifyJWT` returns it and authorization is a
  pure function of the verified token — no per-action DB read.
- Trade-off (documented, accepted by this proposal): a JWT is valid for its TTL
  (30 days). A role **downgrade** (e.g. revoking a moderator) won't take effect
  until the token expires or is refreshed, because we don't read the DB per
  action. For *revocation-sensitive* actions (banning, role changes) we will do a
  live DB check of the actor's current role, accepting one lookup there. Routine
  moderation trusts the claim. (If this becomes a problem, shorten the TTL or add
  a token version/`jti` deny-list — a future ADR.)

**Bootstrapping super admin.**
- Fresh deployments: the **first** successful signup is granted `super_admin`
  (detected via a `meta:user_count` counter seeded to the existing population on
  deploy, so an already-populated DB does **not** mis-grant the next signup).
- Existing production (`cgk`): authoritative bootstrap via a `SUPERADMINS`
  env var (comma-separated usernames). At token-issue time, any username in
  `SUPERADMINS` is elevated to `super_admin` regardless of stored role. This is
  the safe path for the already-created `cgk` and a break-glass for ops.
- A pure `effectiveRole(storedRole, username, superadmins)` and
  `roleForSignup(userCountAfterIncr)` encapsulate this and are unit-tested.

**Enforcement.** A pure capability map `can(role, action)` guards the (new)
moderation endpoints. Those endpoints — and the moderation UI — are part of this
ADR's implementation, to be built on acceptance.

## Implementation (as-built)

Differs from the original proposal in two safety-driven ways:

- **First-user detection via SCAN, not a counter+seed.** At signup we SCAN for any
  existing `user:<name>` account (`countAccounts`); super_admin is granted only
  when the count is 0. This is correct on the *already-populated* production DB
  with no migration/seed step and no risk of a later signup mis-claiming it. The
  `meta:user_count` counter idea was dropped.
- **`cgk` bootstrap via `SUPERADMINS` env** (a `wrangler.toml` var, set to `cgk`).
  `effectiveRole(stored, username, env.SUPERADMINS)` elevates allow-listed
  usernames at token-issue time. cgk gets super_admin on next login after deploy.
- **Soft-hide, not hard-delete**, for projects (`POST /projects/:id/hide`): hidden
  projects leave the shelf but stay in storage (reversible, no data loss) — in
  keeping with the project's data-safety stance.
- Pure helpers in `api/src/lib/roles.js` (`can`, `effectiveRole`, `roleAtLeast`,
  `firstUserRole`, …), unit-tested. Role rides in the JWT (`actorFromRequest`).
- Endpoints shipped: hide/unhide project, remove note (moderator+); set role, set
  trust, read a user's admin info (super_admin, **live**-rechecked for the two
  revocation-sensitive setters). UI: a moderator toolbar in the book overlay
  (hide toggle + per-note remove) and, for super_admins, in-context role/trust
  controls on the author — avoiding a separate user-management view.
- **Deferred to a follow-up:** soft-ban of a user account (touches login + every
  request), and audit-logging of moderation actions. Recorded here so the gap is
  explicit.

## Consequences

- Authorization for the hot path is offline/cryptographic — no extra Redis read
  per moderated action; scales with request volume, not DB capacity.
- The staleness window on downgrades is the explicit cost; mitigated by a live
  check on the few revocation-sensitive actions.
- Roles in the token means re-login (or refresh) is required for a role change to
  fully propagate — acceptable for an admin-granted change.
- Adds the first genuinely destructive endpoints (hide/remove/ban); these need
  their own audit-logging consideration (candidate follow-on ADR).

## Alternatives considered

- **DB lookup of role per action** — always fresh, immune to the staleness
  window, but a Redis read on every moderated request and on every permission
  check. The requirement explicitly favors "cryptographically determined via
  maths instead of lookups in a DB," so claims are primary with a targeted live
  check only where staleness is dangerous.
- **Single boolean `isAdmin`** — simpler, but can't express moderator-without-
  super-admin, and offers no growth path (trusted-tagger, etc.).
- **External authz service / policy engine** — overkill for one site on Workers;
  adds a dependency and latency for a three-role model.
