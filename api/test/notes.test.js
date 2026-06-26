import { describe, it, expect } from "vitest";
import { notesObjectToList } from "../src/lib/notes.js";

describe("notesObjectToList", () => {
  it("turns a {username: note} map into a list", () => {
    const out = notesObjectToList({ nova: "great vibes", pixel: "loved it" });
    expect(out).toEqual([
      { username: "nova", note: "great vibes" },
      { username: "pixel", note: "loved it" },
    ]);
  });

  it("returns [] for null/empty (no notes yet)", () => {
    expect(notesObjectToList(null)).toEqual([]);
    expect(notesObjectToList(undefined)).toEqual([]);
    expect(notesObjectToList({})).toEqual([]);
  });

  it("skips empty note values", () => {
    expect(notesObjectToList({ nova: "", pixel: "hi" })).toEqual([{ username: "pixel", note: "hi" }]);
  });
});
