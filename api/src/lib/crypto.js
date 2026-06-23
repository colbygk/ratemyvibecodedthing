/**
 * Pure crypto helpers (WebCrypto). Framework-free and side-effect-free so they
 * can be unit-tested directly. `now` is injectable on the JWT functions to keep
 * expiry tests deterministic (dependency injection over a hidden clock).
 */

export function bytesToHex(b) {
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}

export function randomHex(bytes) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlBytes(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Constant-time string compare (avoids leaking match position via timing).
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hmac(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlBytes(new Uint8Array(sig));
}

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function signJWT(payload, secret, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat, exp: iat + TTL_SECONDS }));
  const sig = await hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

export async function verifyJWT(token, secret, nowMs = Date.now()) {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) throw new Error("malformed");
  const expected = await hmac(`${header}.${body}`, secret);
  if (!timingSafeEqual(sig, expected)) throw new Error("bad signature");
  const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && payload.exp < Math.floor(nowMs / 1000)) throw new Error("expired");
  return payload;
}
