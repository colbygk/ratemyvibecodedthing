import { describe, it, expect } from "vitest";
import { uploadLimitsFor, maxMediaFor } from "../src/lib/limits.js";

const MB = 1024 * 1024;

describe("client upload limits mirror the server ladder", () => {
  it("tier 1 is 25 MB / 3 (today's default — no regression)", () => {
    expect(uploadLimitsFor(1)).toMatchObject({ maxBytes: 25 * MB, maxMedia: 3 });
    expect(maxMediaFor(1)).toBe(3);
  });
  it("grants more media as trust rises", () => {
    expect(maxMediaFor(5)).toBe(4);
    expect(maxMediaFor(10)).toBe(5);
  });
  it("defaults a bad/absent trust to tier 1", () => {
    expect(maxMediaFor(undefined)).toBe(3);
    expect(maxMediaFor("nope")).toBe(3);
  });
});
