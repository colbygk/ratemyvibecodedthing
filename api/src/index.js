/**
 * ratemyvibecodedthing.ai — API (Cloudflare Worker)
 *
 * Storage:
 *   - Upstash Redis (REST) for accounts, projects, votes, and the follow graph
 *   - Cloudflare R2 (binding: MEDIA) for user-uploaded images/video
 *
 * Redis key map:
 *   user:<username>           HASH  { pwhash, salt, created, username, trust, role, bio, github, links(JSON) }
 *   project:<id>              HASH  { title, author, description, links(JSON), media(JSON), up, down, created, hidden }
 *   projects:byScore          ZSET  member=<id> score=(up-down)   -> shelf ordering
 *   projects:byNew            ZSET  member=<id> score=created
 *   user:<username>:projects  SET   project ids
 *   votes:<id>                HASH  field=<voterKey> value="up"|"down"   (one vote per voter per project)
 *   notes:<id>                HASH  field=<username>  value=<note>
 *   following:<username>      SET   usernames this user follows
 *   followers:<username>      SET   usernames following this user
 */

import { hashPassword, signJWT, verifyJWT, randomHex, timingSafeEqual } from "./lib/crypto.js";
import { json, cors, httpError, clientIP, safeJSON, validateCreds, hashArrayToObject, allowedOrigin } from "./lib/util.js";
import { consume, reserveStorage, usageToday } from "./lib/quota.js";
import { sanitizeProjectEdits, editsToHSET, assertMediaCapacity } from "./lib/project.js";
import { newUserFields, publicUserShape } from "./lib/user.js";
import { sanitizeProfileEdits, profileToHSET } from "./lib/profile.js";
import { notesObjectToList } from "./lib/notes.js";
import { uploadLimitsFor } from "./lib/upload-limits.js";
import { normalizeRole, can, effectiveRole, accountKeysOnly, firstUserRole } from "./lib/roles.js";

