import { describe, it, expect } from "vitest";
import { MAX_VERSIONS, MAX_HISTORY, snapshotOf, sanitizeChangelog, mediaKeyFromUrl } from "../src/lib/version.js";

describe("retention constants", () => {
  it("keeps the last 5 versions (current + 4 history)", () => {
    expect(MAX_VERSIONS).toBe(5);
    expect(MAX_HISTORY).toBe(4);
  });
});

describe("snapshotOf", () => {
  it("captures only the versioned fields", () => {
    const snap = snapshotOf({
      id: "abc", author: "nova", up: 3, down: 1, coverColor: "#fff", hidden: false, // ignored
      version: 2, versionAt: 1700, changelog: "reworked",
      title: "Thing", description: "desc", links: [{ label: "demo", url: "u" }], media: [{ type: "image", url: "/media/x" }],
    });
    expect(snap).toEqual({
      v: 2,
      title: "Thing",
      description: "desc",
      links: [{ label: "demo", url: "u" }],
      media: [{ type: "image", url: "/media/x" }],
      created: 1700,
      changelog: "reworked",
    });
  });

  it("defaults version to 1 and tolerates missing fields", () => {
    const snap = snapshotOf({ title: "T", created: 50 });
    expect(snap.v).toBe(1);
    expect(snap.created).toBe(50);
    expect(snap.links).toEqual([]);
    expect(snap.media).toEqual([]);
    expect(snap.changelog).toBe("");
  });
});

describe("sanitizeChangelog", () => {
  it("coerces and caps at 200 chars", () => {
    expect(sanitizeChangelog(undefined)).toBe("");
    expect(sanitizeChangelog("hi")).toBe("hi");
    expect(sanitizeChangelog("x".repeat(400))).toHaveLength(200);
  });
});

describe("mediaKeyFromUrl", () => {
  it("extracts the R2 key from a /media/ url", () => {
    expect(mediaKeyFromUrl("/media/abc/12.png")).toBe("abc/12.png");
  });
  it("returns null for anything else", () => {
    expect(mediaKeyFromUrl("https://cdn/x.png")).toBeNull();
    expect(mediaKeyFromUrl("")).toBeNull();
    expect(mediaKeyFromUrl(undefined)).toBeNull();
  });
});
