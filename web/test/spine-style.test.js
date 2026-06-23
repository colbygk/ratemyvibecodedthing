import { describe, it, expect } from "vitest";
import { spineStyle } from "../src/lib/spine-style.js";

describe("spineStyle", () => {
  it("is deterministic for the same project", () => {
    const p = { id: "abc", title: "Pixel Garden" };
    expect(spineStyle(p)).toEqual(spineStyle(p));
  });

  it("differs across different seeds (mostly)", () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(JSON.stringify(spineStyle({ id: `p-${i}` })));
    // expect a healthy spread, not all identical
    expect(seen.size).toBeGreaterThan(10);
  });

  it("keeps width and height within the designed ranges", () => {
    for (let i = 0; i < 200; i++) {
      const s = spineStyle({ id: `seed-${i}` });
      const w = parseInt(s["--spine-w"], 10);
      const h = parseInt(s["--spine-h"], 10);
      expect(w).toBeGreaterThanOrEqual(28);
      expect(w).toBeLessThanOrEqual(50);
      expect(h).toBeGreaterThanOrEqual(150);
      expect(h).toBeLessThanOrEqual(220);
    }
  });

  it("honors a user-supplied cover color", () => {
    const s = spineStyle({ id: "abc", coverColor: "#ffffff" });
    expect(s["--spine-color"]).toBe("#ffffff");
    // light cover → dark text for contrast
    expect(s["--spine-text"]).toBe("#1b1814");
  });

  it("uses light text on a dark custom cover", () => {
    const s = spineStyle({ id: "abc", coverColor: "#101010" });
    expect(s["--spine-text"]).toBe("#f3ece0");
  });
});
