/**
 * Pure helpers for versioned project documentation (ADR-0007). Side-effect free
 * → unit-testable. Votes/notes/follow stay on the project id; only the docs are
 * versioned. The current version lives denormalised on `project:<id>`; superseded
 * versions are JSON snapshots in the `project:<id>:versions` list.
 */

export const MAX_VERSIONS = 5;            // total kept (current + history)
export const MAX_HISTORY = MAX_VERSIONS - 1;

// The versioned subset of a project — what we snapshot into history on publish.
export function snapshotOf(p = {}) {
  return {
    v: Number(p.v ?? p.version ?? 1),
    title: p.title,
    description: p.description || "",
    links: p.links || [],
    media: p.media || [],
    created: Number(p.versionAt ?? p.created ?? 0),
    changelog: p.changelog || "",
  };
}

export function sanitizeChangelog(s) {
  return String(s || "").slice(0, 200);
}

// "/media/<key>" → "<key>" (for pruning R2 objects of a dropped version).
export function mediaKeyFromUrl(url) {
  const m = String(url || "").match(/^\/media\/(.+)$/);
  return m ? m[1] : null;
}
