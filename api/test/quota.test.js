import { describe, it, expect } from "vitest";
import {
  dayKey, limitFor, consume, reserveStorage, usageToday,
  DEFAULT_LIMITS, DEFAULT_MAX_STORAGE_BYTES, DEFAULT_MAX_UPLOAD_BYTES,
} from "../src/lib/quota.js";

// In-memory Redis stand-in supporting the commands quota.js uses.
function mockRedis() {
  const store = new Map();
  const calls = [];
  const fn = async (cmd) => {
    calls.push(cmd);
    const [op, key, val] = cmd;
    switch (op) {
      case "INCRBY": { const n = (store.get(key) || 0) + Number(val); store.set(key, n); return n; }
      case "DECRBY": { const n = (store.get(key) || 0) - Number(val); store.set(key, n); return n; }
      case "GET": return store.has(key) ? String(store.get(key)) : null;
      case "EXPIRE": return 1;
      default: throw new Error("unsupported op " + op);
    }
  };
  fn.store = store;
  fn.calls = calls;
  return fn;
}

const NOON_UTC = Date.UTC(2026, 5, 23, 12, 0, 0); // 2026-06-23T12:00:00Z

describe("dayKey", () => {
  it("uses a UTC YYYYMMDD stamp", () => {
    expect(dayKey("request", NOON_UTC)).toBe("q:request:20260623");
  });
  it("rolls over at the UTC day boundary", () => {
    const justBefore = Date.UTC(2026, 5, 23, 23, 59, 59);
    const justAfter = Date.UTC(2026, 5, 24, 0, 0, 1);
    expect(dayKey("request", justBefore)).toBe("q:request:20260623");
    expect(dayKey("request", justAfter)).toBe("q:request:20260624");
  });
});

describe("limitFor", () => {
  it("returns the default when no override is set", () => {
    expect(limitFor({}, "request")).toBe(DEFAULT_LIMITS.request);
  });
  it("honors a Worker var override", () => {
    expect(limitFor({ LIMIT_REQUEST: "5" }, "request")).toBe(5);
  });
});

describe("consume", () => {
  it("increments and sets a TTL on the first write of the day", async () => {
    const redis = mockRedis();
    const res = await consume(redis, {}, "request", NOON_UTC);
    expect(res.count).toBe(1);
    expect(redis.calls.some((c) => c[0] === "EXPIRE")).toBe(true);
  });

  it("does not re-set the TTL on later writes", async () => {
    const redis = mockRedis();
    await consume(redis, {}, "request", NOON_UTC);
    redis.calls.length = 0;
    await consume(redis, {}, "request", NOON_UTC);
    expect(redis.calls.some((c) => c[0] === "EXPIRE")).toBe(false);
  });

  it("throws a graceful 429 once the daily limit is exceeded", async () => {
    const redis = mockRedis();
    const env = { LIMIT_REQUEST: "2" };
    await consume(redis, env, "request", NOON_UTC); // 1
    await consume(redis, env, "request", NOON_UTC); // 2 (at limit, ok)
    let err;
    try { await consume(redis, env, "request", NOON_UTC); } catch (e) { err = e; } // 3 → over
    expect(err.status).toBe(429);
    expect(err.message).toMatch(/limit reached/i);
    expect(err.message).toMatch(/00:00 UTC/);
  });

  it("counts separately per UTC day", async () => {
    const redis = mockRedis();
    const env = { LIMIT_REQUEST: "1" };
    await consume(redis, env, "request", NOON_UTC);            // day A: ok
    const nextDay = NOON_UTC + 24 * 3600 * 1000;
    await expect(consume(redis, env, "request", nextDay)).resolves.toMatchObject({ count: 1 }); // day B resets
  });
});

describe("reserveStorage", () => {
  it("rejects a missing/invalid content length with 411", async () => {
    const redis = mockRedis();
    await expect(reserveStorage(redis, {}, 0, NOON_UTC)).rejects.toMatchObject({ status: 411 });
  });

  it("rejects an oversized single file with 413", async () => {
    const redis = mockRedis();
    await expect(reserveStorage(redis, {}, DEFAULT_MAX_UPLOAD_BYTES + 1, NOON_UTC)).rejects.toMatchObject({ status: 413 });
  });

  it("accepts an upload under both caps and tracks total bytes", async () => {
    const redis = mockRedis();
    const total = await reserveStorage(redis, {}, 1024, NOON_UTC);
    expect(total).toBe(1024);
    expect(Number(redis.store.get("q:r2:bytes:total"))).toBe(1024);
  });

  it("rejects with 429 and rolls back when the total cap would be exceeded", async () => {
    const redis = mockRedis();
    const env = { MAX_STORAGE_BYTES: "2000", MAX_UPLOAD_BYTES: String(DEFAULT_MAX_UPLOAD_BYTES) };
    await reserveStorage(redis, env, 1500, NOON_UTC); // total 1500
    await expect(reserveStorage(redis, env, 1000, NOON_UTC)).rejects.toMatchObject({ status: 429 });
    // rolled back: still 1500, not 2500
    expect(Number(redis.store.get("q:r2:bytes:total"))).toBe(1500);
  });
});

describe("usageToday", () => {
  it("reports used vs limit for each resource plus storage", async () => {
    const redis = mockRedis();
    await consume(redis, {}, "request", NOON_UTC);
    await reserveStorage(redis, {}, 4096, NOON_UTC);
    const u = await usageToday(redis, {}, NOON_UTC);
    expect(u.request).toEqual({ used: 1, limit: DEFAULT_LIMITS.request });
    expect(u.r2_upload).toEqual({ used: 0, limit: DEFAULT_LIMITS.r2_upload });
    expect(u.storage_bytes).toEqual({ used: 4096, limit: DEFAULT_MAX_STORAGE_BYTES });
  });
});
