import { describe, it, expect } from "vitest";
import {
  bytesToHex, hexToBytes, timingSafeEqual,
  hashPassword, signJWT, verifyJWT,
} from "../src/lib/crypto.js";

describe("hex encoding", () => {
  it("round-trips bytes ↔ hex", () => {
    const bytes = new Uint8Array([0, 15, 16, 255, 128]);
    expect(bytesToHex(bytes)).toBe("000f10ff80");
    expect([...hexToBytes("000f10ff80")]).toEqual([...bytes]);
  });
});

describe("timingSafeEqual", () => {
  it("is true for equal strings", () => expect(timingSafeEqual("abc123", "abc123")).toBe(true));
  it("is false for different content", () => expect(timingSafeEqual("abc123", "abc124")).toBe(false));
  it("is false for different length", () => expect(timingSafeEqual("abc", "abcd")).toBe(false));
});

describe("hashPassword (PBKDF2)", () => {
  it("is deterministic for the same password + salt", async () => {
    const a = await hashPassword("hunter2", "aabbccdd");
    const b = await hashPassword("hunter2", "aabbccdd");
    expect(a).toBe(b);
  });
  it("produces a 256-bit (64 hex char) digest", async () => {
    expect(await hashPassword("hunter2", "aabbccdd")).toHaveLength(64);
  });
  it("differs when the salt differs", async () => {
    const a = await hashPassword("hunter2", "aabbccdd");
    const b = await hashPassword("hunter2", "11223344");
    expect(a).not.toBe(b);
  });
  it("differs when the password differs", async () => {
    const a = await hashPassword("hunter2", "aabbccdd");
    const b = await hashPassword("hunter3", "aabbccdd");
    expect(a).not.toBe(b);
  });
});

describe("JWT sign/verify", () => {
  const SECRET = "test-secret-please-change";
  const NOW = 1_700_000_000_000;

  it("round-trips a payload", async () => {
    const token = await signJWT({ sub: "nova" }, SECRET, NOW);
    const payload = await verifyJWT(token, SECRET, NOW);
    expect(payload.sub).toBe("nova");
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects a tampered signature", async () => {
    const token = await signJWT({ sub: "nova" }, SECRET, NOW);
    const forged = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    await expect(verifyJWT(forged, SECRET, NOW)).rejects.toThrow();
  });

  it("rejects the wrong secret", async () => {
    const token = await signJWT({ sub: "nova" }, SECRET, NOW);
    await expect(verifyJWT(token, "other-secret", NOW)).rejects.toThrow(/signature/);
  });

  it("rejects an expired token", async () => {
    const token = await signJWT({ sub: "nova" }, SECRET, NOW);
    const later = NOW + 31 * 24 * 60 * 60 * 1000; // 31 days later
    await expect(verifyJWT(token, SECRET, later)).rejects.toThrow(/expired/);
  });

  it("rejects a malformed token", async () => {
    await expect(verifyJWT("not.a.jwt.token", SECRET, NOW)).rejects.toThrow();
    await expect(verifyJWT("garbage", SECRET, NOW)).rejects.toThrow(/malformed/);
  });
});
