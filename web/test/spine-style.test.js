import { describe, it, expect } from "vitest";
import { spineStyle, shotURL } from "../src/lib/spine-style.js";

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
      expect(w).toBeGreaterThanOrEqual(160);
      expect(w).toBeLessThanOrEqual(200);
      expect(h).toBeGreaterThanOrEqual(460);
      expect(h).toBeLessThanOrEqual(550);
    }
  });

  it("provides a gradient cover derived from the color", () => {
    expect(spineStyle({ id: "abc" })["--spine-grad"]).toMatch(/linear-gradient/);
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

describe("shotURL", () => {
  it("builds an mShots URL with the encoded target", () => {
    const u = shotURL("https://example.com/app?a=1", 360, 520);
    expect(u).toContain("s0.wp.com/mshots/v1/");
    expect(u).toContain(encodeURIComponent("https://example.com/app?a=1"));
    expect(u).toContain("w=360");
  });
  it("returns null when there is no url", () => {
    expect(shotURL("")).toBeNull();
    expect(shotURL(null)).toBeNull();
  });
});
