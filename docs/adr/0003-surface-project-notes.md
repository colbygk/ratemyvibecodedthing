# ADR-0003: Surface project notes (add a read path)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Deciders:** cgk
- **Supersedes:** —
- **Superseded by:** —

## Context

Logged-in users can attach a free-form **note** when they vote. The note is
persisted — `POST /projects/:id/vote` writes it to the Redis hash `notes:<id>`,
keyed by username (`index.js`). But **no route ever reads it back**, and the book
overlay never renders notes. The textarea was effectively write-only: a user's
note appeared "lost" because nothing loads or displays it. This was a defect, not
a design choice.

## Decision

- Add `GET /projects/:id/notes` → `[{ username, note }]`, read from `notes:<id>`
  via `HGETALL` and shaped by a pure `notesObjectToList(obj)` helper (unit-tested
  without Redis).
- The book overlay fetches notes on open and renders them in a notes list under
  the description. When a logged-in user submits a vote **with** a note, the UI
  optimistically shows their note immediately.
- Notes are **public reads** (no auth required to view), consistent with votes
  being a public signal about a project. Writing a note still requires being
  logged in (unchanged).

## Consequences

- Notes are now visible to everyone viewing a project — this is a deliberate
  visibility decision, recorded here. If we later want private/owner-only notes
  or moderation of note content, that is a new decision (and ties into the
  roles/RBAC ADR-0006).
- One extra GET per book-open. Notes are capped (1000 chars each, one per user
  per project) so payloads stay small.
- No schema change: we already stored notes; we only added the read path.

## Alternatives considered

- **Return notes inside `GET /projects/:id`** — fewer round-trips, but bloats the
  shelf/detail payload (which is also used for the list view) and couples vote
  notes to the core project shape. A dedicated endpoint keeps the project record
  lean and lets the book lazy-load notes. 
- **Drop notes entirely** — they're a requested feature; the bug was the missing
  read path, not the concept. Rejected.
