/**
 * Pure user-record helpers. Centralizes the user HASH field list and the public
 * user shape so defaults (notably the trust score) live in exactly one place and
 * are unit-testable without Redis. See ADR-0004.
 */

import { normalizeRole, ROLES } from "./roles.js";

// New accounts start trusted at 1 (ADR-0004) and as a plain user (ADR-0006).
// Graduated limits (ADR-0005) read trust; role gates moderation.
export const DEFAULT_TRUST = 1;

// Flat [field, value, …] list for the signup HSET. Redis wants string values.
export function newUserFields({ username, pwhash, salt, now, trust = DEFAULT_TRUST, role = ROLES.USER }) {
  return [
    "pwhash", String(pwhash),
    "salt", String(salt),
    "created", String(now),
    "username", String(username),
    "trust", String(trust),
    "role", normalizeRole(role),
  ];
}

// The shape returned to clients (/auth/me, login, signup). `trust` may arrive as
// a Redis string or be absent on pre-trust accounts → coerce, default to 1.
// `role` is the *effective* role (env allowlist already applied by the caller).
// bio/github/links are the user-editable profile fields (default empty).
export function publicUserShape({ username, following = [], followers = [], trust, role, bio = "", github = "", links = [] }) {
  const t = trust === undefined || trust === null || trust === "" ? DEFAULT_TRUST : Number(trust);
  return {
    username,
    following: following || [],
    followers: followers || [],
    trust: Number.isFinite(t) ? t : DEFAULT_TRUST,
    role: normalizeRole(role),
    bio: bio || "",
    github: github || "",
    links: links || [],
  };
}
