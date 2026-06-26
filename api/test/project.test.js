import { describe, it, expect } from "vitest";
import { sanitizeProjectEdits, editsToHSET, MAX_MEDIA, assertMediaCapacity } from "../src/lib/project.js";

describe("media capacity", () => {
  it("caps a project at 3 media", () => expect(MAX_MEDIA).toBe(3));

  it("allows adding while under the cap", () => {
    expect(() => assertMediaCapacity(0)).not.toThrow();
    expect(() => assertMediaCapacity(2)).not.toThrow();
  });

  it("rejects (409) when already at the cap", () => {
    let err;
    try { assertMediaCapacity(3); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/3/);
  });

  it("rejects when over the cap (legacy projects with >3)", () => {
    expect(() => assertMediaCapacity(11)).toThrow();
  });
});

describe("sanitizeProjectEdits", () => {
  it("returns only the provided fields (partial patch)", () => {
    expect(sanitizeProjectEdits({})).toEqual({});
    expect(sanitizeProjectEdits({ description: "hi" })).toEqual({ description: "hi" });
  });

  it("trims and bounds the title; rejects an empty one", () => {
    expect(sanitizeProjectEdits({ title: "  Nova  " })).toEqual({ title: "Nova" });
    expect(() => sanitizeProjectEdits({ title: "   " })).toThrow(/empty/i);
  });

  it("caps description length", () => {
    const long = "x".repeat(900);
    expect(sanitizeProjectEdits({ description: long }).description).toHaveLength(600);
  });

  it("validates spine color", () => {
    expect(sanitizeProjectEdits({ coverColor: "#3a4a44" })).toEqual({ coverColor: "#3a4a44" });
    expect(sanitizeProjectEdits({ coverColor: "#abc" })).toEqual({ coverColor: "#abc" });
    expect(sanitizeProjectEdits({ coverColor: "" })).toEqual({ coverColor: "" }); // clears
    expect(() => sanitizeProjectEdits({ coverColor: "blue" })).toThrow(/spine color/i);
  });

  it("sanitizes links and drops entries without a url", () => {
    const out = sanitizeProjectEdits({
      links: [{ label: "demo", url: "https://x" }, { url: "" }, { label: "no url" }],
    });
    expect(out.links).toEqual([{ label: "demo", url: "https://x" }]);
  });

  it("rejects non-array links", () => {
    expect(() => sanitizeProjectEdits({ links: "nope" })).toThrow(/array/i);
  });
});

describe("editsToHSET", () => {
  it("flattens to [field, value, …] and JSON-encodes links", () => {
    const flat = editsToHSET({ title: "Nova", links: [{ label: "d", url: "u" }] });
    expect(flat[0]).toBe("title");
    expect(flat[1]).toBe("Nova");
    expect(flat[2]).toBe("links");
    expect(JSON.parse(flat[3])).toEqual([{ label: "d", url: "u" }]);
  });
});
