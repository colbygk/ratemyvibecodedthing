/**
 * Pure HTTP/data helpers — no I/O, so they unit-test cleanly.
 */

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export function httpError(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function cors(res, origin) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}

export function clientIP(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "0.0.0.0";
}

export function safeJSON(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
}

// Validates signup/login credentials; throws httpError on bad input.
export function validateCreds(username, password) {
  if (!username || !/^[a-zA-Z0-9_]{2,24}$/.test(username)) {
    throw httpError("Username: 2–24 letters, numbers, underscore", 400);
  }
  if (!password || password.length < 4) throw httpError("Password too short", 400);
}

// Pick the CORS origin to echo back: reflect the request's Origin when it's in
// the allow-list, otherwise fall back to the first configured origin. Reflecting
// (rather than a single fixed value) lets the same Worker serve the site over
// http during cert provisioning, https afterward, and localhost in dev.
export function allowedOrigin(requestOrigin, allowList) {
  if (requestOrigin && allowList.includes(requestOrigin)) return requestOrigin;
  return allowList[0] || "*";
}

// Redis HGETALL returns a flat [k,v,k,v] array; turn it into an object.
export function hashArrayToObject(flat) {
  if (!flat || !flat.length) return null;
  const obj = {};
  for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
}
