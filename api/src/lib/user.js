/**
 * Pure user-record helpers. Centralizes the user HASH field list and the public
 * user shape so defaults (notably the trust score) live in exactly one place and
 * are unit-testable without Redis. See ADR-0004.
 */

// New accounts start trusted at 1. No behavior is keyed on this yet (ADR-0004);
// graduated limits are a separate, still-Proposed decision (ADR-0005).
export const DEFAULT_TRUST = 1;

// Flat [field, value, …] list for the signup HSET. Redis wants string values.
export function newUserFields({ username, pwhash, salt, now, trust = DEFAULT_TRUST }) {
  return [
    "pwhash", String(pwhash),
    "salt", String(salt),
    "created", String(now),
    "username", String(username),
    "trust", String(trust),
  ];
}

// The shape returned to clients (/auth/me, login, signup). `trust` may arrive as
// a Redis string or be absent on pre-trust accounts → coerce, default to 1.
export function publicUserShape({ username, following = [], followers = [], trust }) {
  const t = trust === undefined || trust === null || trust === "" ? DEFAULT_TRUST : Number(trust);
  return {
    username,
    following: following || [],
    followers: followers || [],
    trust: Number.isFinite(t) ? t : DEFAULT_TRUST,
  };
}
