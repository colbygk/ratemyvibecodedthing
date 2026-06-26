/**
 * Pure user-profile sanitization (bio, GitHub handle, social links). Side-effect
 * free → unit-testable. Mirrors lib/project.js. Used by PATCH /auth/me.
 */

import { httpError } from "./util.js";

// Accept a bare username, "@handle", or a github URL → store the bare handle.
// Empty clears the field. Throws on anything that isn't a valid handle.
export function normalizeGithub(value) {
  let s = String(value || "").trim().slice(0, 100);
  if (!s) return "";
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "").replace(/^@/, "");
  s = s.split(/[/?#]/)[0]; // first path segment, drop query/hash
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(s)) throw httpError("Invalid GitHub username", 400);
  return s;
}

export function sanitizeProfileEdits(patch = {}) {
  const out = {};

  if (patch.bio !== undefined) out.bio = String(patch.bio).slice(0, 280);

  if (patch.github !== undefined) out.github = normalizeGithub(patch.github);

  if (patch.links !== undefined) {
    if (!Array.isArray(patch.links)) throw httpError("links must be an array", 400);
    out.links = patch.links
      .slice(0, 6)
      .map((l) => ({
        label: String(l?.label || l?.url || "link").slice(0, 40),
        url: String(l?.url || "").slice(0, 300),
      }))
      .filter((l) => l.url);
  }

  return out;
}

// Flatten a sanitized edits object into a [field, value, …] array for HSET,
// JSON-encoding the structured `links` field.
export function profileToHSET(edits) {
  const fields = [];
  for (const [k, v] of Object.entries(edits)) {
    fields.push(k, k === "links" ? JSON.stringify(v) : String(v));
  }
  return fields;
}
