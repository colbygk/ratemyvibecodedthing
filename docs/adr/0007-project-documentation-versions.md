# ADR-0007: Versioned project documentation

- **Status:** Accepted
- **Date:** 2026-06-26
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

> **Accepted.** The four open questions are resolved (see **Decisions** below).
> The API/data-model is being implemented; the book "flip back through versions"
> UX follows. Relates to [ADR-0002](0002-media-capture-and-presentation.md)
> (media), [ADR-0003](0003-surface-project-notes.md) (notes), and
> [ADR-0005](0005-graduated-upload-limits-by-trust.md) (upload limits/cost).

## Context

A vibe-coded thing evolves: the maker reworks the description, swaps screenshots,
adds links, ships a v2. Today the only way to reflect that is `PATCH /projects/:id`,
which **mutates the documentation in place** — the previous write is gone, and there
is no record that the thing the community voted on has since changed.

We want makers to **publish new versions of a project's documentation** while
keeping the project's identity and, crucially, its **accrued reception**. The
request is explicit: *votes apply to all versions* — a rewrite must not reset or
fork the score.

A happy accident of the current model makes this clean: **votes, notes, and the
follow graph are already keyed on the project id, not on its content** (`votes:<id>`,
`notes:<id>`, `project:<id>` up/down, `projects:byScore`). So "votes span all
versions" is the *natural* outcome of keeping those at the project level and
versioning only the documentation.

## Decision (proposed)

Treat a **project as a container** with an ordered list of **documentation
versions**. Project-level facts stay shared; documentation becomes versioned.

**What is shared (project-level, unchanged):**
- identity: `author`/owner, `coverColor`/`coverSeed` (spine), `created`, `hidden`
- reception: `up`/`down`, `votes:<id>`, `projects:byScore`/`byNew`
- social: follow graph, and (by default) `notes:<id>` — see open questions

**What is versioned (per version `v1…vN`):**
- `title`, `description`, `links`, `media`, the version's `created`, and an
  optional author-supplied **changelog line** ("what changed").

**Storage (proposed).** Keep the *current* version's display fields denormalised
on `project:<id>` exactly as today, so the shelf/list read path stays cheap and
unchanged. Store prior versions in a history structure, e.g.:

```
project:<id>            HASH   …shared fields… + current version's display fields + currentVersion=<N>
project:<id>:versions   LIST   append-only JSON snapshots of superseded versions
                               { v, title, description, links, media, created, changelog }
```

Publishing a new version = snapshot the current fields into history, then overwrite
`project:<id>` with the new version and bump `currentVersion`. Old versions' R2
objects are **retained** so historical pages still render.

**API (proposed).**
- `POST   /projects/:id/versions`  (owner; moderators?) — publish a new version.
- `GET    /projects/:id/versions`  → list of version metadata (v, created, changelog).
- `GET    /projects/:id/versions/:v` → a specific version's full document.
- `GET    /projects/:id` → current version (unchanged shape).
- `POST   /projects/:id/media` → attaches to the **current** version.
- `PATCH  /projects/:id` stays as *edit the current version in place* (typo fixes),
  distinct from publishing a new version. The UI makes the choice explicit
  ("save edit" vs "publish new version").

**Voting/notes (proposed).** Unchanged — `POST /projects/:id/vote` keeps writing to
the project id, so a vote counts for the project across every version. This is the
crux of the requirement and needs no new mechanism.

**Book UX (proposed).** The open book shows the **current** version. Earlier
versions live "further back in the book": a subtle control — `← v2 · Apr 2026` —
flips back through history (newest at the front), with a `v3 of 3` indicator and
the changelog line. Page-turn styling fits the existing open-book metaphor. The
owner gets a `＋ publish new version` action alongside the current `✎ edit`.

**Migration.** Existing projects are implicitly **v1**: a project with no history
is a single-version project. The first published version creates v2 and back-fills
v1 from the current fields. No data rewrite needed up front.

## Consequences

- **Reception persists across rewrites** — the maker can overhaul the docs without
  the community's votes/notes resetting or fragmenting. Provenance of how a
  project evolved becomes visible.
- **Storage grows with history.** Each retained version keeps its media in R2.
  This needs a policy: a per-version media cap (extending [ADR-0005](0005-graduated-upload-limits-by-trust.md)),
  and likely a cap on retained versions (or pruning the oldest), counted against
  the storage quota in `quota.js`. Cost is the main downside.
- **Read paths:** shelf/list unchanged (current snapshot on `project:<id>`); the
  book lazy-loads history only when the reader flips back.
- **Moderation ([ADR-0006](0006-role-based-access-control-via-jwt.md)):** hiding a
  project hides all versions; per-version hide/removal is a possible later refinement.
- **Edit-vs-version ambiguity** must be surfaced in the UI so makers don't
  accidentally erase history with an in-place edit.

## Decisions (resolved)

1. **Notes are project-level** — a note rides the whole project (consistent with
   votes spanning versions). Not pinned to a version.
2. **A rename is the same project** — `title` is versioned in each snapshot, and
   the spine reflects the current title. No new project on rename.
3. **Owner-only publishing** — only the project's author may publish a new
   version. (Moderators can still hide a project, per ADR-0006, but don't author
   someone's content.)
4. **Retention: keep the last 5 versions** (current + 4 in history). The
   per-version media cap is the uploader's trust tier (ADR-0005). When a version
   is pruned out of history, its R2 media is deleted and the storage quota counter
   is released, so storage stays bounded.

### As-built notes

- **Media is per-version and does not carry over:** a newly published version
  starts with *empty* media; the owner uploads fresh media for it (via the
  existing media endpoint, which targets the current version). The previous
  version keeps its own media in its snapshot. This keeps pruning safe — a pruned
  version's R2 objects are exclusively its own, so deleting them can't break a
  surviving version.
- Migration: existing projects read back as **v1** implicitly (`version` defaults
  to 1); the first publish creates v2 and the prior state becomes the v1 snapshot.

## Alternatives considered

- **Edit-in-place only (status quo).** Simplest, zero new surface — but every
  update silently destroys the documentation the community rated. Rejected: it's
  the very problem this ADR addresses.
- **Each version is its own project, linked by a `supersedes` pointer.** Clean
  separation, but **votes/notes would split across version ids** — directly
  contradicting "votes apply to all versions" — and it fragments the shelf into
  near-duplicate spines. Rejected.
- **Full VCS-style line diffing of the docs.** Over-engineered; makers want
  point-in-time snapshots ("v2"), not text diffs. Rejected (YAGNI).
- **Inline JSON array of all versions on `project:<id>`.** Simplest storage, but
  the hash grows unbounded (media arrays per version) and bloats every shelf read.
  A separate append-only history structure keeps the hot read path small.
