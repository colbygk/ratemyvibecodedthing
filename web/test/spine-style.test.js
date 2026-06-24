import { describe, it, expect } from "vitest";
import { spineStyle, shotURL, titleFontPx } from "../src/lib/spine-style.js";

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
      expect(h).toBeGreaterThanOrEqual(160);
      expect(h).toBeLessThanOrEqual(190);
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

describe("titleFontPx", () => {
  it("keeps short titles at the readable maximum", () => {
    expect(titleFontPx("Fern", 170)).toBe(17);
  });

  it("shrinks a long unbreakable title so it fits the spine width", () => {
    const big = titleFontPx("Fern", 170);
    const small = titleFontPx("ratemyvibecodedthing.ai", 170);
    expect(small).toBeLessThan(big);
  });

  it("never goes below the minimum or above the maximum", () => {
    expect(titleFontPx("a".repeat(80), 160)).toBeGreaterThanOrEqual(11);
    expect(titleFontPx("", 200)).toBeLessThanOrEqual(17);
  });

  it("gives wider spines a larger fit for the same title", () => {
    expect(titleFontPx("ratemyvibecodedthing.ai", 199))
      .toBeGreaterThanOrEqual(titleFontPx("ratemyvibecodedthing.ai", 160));
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
