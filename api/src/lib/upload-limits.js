/**
 * Graduated per-upload limits keyed on a user's trust score (ADR-0005). Pure and
 * side-effect free. Tier 1 deliberately matches today's flat default (25 MB / 3)
 * so introducing trust never *lowers* anyone's limit — trust only grants more.
 *
 * The absolute ceiling stays under Cloudflare's 100 MB Worker request-body wall.
 */

const MB = 1024 * 1024;
const VIDEO_FLOOR = 50 * MB; // video gets at least this, regardless of trust tier
const CEILING = 95 * MB;     // stay under the 100 MB Worker request-body wall

// Highest minTrust first; uploadLimitsFor picks the first tier the user qualifies
// for. Keep maxBytes < 100 MB (Worker wall) at every tier.
export const UPLOAD_TIERS = [
  { minTrust: 10, maxBytes: 90 * MB, maxMedia: 5 }, // trusted
  { minTrust: 5, maxBytes: 50 * MB, maxMedia: 4 },  // established
  { minTrust: 2, maxBytes: 35 * MB, maxMedia: 3 },
  { minTrust: 0, maxBytes: 25 * MB, maxMedia: 3 },  // new accounts — today's default
];

export function uploadLimitsFor(trust, env = {}) {
  const t = Number.isFinite(Number(trust)) ? Number(trust) : 1;
  const tier = UPLOAD_TIERS.find((x) => t >= x.minTrust) || UPLOAD_TIERS[UPLOAD_TIERS.length - 1];

  // Optional ops kill-switch: MAX_UPLOAD_BYTES only ever lowers the ceiling.
  const override = env && env.MAX_UPLOAD_BYTES ? parseInt(env.MAX_UPLOAD_BYTES, 10) : 0;
  const clamp = (b) => (override > 0 ? Math.min(b, override) : b);

  return {
    maxBytes: clamp(Math.min(tier.maxBytes, CEILING)),                          // images
    maxVideoBytes: clamp(Math.min(Math.max(tier.maxBytes, VIDEO_FLOOR), CEILING)), // video ≥ 50 MB
    maxMedia: tier.maxMedia,
  };
}
