# ADR-0002: Media — capture at creation, up to 3, larger presentation

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

## Context

Originally a project was created text-only; media could be added only *after*
creation, by the owner, one file at a time from the open-book overlay. The server
capped media at 12 per project (`media.slice(0, 12)`), and the book rendered
thumbnails in a small `minmax(120px, 1fr)` grid that wasted the available width.

Three asks: (1) let makers attach media while first creating the entry; (2) allow
**up to 3** images/video per project; (3) show those thumbnails larger when a
project is open.

## Decision

- **Capture at creation.** The create form gains an optional multi-file picker
  (`accept="image/*,video/*"`, up to 3). On submit we `createProject(...)` as
  before, then upload each chosen file to `POST /projects/:id/media` against the
  new id. We reuse the existing media endpoint rather than build a multipart
  create — the create stays a small JSON call and uploads stream individually,
  which also lets each file be size-checked and quota-counted on its own.
- **Cap of 3.** The per-project media cap drops from 12 to **3**, enforced
  server-side in `POST /projects/:id/media` via a pure
  `assertMediaCapacity(existingCount, MAX_MEDIA)` guard (`MAX_MEDIA = 3`) that
  throws `409` when full, plus a defensive `slice(0, MAX_MEDIA)` on write. The
  client also stops the picker at 3. Server is authoritative.
- **Larger presentation.** The book's media grid grows to `minmax(260px, 1fr)`
  with a taller cap, so thumbnails occupy a wide, legible band instead of a thin
  strip.

## Consequences

- Makers can submit a complete entry in one flow; no "create then hunt for the
  upload control" step.
- Per-file size limits and daily R2 quota still apply per upload (unchanged),
  because we reuse the single-file endpoint.
- The cap change to 3 is global: existing projects with >3 media keep what they
  have (we never delete) but cannot add more until under the cap.
- Create-time uploads are best-effort and sequential: if one file fails (e.g.
  too large), the project is already created and the remaining files still try;
  the user gets a per-file toast. We deliberately don't roll back the project.

## Alternatives considered

- **Multipart `POST /projects` carrying files** — one request, but couples
  project creation to binary handling, complicates per-file quota accounting, and
  duplicates logic already in the media endpoint. Rejected (DRY/YAGNI).
- **Keep the 12 cap** — contradicts the explicit "up to 3" requirement and lets a
  single project dominate storage. Rejected.
