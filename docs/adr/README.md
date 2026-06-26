# Architecture Decision Records (ADRs)

This directory holds the project's **Architecture Decision Records** — short
documents that capture a single significant architectural/design decision, the
context that forced it, and its consequences. The point is a durable, reviewable
trail: *why* the system is shaped the way it is, not just *what* the code does.

We follow a light [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
style.

## Lifecycle (status field)

Every ADR carries a **Status**. The states we use:

| Status         | Meaning |
|----------------|---------|
| **Proposed**   | Written and up for review. Not yet implemented. Open to change. |
| **Accepted**   | Agreed and in force. Either implemented, or being implemented. |
| **Deprecated** | No longer the current design — superseded or withdrawn. Kept for history. |
| **Superseded** | Like Deprecated, but points at the ADR that replaced it (`Superseded by ADR-NNNN`). |

ADRs are **append-only**: we don't delete or rewrite an accepted decision. When
thinking changes, we add a *new* ADR and flip the old one to `Deprecated` /
`Superseded by ADR-NNNN`, with a back-link added to the old record.

## Workflow

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` (next number).
2. Fill it in with **Status: Proposed** and open it for review.
3. On agreement, change to **Status: Accepted** and implement.
4. If a later decision overrides it, set the old one to **Deprecated** /
   **Superseded by ADR-NNNN** and link both ways.

Numbers are zero-padded, monotonic, and never reused.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted |
| [0002](0002-media-capture-and-presentation.md) | Media: capture at creation, up to 3, larger presentation | Accepted |
| [0003](0003-surface-project-notes.md) | Surface project notes (add a read path) | Accepted |
| [0004](0004-per-user-trust-score.md) | Per-user trust score | Accepted |
| [0005](0005-graduated-upload-limits-by-trust.md) | Graduated upload limits by trust | Accepted |
| [0006](0006-role-based-access-control-via-jwt.md) | Role-based access control via JWT claims | Accepted |
| [0007](0007-project-documentation-versions.md) | Versioned project documentation | Accepted |
