import { describe, it, expect } from "vitest";
import { uploadLimitsFor, UPLOAD_TIERS } from "../src/lib/upload-limits.js";

const MB = 1024 * 1024;

describe("uploadLimitsFor(trust)", () => {
  it("tier 1 (new accounts) keeps today's 25 MB / 3 — no regression", () => {
    expect(uploadLimitsFor(1)).toEqual({ maxBytes: 25 * MB, maxMedia: 3 });
    expect(uploadLimitsFor(0)).toEqual({ maxBytes: 25 * MB, maxMedia: 3 });
  });

  it("grants more as trust rises (monotonic, additive)", () => {
    const t1 = uploadLimitsFor(1);
    const t5 = uploadLimitsFor(5);
    const t10 = uploadLimitsFor(10);
    expect(t5.maxBytes).toBeGreaterThan(t1.maxBytes);
    expect(t10.maxBytes).toBeGreaterThan(t5.maxBytes);
    expect(t10.maxMedia).toBeGreaterThanOrEqual(t5.maxMedia);
  });

  it("honors tier boundaries exactly", () => {
    expect(uploadLimitsFor(2).maxBytes).toBe(35 * MB);
    expect(uploadLimitsFor(4).maxBytes).toBe(35 * MB);
    expect(uploadLimitsFor(5).maxBytes).toBe(50 * MB);
    expect(uploadLimitsFor(9).maxBytes).toBe(50 * MB);
    expect(uploadLimitsFor(10).maxBytes).toBe(90 * MB);
    expect(uploadLimitsFor(999).maxBytes).toBe(90 * MB);
  });

  it("never exceeds the sub-100 MB Worker ceiling", () => {
    for (const tier of UPLOAD_TIERS) expect(tier.maxBytes).toBeLessThan(100 * MB);
    expect(uploadLimitsFor(10_000).maxBytes).toBeLessThan(100 * MB);
  });

  it("treats a bad/absent trust as tier 1", () => {
    expect(uploadLimitsFor(undefined)).toEqual({ maxBytes: 25 * MB, maxMedia: 3 });
    expect(uploadLimitsFor("nonsense")).toEqual({ maxBytes: 25 * MB, maxMedia: 3 });
  });

  it("MAX_UPLOAD_BYTES env acts as a hard upper clamp over the whole ladder", () => {
    const env = { MAX_UPLOAD_BYTES: String(8 * MB) };
    expect(uploadLimitsFor(10, env).maxBytes).toBe(8 * MB); // clamped down from 90
    expect(uploadLimitsFor(1, env).maxBytes).toBe(8 * MB);  // clamped down from 25
  });

  it("ignores an env clamp that is larger than the tier (clamp only lowers)", () => {
    const env = { MAX_UPLOAD_BYTES: String(200 * MB) };
    expect(uploadLimitsFor(1, env).maxBytes).toBe(25 * MB);
  });
});