export default {
  async fetch(request, env, ctx) {
    const allowList = (env.ALLOWED_ORIGIN || "*").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = allowedOrigin(request.headers.get("Origin"), allowList);
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

  // ---- usage snapshot (uncounted, so monitoring never trips the limit) ----
  if (path === "/usage" && m === "GET") return json(await usageToday((cmd) => redis(env, cmd), env, Date.now()));

  // Count this request against the daily quota (graceful 429 when over). This is
  // the software guard; provider-side caps remain the primary protection.
  await consume((cmd) => redis(env, cmd), env, "request", Date.now());

  // ---- auth ----
  if (path === "/auth/signup" && m === "POST") return signup(request, env);
  if (path === "/auth/login" && m === "POST") return login(request, env);
  if (path === "/auth/me" && m === "GET") return me(request, env);
  if (path === "/auth/me" && m === "PATCH") return updateMe(request, env);

  // ---- projects ----
  if (path === "/projects" && m === "GET") return listProjects(env);
  if (path === "/projects" && m === "POST") return createProject(request, env);
  if (seg[0] === "projects" && seg[1] && !seg[2] && m === "GET") return getProject(seg[1], env);
  if (seg[0] === "projects" && seg[1] && !seg[2] && m === "PATCH") return editProject(seg[1], request, env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "vote" && m === "POST") return vote(seg[1], request, env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "notes" && !seg[3] && m === "GET") return listNotes(seg[1], env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "notes" && seg[3] && m === "DELETE") return removeNote(seg[1], seg[3], request, env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "media" && m === "POST") return uploadMedia(seg[1], request, env);
  if (seg[0] === "projects" && seg[1] && seg[2] === "hide" && m === "POST") return hideProject(seg[1], request, env);

  // ---- media serving ----
  if (seg[0] === "media" && seg[1] && m === "GET") return serveMedia(seg.slice(1).join("/"), env);

  // ---- me ----
  if (path === "/me/projects" && m === "GET") return myProjects(request, env);

  // ---- follow graph (Redis sets) ----
  if (seg[0] === "users" && seg[1] && seg[2] === "follow" && m === "POST") return follow(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "follow" && m === "DELETE") return unfollow(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "graph" && m === "GET") return graph(seg[1], env);

  // ---- moderation / admin (RBAC via JWT claims — ADR-0006) ----
  if (seg[0] === "users" && seg[1] && seg[2] === "admin" && m === "GET") return getUserAdmin(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "role" && m === "POST") return setUserRole(seg[1], request, env);
  if (seg[0] === "users" && seg[1] && seg[2] === "trust" && m === "POST") return setUserTrust(seg[1], request, env);

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
  // The first-ever account becomes super_admin (ADR-0006); on a populated DB the
  // count is > 0 so this can never be mis-claimed by a later signup.
  const storedRole = firstUserRole(await countAccounts(env));
  // Every account starts at trust = 1 (ADR-0004); field list lives in lib/user.js.
  await redis(env, ["HSET", key, ...newUserFields({ username, pwhash, salt, now: Date.now(), role: storedRole })]);
  const role = effectiveRole(storedRole, username, env.SUPERADMINS);
  const token = await signJWT({ sub: username, role }, env.JWT_SECRET);
  return json({ token, user: publicUserShape({ username, role }) }, 201);
}

async function login(request, env) {
  const { username, password } = await request.json();
  validateCreds(username, password);
  const key = `user:${username.toLowerCase()}`;
  const [pwhash, salt, storedRole] = await redis(env, ["HMGET", key, "pwhash", "salt", "role"]);
  if (!pwhash || !salt) throw httpError("Invalid credentials", 401);
  const check = await hashPassword(password, salt);
  if (!timingSafeEqual(check, pwhash)) throw httpError("Invalid credentials", 401);
  const role = effectiveRole(storedRole, username, env.SUPERADMINS);
  const token = await signJWT({ sub: username, role }, env.JWT_SECRET);
  return json({ token, user: await publicUser(username, env) });
}

async function me(request, env) {
  const u = await requireUser(request, env);
  return json(await publicUser(u, env));
}

// Update your own profile (bio / GitHub handle / social links). Self only.
async function updateMe(request, env) {
  const username = await requireUser(request, env);
  const edits = sanitizeProfileEdits(await request.json());
  const fields = profileToHSET(edits);
  if (fields.length) await redis(env, ["HSET", `user:${username.toLowerCase()}`, ...fields]);
  return json(await publicUser(username, env));
}

async function publicUser(username, env) {
  const key = `user:${username.toLowerCase()}`;
  const [following, followers, trust, storedRole, bio, github, links] = await Promise.all([
    redis(env, ["SMEMBERS", `following:${username.toLowerCase()}`]),
    redis(env, ["SMEMBERS", `followers:${username.toLowerCase()}`]),
    redis(env, ["HGET", key, "trust"]),
    redis(env, ["HGET", key, "role"]),
    redis(env, ["HGET", key, "bio"]),
    redis(env, ["HGET", key, "github"]),
    redis(env, ["HGET", key, "links"]),
  ]);
  const role = effectiveRole(storedRole, username, env.SUPERADMINS);
  return publicUserShape({ username, following, followers, trust, role, bio, github, links: safeJSON(links, []) });
}

// Count real accounts (user:<name>) via SCAN — used once at signup to decide if
// this is the first-ever account. No per-request cost on the hot paths.
async function countAccounts(env) {
  let cursor = "0";
  let count = 0;
  do {
    const [next, keys] = await redis(env, ["SCAN", cursor, "MATCH", "user:*", "COUNT", "200"]);
    count += accountKeysOnly(keys).length;
    cursor = next;
  } while (cursor !== "0");
  return count;
}

/* ============================ Projects ============================ */
async function listProjects(env) {
  // top of the shelf first, by net score; moderator-hidden projects are off-shelf
  const ids = (await redis(env, ["ZRANGE", "projects:byScore", "0", "199", "REV"])) || [];
  if (!ids.length) return json([]);
  const projects = await Promise.all(ids.map((id) => readProject(id, env)));
  return json(projects.filter((p) => p && !p.hidden));
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
    hidden: h.hidden === "1",
  };
}

async function createProject(request, env) {
  const username = await requireUser(request, env);
  const body = await request.json();
  // title is required on create; reuse the shared sanitizer for the rest.
  const fields = sanitizeProjectEdits({ title: body.title, description: body.description ?? "", links: body.links ?? [], coverColor: body.coverColor ?? "" });
  if (!fields.title) throw httpError("Title required", 400);

  const id = randomHex(8);
  const now = Date.now();
  await redis(env, ["HSET", `project:${id}`,
    ...editsToHSET(fields),
    "author", username,
    "media", JSON.stringify([]),
    "coverSeed", body.coverSeed || fields.title,
    "up", "0", "down", "0", "created", now.toString(),
  ]);
  await Promise.all([
    redis(env, ["ZADD", "projects:byScore", "0", id]), // score = upvotes (0 at creation)
    redis(env, ["ZADD", "projects:byNew", now.toString(), id]),
    redis(env, ["SADD", `user:${username.toLowerCase()}:projects`, id]),
  ]);
  return json(await readProject(id, env), 201);
}

