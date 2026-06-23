import { describe, it, expect } from "vitest";
import {
  json, httpError, cors, clientIP, safeJSON, validateCreds, hashArrayToObject,
} from "../src/lib/util.js";

describe("json", () => {
  it("serializes with status and JSON content-type", async () => {
    const res = json({ ok: true }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("httpError", () => {
  it("attaches a status to the Error", () => {
    const e = httpError("nope", 403);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("nope");
    expect(e.status).toBe(403);
  });
  it("defaults to 400", () => expect(httpError("x").status).toBe(400));
});

describe("cors", () => {
  it("sets allow-origin and preserves status", () => {
    // 204 carries no body, so the Worker builds it as new Response(null, …) — mirror that here.
    const res = cors(new Response(null, { status: 204 }), "https://ratemyvibecodedthing.ai");
    expect(res.headers.get("access-control-allow-origin")).toBe("https://ratemyvibecodedthing.ai");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(res.status).toBe(204);
  });
});

describe("clientIP", () => {
  it("prefers CF-Connecting-IP", () => {
    const req = new Request("https://x", { headers: { "CF-Connecting-IP": "1.2.3.4", "x-forwarded-for": "9.9.9.9" } });
    expect(clientIP(req)).toBe("1.2.3.4");
  });
  it("falls back to x-forwarded-for then a default", () => {
    expect(clientIP(new Request("https://x", { headers: { "x-forwarded-for": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIP(new Request("https://x"))).toBe("0.0.0.0");
  });
});

describe("safeJSON", () => {
  it("parses valid JSON", () => expect(safeJSON('{"a":1}', null)).toEqual({ a: 1 }));
  it("returns fallback on invalid JSON", () => expect(safeJSON("{not json", [])).toEqual([]));
  it("returns fallback on empty/undefined", () => {
    expect(safeJSON("", [])).toEqual([]);
    expect(safeJSON(undefined, "x")).toBe("x");
  });
});

describe("validateCreds", () => {
  it("accepts valid credentials", () => expect(() => validateCreds("nova_01", "secret")).not.toThrow());
  it("rejects bad usernames", () => {
    expect(() => validateCreds("a", "secret")).toThrow();        // too short
    expect(() => validateCreds("has space", "secret")).toThrow(); // illegal char
    expect(() => validateCreds("nope!", "secret")).toThrow();
  });
  it("rejects short passwords", () => expect(() => validateCreds("nova", "abc")).toThrow(/Password/));
});

describe("hashArrayToObject", () => {
  it("normalizes a flat HGETALL array", () => {
    expect(hashArrayToObject(["title", "Nova", "up", "3"])).toEqual({ title: "Nova", up: "3" });
  });
  it("returns null for empty/missing input", () => {
    expect(hashArrayToObject([])).toBeNull();
    expect(hashArrayToObject(null)).toBeNull();
  });
});
