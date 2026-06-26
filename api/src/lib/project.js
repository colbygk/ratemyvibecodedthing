/**
 * Pure project-field sanitization, shared by create and edit paths.
 * Returns only the fields present in `patch`, validated and bounded. Throws
 * httpError on invalid input. Side-effect free → unit-testable.
 */

import { httpError } from "./util.js";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Max images/video per project (ADR-0002). Server-authoritative; the client also
// stops the picker here. (ADR-0005, still Proposed, would make this trust-based.)
export const MAX_MEDIA = 3;

// Guard before accepting another upload. Throws httpError(409) when the project
// already holds MAX_MEDIA (or more — legacy projects predate the lower cap).
export function assertMediaCapacity(existingCount, max = MAX_MEDIA) {
  if (existingCount >= max) {
    throw httpError(`This project already has the maximum of ${max} media items`, 409);
  }
}

export function sanitizeProjectEdits(patch = {}) {
  const out = {};

  if (patch.title !== undefined) {
    const title = String(patch.title).trim().slice(0, 80);
    if (!title) throw httpError("Title cannot be empty", 400);
    out.title = title;
  }

  if (patch.description !== undefined) {
    out.description = String(patch.description).slice(0, 600);
  }

  if (patch.coverColor !== undefined) {
    const color = String(patch.coverColor).trim();
    if (color && !HEX.test(color)) throw httpError("Invalid spine color (use #rrggbb)", 400);
    out.coverColor = color; // "" clears it → falls back to a deterministic cover
  }

  if (patch.links !== undefined) {
    if (!Array.isArray(patch.links)) throw httpError("links must be an array", 400);
    out.links = patch.links
      .slice(0, 6)
      .map((l) => ({
        label: String(l?.label || l?.url || "link").slice(0, 60),
        url: String(l?.url || "").slice(0, 300),
      }))
      .filter((l) => l.url);
  }

  return out;
}

// Turn a sanitized edits object into a flat [field, value, …] array for HSET,
// JSON-encoding the structured `links` field.
export function editsToHSET(edits) {
  const fields = [];
  for (const [k, v] of Object.entries(edits)) {
    fields.push(k, k === "links" ? JSON.stringify(v) : String(v));
  }
  return fields;
}
