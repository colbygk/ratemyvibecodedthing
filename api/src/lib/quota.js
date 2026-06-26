/**
 * Daily usage quotas — a *software* guard against runaway provider costs.
 *
 * IMPORTANT: this is a SECONDARY safety net. It only works while Redis is
 * reachable and only bounds what it explicitly counts. The PRIMARY guarantee
 * against an unexpected bill is provider-side spend caps (see docs/COST.md):
 *   - Cloudflare Workers: Free plan (hard-blocks at limits, no overage)
 *   - Upstash: Free tier OR a monthly budget cap (rejects past the cap)
 *   - Cloudflare R2: billing alerts (R2 does NOT auto-stop)
 *
 * Counters are per-UTC-day keys with a 48h TTL so they self-clean. R2 storage
 * is tracked cumulatively (storage bills by GB-month, not per day).
 *
 * All functions take an injected `redis(command)` adapter so they unit-test
 * without a live database, and an explicit `nowMs` so day-rollover is testable.
 */

import { httpError } from "./util.js";

// Conservative defaults, well under the providers' free tiers. Override any of
// them with Worker vars LIMIT_REQUEST / LIMIT_R2_UPLOAD / LIMIT_R2_READ /
// MAX_STORAGE_BYTES / MAX_UPLOAD_BYTES.
export const DEFAULT_LIMITS = {
  request: 20000,   // API requests/day — proxy for Workers requests AND Upstash commands
  r2_upload: 500,   // R2 PUT ops/day (Class A)
  r2_read: 20000,   // R2 GET ops/day (Class B)
};
export const DEFAULT_MAX_STORAGE_BYTES = 9 * 1024 * 1024 * 1024; // ~9 GB (< 10 GB R2 free)
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;        // 25 MB per file
const TTL_SECONDS = 172800; // 48h
const STORAGE_KEY = "q:r2:bytes:total";

const LABELS = { request: "API request", r2_upload: "media upload", r2_read: "media view" };

export function dayKey(resource, nowMs) {
  const d = new Date(nowMs);
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `q:${resource}:${stamp}`;
}

export function limitFor(env, resource) {
  const override = env && env[`LIMIT_${resource.toUpperCase()}`];
  return override ? parseInt(override, 10) : DEFAULT_LIMITS[resource];
}

function maxStorage(env) {
  return env && env.MAX_STORAGE_BYTES ? parseInt(env.MAX_STORAGE_BYTES, 10) : DEFAULT_MAX_STORAGE_BYTES;
}
function maxUpload(env) {
  return env && env.MAX_UPLOAD_BYTES ? parseInt(env.MAX_UPLOAD_BYTES, 10) : DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Atomically increment today's counter for `resource` and throw a graceful 429
 * once the daily limit is exceeded. Returns { count, limit } on success.
 */
export async function consume(redis, env, resource, nowMs, amount = 1) {
  const key = dayKey(resource, nowMs);
  const count = Number(await redis(["INCRBY", key, String(amount)]));
  if (count === amount) await redis(["EXPIRE", key, String(TTL_SECONDS)]); // first write today
  const limit = limitFor(env, resource);
  if (count > limit) {
    throw httpError(`Daily ${LABELS[resource] || resource} limit reached (${limit}/day). It resets at 00:00 UTC.`, 429);
  }
  return { count, limit };
}

/**
 * Reserve `bytes` of R2 storage before an upload. Enforces a per-file cap and a
 * cumulative total-storage cap, rolling back the reservation if the total would
 * be exceeded. Throws a graceful error otherwise.
 */
export async function reserveStorage(redis, env, bytes, nowMs, perFileMax) {
  if (!Number.isFinite(bytes) || bytes <= 0) throw httpError("Upload requires a Content-Length header", 411);
  // perFileMax (trust-derived, ADR-0005) overrides the flat default when given.
  const perFile = Number.isFinite(perFileMax) && perFileMax > 0 ? perFileMax : maxUpload(env);
  if (bytes > perFile) throw httpError(`File too large (max ${Math.floor(perFile / 1048576)} MB).`, 413);

  const cap = maxStorage(env);
  const total = Number(await redis(["INCRBY", STORAGE_KEY, String(bytes)]));
  if (total > cap) {
    await redis(["DECRBY", STORAGE_KEY, String(bytes)]); // roll back the reservation
    throw httpError(`Storage limit reached (${(cap / 1073741824).toFixed(1)} GB). Uploads are paused until space frees up.`, 429);
  }
  return total;
}

/** Snapshot of today's usage vs. limits — for a status endpoint / banner. */
export async function usageToday(redis, env, nowMs) {
  const out = {};
  for (const resource of Object.keys(DEFAULT_LIMITS)) {
    const used = Number((await redis(["GET", dayKey(resource, nowMs)])) || 0);
    out[resource] = { used, limit: limitFor(env, resource) };
  }
  const stored = Number((await redis(["GET", STORAGE_KEY])) || 0);
  out.storage_bytes = { used: stored, limit: maxStorage(env) };
  return out;
}
