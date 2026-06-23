import { describe, it, expect } from "vitest";
import { MOCK_PROJECTS } from "../src/lib/mock.js";

describe("MOCK_PROJECTS", () => {
  it("provides a shelf of sample books", () => {
    expect(MOCK_PROJECTS.length).toBeGreaterThanOrEqual(20);
  });

  it("has unique ids", () => {
    const ids = MOCK_PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every project has the fields the UI needs", () => {
    for (const p of MOCK_PROJECTS) {
      expect(typeof p.title).toBe("string");
      expect(typeof p.author).toBe("string");
      expect(Array.isArray(p.links)).toBe(true);
      expect(Array.isArray(p.media)).toBe(true);
      expect(Number.isFinite(p.up)).toBe(true);
      expect(Number.isFinite(p.down)).toBe(true);
    }
  });
});
