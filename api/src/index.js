/**
 * ratemyvibecodedthing.ai — API (Cloudflare Worker)
 *
 * Storage:
 *   - Upstash Redis (REST) for accounts, projects, votes, and the follow graph
 *   - Cloudflare R2 (binding: MEDIA) for user-uploaded images/video
 *
 * Redis key map:
 *   user:<username>           HASH  { pwhash, salt, created }
 *   project:<id>              HASH  { title, author, description, links(JSON), media(JSON), up, down, created }
 *   projects:byScore          ZSET  member=<id> score=(up-down)   -> shelf ordering
 *   projects:byNew            ZSET  member=<id> score=created
 *   user:<username>:projects  SET   project ids
 *   votes:<id>                HASH  field=<voterKey> value="up"|"down"   (one vote per voter per project)
 *   notes:<id>                HASH  field=<username>  value=<note>
 *   following:<username>      SET   usernames this user follows
 *   followers:<username>      SET   usernames following this user
 */

export default {
  async fetch(request, env, ctx) {
    const origin = env.ALLOWED_ORIGIN || "*";
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), origin);
    try {
      const res = await route(request, env, ctx);
      return cors(res, origin);
    } catch (err) {
      return cors(json({ error: err.message || "Server error" }, err.status || 500), origin);
    }
  },
};

/* ============================ Router ============================ */
async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = request.method;
  const seg = path.split("/").filter(Boolean); // e.g. ["projects", "abc", "vote"]

  if (path === "/" ) return json({ ok: true, service: "rmvct-api" });

  // ---- auth ----
  if (path === "/auth/signup" && m === "POST") return signup(request, env);
  if (path === "/auth/login" && m === "POST") return login(request, env);
  if (path === "/auth/me" && m === "GET") return me(request, env);

  // ---- projects ----
  if (path === "/projects" && m === "GET") return listProjects(env);
  if (path === "/projects" && m === "POST") return createProject(request, env);
  if (seg[0] === "projects" && seg[1] && !seg[2] && m === "GET") return getProject(seg[1], env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "vote" && m === "POST") return vote(seg[1], request, env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "media" && m === "POST") return uploadMedia(seg[1], request, env);

  // ---- media serving ----
  if (seg[0] === "media" && seg[1] && m === "GET") return serveMedia(seg.slice(1).join("/"), env);

  // ---- me ----
  if (path === "/me/projects" && m === "GET") return myProjects(request, env);

  // ---- follow graph (Redis sets) ----
  if (seg[0] === "users" && seg[1] && seg[2] === "follow" && m === "POST") return follow(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "follow" && m === "DELETE") return unfollow(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "graph" && m === "GET") return graph(seg[1], env);

  return json({ error: "Not found" }, 404);
}

/* ============================ Auth ============================ */
async function signup(request, env) {
  const { username, password } = await request.json();
  validateCreds(username, password);
  const key = `user:${username.toLowerCase()}`;
  const exists = await redis(env, ["HEXISTS", key, "pwhash"]);
  if (exists) throw httpError("Username taken", 409);

  const salt = randomHex(16);
  const pwhash = await hashPassword(password, salt);
  await redis(env, ["HSET", key, "pwhash", pwhash, "salt", salt, "created", Date.now().toString(), "username", username]);
  const token = await signJWT({ sub: username }, env.JWT_SECRET);
  return json({ token, user: { username, following: [], followers: [] } }, 201);
}

async function login(request, env) {
  const { username, password } = await request.json();
  validateCreds(username, password);
  const key = `user:${username.toLowerCase()}`;
  const [pwhash, salt] = await redis(env, ["HMGET", key, "pwhash", "salt"]);
  if (!pwhash || !salt) throw httpError("Invalid credentials", 401);
  const check = await hashPassword(password, salt);
  if (!timingSafeEqual(check, pwhash)) throw httpError("Invalid credentials", 401);
  const token = await signJWT({ sub: username }, env.JWT_SECRET);
  return json({ token, user: await publicUser(username, env) });
}

async function me(request, env) {
  const u = await requireUser(request, env);
  return json(await publicUser(u, env));
}

