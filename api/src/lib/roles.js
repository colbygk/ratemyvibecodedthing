/**
 * Pure role/permission helpers (ADR-0006). Roles are carried as a signed JWT
 * claim so the hot authorization path is HMAC verification, not a DB read. These
 * functions are side-effect free → unit-testable; the I/O (token verify, Redis
 * reads, the live re-check for revocation-sensitive actions) lives in index.js.
 */

export const ROLES = { USER: "user", MODERATOR: "moderator", SUPER_ADMIN: "super_admin" };
export const ROLE_RANK = { user: 0, moderator: 1, super_admin: 2 };

export function normalizeRole(role) {
  return ROLE_RANK[role] != null ? role : ROLES.USER;
}

export function roleAtLeast(role, min) {
  return (ROLE_RANK[normalizeRole(role)] || 0) >= (ROLE_RANK[min] || 0);
}

// Capability map: action → minimum role. Add an action here, not an ad-hoc check.
const CAPS = {
  "project:hide": ROLES.MODERATOR, // hide/unhide any project from the shelf
  "note:remove": ROLES.MODERATOR,  // remove a note left on any project
  "role:set": ROLES.SUPER_ADMIN,   // grant/revoke roles (revocation-sensitive)
  "trust:set": ROLES.SUPER_ADMIN,  // adjust a user's trust score
};

export function can(role, action) {
  const min = CAPS[action];
  return min ? roleAtLeast(role, min) : false;
}

// Env allowlist (comma-separated usernames) that are always super_admin. This is
// the authoritative bootstrap for accounts created before roles existed (e.g.
// production's `cgk`) and a break-glass for ops.
export function parseSuperadmins(csv) {
  return new Set(String(csv || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

// The role we actually trust for a user: the env allowlist wins, else the stored
// role (normalized). Computed at token-issue time and embedded in the JWT.
export function effectiveRole(storedRole, username, superadminsCsv) {
  if (parseSuperadmins(superadminsCsv).has(String(username || "").toLowerCase())) return ROLES.SUPER_ADMIN;
  return normalizeRole(storedRole);
}

// From a SCAN of `user:*`, keep only real account keys (user:<name>), dropping
// `user:<name>:projects` and anything else. Used to detect the first-ever account.
export function accountKeysOnly(keys) {
  return (keys || []).filter((k) => /^user:[^:]+$/.test(k));
}

// The very first account on a fresh deployment becomes super_admin. On an already
// populated DB the count is > 0, so a later signup can never mis-claim it.
export function firstUserRole(existingAccountCount) {
  return existingAccountCount === 0 ? ROLES.SUPER_ADMIN : ROLES.USER;
}
