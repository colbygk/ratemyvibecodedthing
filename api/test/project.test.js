import { describe, it, expect } from "vitest";
import { sanitizeProjectEdits, editsToHSET } from "../src/lib/project.js";

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