async function publicUser(username, env) {
  const [following, followers] = await Promise.all([
    redis(env, ["SMEMBERS", `following:${username.toLowerCase()}`]),
    redis(env, ["SMEMBERS", `followers:${username.toLowerCase()}`]),
  ]);
  return { username, following: following || [], followers: followers || [] };
}

/* ============================ Projects ============================ */
async function listProjects(env) {
  // top of the shelf first, by net score
  const ids = (await redis(env, ["ZRANGE", "projects:byScore", "0", "199", "REV"])) || [];
  if (!ids.length) return json([]);
  const projects = await Promise.all(ids.map((id) => readProject(id, env)));
  return json(projects.filter(Boolean));
}

async function getProject(id, env) {
  const p = await readProject(id, env);
  if (!p) return json({ error: "Not found" }, 404);
  return json(p);
}

async function readProject(id, env) {
  const h = await redisHGETALL(env, `project:${id}`);
  if (!h || !h.title) return null;
  return {
    id,
    title: h.title,
    author: h.author,
    description: h.description || "",
    links: safeJSON(h.links, []),
    media: safeJSON(h.media, []),
    up: Number(h.up || 0),
    down: Number(h.down || 0),
    coverColor: h.coverColor || null,
    coverSeed: h.coverSeed || h.title,
    created: Number(h.created || 0),
  };
}

async function createProject(request, env) {
  const username = await requireUser(request, env);
  const body = await request.json();
  const title = String(body.title || "").trim().slice(0, 80);
  if (!title) throw httpError("Title required", 400);

  const id = randomHex(8);
  const now = Date.now();
  await redis(env, ["HSET", `project:${id}`,
    "title", title,
    "author", username,
    "description", String(body.description || "").slice(0, 600),
    "links", JSON.stringify(Array.isArray(body.links) ? body.links.slice(0, 6) : []),
    "media", JSON.stringify([]),
    "coverColor", body.coverColor || "",
    "coverSeed", body.coverSeed || title,
    "up", "0", "down", "0", "created", now.toString(),
  ]);
  await Promise.all([
    redis(env, ["ZADD", "projects:byScore", "0", id]),
    redis(env, ["ZADD", "projects:byNew", now.toString(), id]),
    redis(env, ["SADD", `user:${username.toLowerCase()}:projects`, id]),
  ]);
  return json(await readProject(id, env), 201);
}

async function myProjects(request, env) {
  const username = await requireUser(request, env);
  const ids = (await redis(env, ["SMEMBERS", `user:${username.toLowerCase()}:projects`])) || [];
  const projects = await Promise.all(ids.map((id) => readProject(id, env)));
  return json(projects.filter(Boolean));
}

/* ============================ Voting ============================ */
// Anonymous: one vote per project per IP. Logged-in: one vote per project per
// user, and may attach a free-form note.
async function vote(id, request, env) {
  const exists = await redis(env, ["HEXISTS", `project:${id}`, "title"]);
  if (!exists) throw httpError("Not found", 404);

  const { dir, note } = await request.json();
  if (dir !== "up" && dir !== "down") throw httpError("dir must be 'up' or 'down'", 400);

  const username = await optionalUser(request, env);
  const voterKey = username ? `u:${username.toLowerCase()}` : `ip:${clientIP(request)}`;

  const prev = await redis(env, ["HGET", `votes:${id}`, voterKey]);
  if (prev && !username) throw httpError("One vote per visitor — sign in to vote on more.", 429);

  // logged-in users may change their vote; recompute tallies
  if (prev === dir) {
    // no change
  } else {
    if (prev === "up") await redis(env, ["HINCRBY", `project:${id}`, "up", "-1"]);
    if (prev === "down") await redis(env, ["HINCRBY", `project:${id}`, "down", "-1"]);
    await redis(env, ["HINCRBY", `project:${id}`, dir, "1"]);
    await redis(env, ["HSET", `votes:${id}`, voterKey, dir]);
  }

  if (username && note) {
    await redis(env, ["HSET", `notes:${id}`, username, String(note).slice(0, 1000)]);
  }

  const [up, down] = await redis(env, ["HMGET", `project:${id}`, "up", "down"]);
  await redis(env, ["ZADD", "projects:byScore", String(Number(up) - Number(down)), id]);
  return json({ up: Number(up), down: Number(down), note: note || null });
}

