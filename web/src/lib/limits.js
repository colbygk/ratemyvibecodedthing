// Client mirror of the server's trust→upload ladder (api/src/lib/upload-limits.js,
// ADR-0005). Used to size the create-form picker and the book's "add media"
// control from the logged-in user's trust. The server remains authoritative;
// this is purely for UX (don't offer slots the server will reject).

const MB = 1024 * 1024;

export const UPLOAD_TIERS = [
  { minTrust: 10, maxBytes: 90 * MB, maxMedia: 5 },
  { minTrust: 5, maxBytes: 50 * MB, maxMedia: 4 },
  { minTrust: 2, maxBytes: 35 * MB, maxMedia: 3 },
  { minTrust: 0, maxBytes: 25 * MB, maxMedia: 3 },
];

export function uploadLimitsFor(trust) {
  const t = Number.isFinite(Number(trust)) ? Number(trust) : 1;
  return UPLOAD_TIERS.find((x) => t >= x.minTrust) || UPLOAD_TIERS[UPLOAD_TIERS.length - 1];
}

export const maxMediaFor = (trust) => uploadLimitsFor(trust).maxMedia;