// Edit a project you own (partial update of title/description/links/coverColor).
async function editProject(id, request, env) {
  const username = await requireUser(request, env);
  const existing = await readProject(id, env);
  if (!existing) throw httpError("Not found", 404);
  if (existing.author.toLowerCase() !== username.toLowerCase()) throw httpError("Not your project", 403);

  const edits = sanitizeProjectEdits(await request.json());
  const fields = editsToHSET(edits);
  if (fields.length) await redis(env, ["HSET", `project:${id}`, ...fields]);
  return json(await readProject(id, env));
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
  // Shelf is ordered by upvote count (highest first).
  await redis(env, ["ZADD", "projects:byScore", String(Number(up)), id]);
  return json({ up: Number(up), down: Number(down), note: note || null });
}

// Public read of the notes left on a project (ADR-0003). Notes are written with
// votes by logged-in users; this is the missing read path that surfaces them.
async function listNotes(id, env) {
  const exists = await redis(env, ["HEXISTS", `project:${id}`, "title"]);
  if (!exists) throw httpError("Not found", 404);
  const obj = await redisHGETALL(env, `notes:${id}`);
  return json({ notes: notesObjectToList(obj) });
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

// Public view of a user: follow counts + their editable profile (bio/github/links).
async function graph(username, env) {
  const key = `user:${username.toLowerCase()}`;
  const [followers, following, bio, github, links] = await Promise.all([
    redis(env, ["SCARD", `followers:${username.toLowerCase()}`]),
    redis(env, ["SCARD", `following:${username.toLowerCase()}`]),
    redis(env, ["HGET", key, "bio"]),
    redis(env, ["HGET", key, "github"]),
    redis(env, ["HGET", key, "links"]),
  ]);
  return json({
    username,
    followers: Number(followers || 0),
    following: Number(following || 0),
    bio: bio || "",
    github: github || "",
    links: safeJSON(links, []),
  });
}

/* ============================ Moderation / admin (ADR-0006) ============================ */
// Authorization for routine moderation trusts the signed role claim (no DB read).
// For revocation-sensitive actions (role/trust changes) we re-read the actor's
// CURRENT role from the DB so a just-revoked admin can't act on a stale token.
async function requireCapability(request, env, action) {
  const actor = await requireActor(request, env);
  if (!can(actor.role, action)) throw httpError("Insufficient permissions", 403);
  return actor;
}
async function requireLiveCapability(request, env, action) {
  const actor = await requireActor(request, env);
  const stored = await redis(env, ["HGET", `user:${actor.username.toLowerCase()}`, "role"]);
  const liveRole = effectiveRole(stored, actor.username, env.SUPERADMINS);
  if (!can(liveRole, action)) throw httpError("Insufficient permissions", 403);
  return { ...actor, role: liveRole };
}

// Hide/unhide any project (moderator+). Hidden projects drop off the shelf but
// remain in storage (reversible) — see ADR-0006 (soft-hide over hard delete).
async function hideProject(id, request, env) {
  await requireCapability(request, env, "project:hide");
  const exists = await redis(env, ["HEXISTS", `project:${id}`, "title"]);
  if (!exists) throw httpError("Not found", 404);
  const { hidden } = await request.json();
  await redis(env, ["HSET", `project:${id}`, "hidden", hidden ? "1" : "0"]);
  return json(await readProject(id, env));
}

// Remove a single note from a project (moderator+).
async function removeNote(id, username, request, env) {
  await requireCapability(request, env, "note:remove");
  await redis(env, ["HDEL", `notes:${id}`, username]);
  return json({ ok: true });
}

// Read a user's moderation attributes — role + trust (moderator+), so the UI can
// show current values before changing them.
async function getUserAdmin(target, request, env) {
  await requireCapability(request, env, "project:hide"); // any moderator may view
  const key = `user:${target.toLowerCase()}`;
  const [exists, storedRole, trust] = await redis(env, ["HMGET", key, "pwhash", "role", "trust"]);
  if (!exists) throw httpError("No such user", 404);
  return json({
    username: target,
    role: effectiveRole(storedRole, target, env.SUPERADMINS),
    trust: Number(trust || 1),
  });
}

// Grant/revoke a role (super_admin only; live-checked).
async function setUserRole(target, request, env) {
  await requireLiveCapability(request, env, "role:set");
  const key = `user:${target.toLowerCase()}`;
  const exists = await redis(env, ["HEXISTS", key, "pwhash"]);
  if (!exists) throw httpError("No such user", 404);
  const { role } = await request.json();
  const norm = normalizeRole(role);
  await redis(env, ["HSET", key, "role", norm]);
  return json({ username: target, role: effectiveRole(norm, target, env.SUPERADMINS) });
}

// Adjust a user's trust score (super_admin only; live-checked). This is the
// manual mechanism that makes the graduated upload tiers (ADR-0005) usable until
// an automated trust-progression model exists.
async function setUserTrust(target, request, env) {
  await requireLiveCapability(request, env, "trust:set");
  const key = `user:${target.toLowerCase()}`;
  const exists = await redis(env, ["HEXISTS", key, "pwhash"]);
  if (!exists) throw httpError("No such user", 404);
  const { trust } = await request.json();
  const n = Math.max(0, Math.min(100, Math.floor(Number(trust))));
  if (!Number.isFinite(n)) throw httpError("trust must be a number", 400);
  await redis(env, ["HSET", key, "trust", String(n)]);
  return json({ username: target, trust: n });
}

/* ============================ Media (R2) ============================ */
async function uploadMedia(id, request, env) {
  if (!env.MEDIA) throw httpError("Media storage not enabled yet", 503);
  const username = await requireUser(request, env);
  const owner = await redis(env, ["HGET", `project:${id}`, "author"]);
  if (!owner) throw httpError("Not found", 404);
  if (owner.toLowerCase() !== username.toLowerCase()) throw httpError("Not your project", 403);

  const type = request.headers.get("content-type") || "application/octet-stream";
  if (!/^image\/|^video\//.test(type)) throw httpError("Only image/video uploads allowed", 415);

  // Trust-graduated limits (ADR-0005): the uploader's trust sets per-file size and
  // per-project media count. Tier 1 == today's 25 MB / 3, so no one regresses.
  const trust = await redis(env, ["HGET", `user:${username.toLowerCase()}`, "trust"]);
  const limits = uploadLimitsFor(trust, env);

  // Count cap — check BEFORE the R2 write so a rejected upload never orphans an
  // object in the bucket.
  const media = safeJSON(await redis(env, ["HGET", `project:${id}`, "media"]), []);
  assertMediaCapacity(media.length, limits.maxMedia);

  // Cost guard: enforce per-file (trust-derived) + total storage caps and the
  // daily upload-op limit BEFORE writing to R2 (R2 has no provider-side auto-stop).
  const r1 = (cmd) => redis(env, cmd);
  const bytes = Number(request.headers.get("content-length") || 0);
  await reserveStorage(r1, env, bytes, Date.now(), limits.maxBytes);
  await consume(r1, env, "r2_upload", Date.now());

  const ext = type.split("/")[1]?.split(";")[0] || "bin";
  const objectKey = `${id}/${randomHex(8)}.${ext}`;
  await env.MEDIA.put(objectKey, request.body, { httpMetadata: { contentType: type } });

  const kind = type.startsWith("video/") ? "video" : "image";
  media.push({ type: kind, url: `/media/${objectKey}` });
  await redis(env, ["HSET", `project:${id}`, "media", JSON.stringify(media.slice(0, limits.maxMedia))]);
  return json({ media });
}

async function serveMedia(key, env) {
  if (!env.MEDIA) throw httpError("Media storage not enabled yet", 503);
  await consume((cmd) => redis(env, cmd), env, "r2_read", Date.now());
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
  return hashArrayToObject(await redis(env, ["HGETALL", key]));
}

/* ============================ Auth helpers ============================ */
async function requireUser(request, env) {
  const u = await optionalUser(request, env);
  if (!u) throw httpError("Authentication required", 401);
  return u;
}

async function optionalUser(request, env) {
  return (await actorFromRequest(request, env))?.username || null;
}

// Resolve the caller from the Bearer token to { username, role }. The role comes
// from the signed JWT claim (ADR-0006) — no DB read on this hot path.
async function actorFromRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET).catch(() => null);
  if (!payload?.sub) return null;
  return { username: payload.sub, role: normalizeRole(payload.role) };
}

async function requireActor(request, env) {
  const a = await actorFromRequest(request, env);
  if (!a) throw httpError("Authentication required", 401);
  return a;
}

/* validateCreds + crypto + HTTP/data utils live in ./lib/crypto.js and ./lib/util.js (imported above). */