/* ============================ Follow graph ============================ */
async function follow(target, request, env) {
  const me = await requireUser(request, env);
  if (me.toLowerCase() === target.toLowerCase()) throw httpError("Cannot follow yourself", 400);
  const exists = await redis(env, ["HEXISTS", `user:${target.toLowerCase()}`, "pwhash"]);
  if (!exists) throw httpError("No such user", 404);
  await Promise.all([
    redis(env, ["SADD", `following:${me.toLowerCase()}`, target]),
    redis(env, ["SADD", `followers:${target.toLowerCase()}`, me]),
  ]);
  return json({ ok: true });
}

async function unfollow(target, request, env) {
  const me = await requireUser(request, env);
  await Promise.all([
    redis(env, ["SREM", `following:${me.toLowerCase()}`, target]),
    redis(env, ["SREM", `followers:${target.toLowerCase()}`, me]),
  ]);
  return json({ ok: true });
}

async function graph(username, env) {
  const [followers, following] = await Promise.all([
    redis(env, ["SCARD", `followers:${username.toLowerCase()}`]),
    redis(env, ["SCARD", `following:${username.toLowerCase()}`]),
  ]);
  return json({ username, followers: Number(followers || 0), following: Number(following || 0) });
}

/* ============================ Media (R2) ============================ */
async function uploadMedia(id, request, env) {
  const username = await requireUser(request, env);
  const owner = await redis(env, ["HGET", `project:${id}`, "author"]);
  if (!owner) throw httpError("Not found", 404);
  if (owner.toLowerCase() !== username.toLowerCase()) throw httpError("Not your project", 403);

  const type = request.headers.get("content-type") || "application/octet-stream";
  if (!/^image\/|^video\//.test(type)) throw httpError("Only image/video uploads allowed", 415);

  const ext = type.split("/")[1]?.split(";")[0] || "bin";
  const objectKey = `${id}/${randomHex(8)}.${ext}`;
  await env.MEDIA.put(objectKey, request.body, { httpMetadata: { contentType: type } });

  const kind = type.startsWith("video/") ? "video" : "image";
  const media = safeJSON(await redis(env, ["HGET", `project:${id}`, "media"]), []);
  media.push({ type: kind, url: `/media/${objectKey}` });
  await redis(env, ["HSET", `project:${id}`, "media", JSON.stringify(media.slice(0, 12))]);
  return json({ media });
}

async function serveMedia(key, env) {
  const obj = await env.MEDIA.get(key);
  if (!obj) return json({ error: "Not found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}

/* ============================ Redis (Upstash REST) ============================ */
async function redis(env, command) {
  if (!env.UPSTASH_REDIS_REST_URL) throw httpError("Redis not configured", 500);
  const res = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw httpError(`Redis: ${data.error}`, 500);
  return data.result;
}

// HGETALL returns a flat array [k,v,k,v]; normalize to an object.
async function redisHGETALL(env, key) {
  const flat = await redis(env, ["HGETALL", key]);
  if (!flat || !flat.length) return null;
  const obj = {};
  for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
}

/* ============================ Auth helpers ============================ */
async function requireUser(request, env) {
  const u = await optionalUser(request, env);
  if (!u) throw httpError("Authentication required", 401);
  return u;
}

async function optionalUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET).catch(() => null);
  return payload?.sub || null;
}

function validateCreds(username, password) {
  if (!username || !/^[a-zA-Z0-9_]{2,24}$/.test(username)) throw httpError("Username: 2–24 letters, numbers, underscore", 400);
  if (!password || password.length < 4) throw httpError("Password too short", 400);
}

/* ============================ Crypto (WebCrypto) ============================ */
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }));
  const sig = await hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

async function verifyJWT(token, secret) {
  const [header, body, sig] = token.split(".");
  if (!header || !body || !sig) throw new Error("malformed");
  const expected = await hmac(`${header}.${body}`, secret);
  if (!timingSafeEqual(sig, expected)) throw new Error("bad signature");
  const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return payload;
}

async function hmac(data, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlBytes(new Uint8Array(sig));
}

/* ============================ Small utils ============================ */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
function cors(res, origin) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
}
function httpError(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function clientIP(request) { return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "0.0.0.0"; }
function safeJSON(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
function randomHex(bytes) { return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes))); }
function bytesToHex(b) { return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(h) { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlBytes(bytes) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
