/**
 * Pure note helpers. Notes are stored in the Redis hash `notes:<id>` keyed by
 * username; this turns the normalized {username: note} object into the list the
 * API returns. Side-effect free → unit-testable. See ADR-0003.
 */

export function notesObjectToList(obj) {
  if (!obj) return [];
  return Object.entries(obj)
    .filter(([, note]) => note)
    .map(([username, note]) => ({ username, note }));
}
