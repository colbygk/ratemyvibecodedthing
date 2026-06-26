import { describe, it, expect } from "vitest";
import { sanitizeProfileEdits, normalizeGithub, profileToHSET } from "../src/lib/profile.js";

describe("normalizeGithub", () => {
  it("accepts a bare username", () => expect(normalizeGithub("octocat")).toBe("octocat"));
  it("strips a leading @", () => expect(normalizeGithub("@octocat")).toBe("octocat"));
  it("extracts the handle from a github URL", () => {
    expect(normalizeGithub("https://github.com/octocat")).toBe("octocat");
    expect(normalizeGithub("http://www.github.com/octocat/")).toBe("octocat");
    expect(normalizeGithub("github.com/octocat/some-repo")).toBe("octocat");
  });
  it("allows clearing (empty)", () => expect(normalizeGithub("")).toBe(""));
  it("rejects invalid handles", () => {
    expect(() => normalizeGithub("not a name")).toThrow(/github/i);
    expect(() => normalizeGithub("https://twitter.com/x")).toThrow(/github/i);
  });
});

describe("sanitizeProfileEdits", () => {
  it("returns only provided fields", () => {
    expect(sanitizeProfileEdits({})).toEqual({});
    expect(sanitizeProfileEdits({ bio: "hi" })).toEqual({ bio: "hi" });
  });
  it("caps the bio length", () => {
    expect(sanitizeProfileEdits({ bio: "x".repeat(400) }).bio).toHaveLength(280);
  });
  it("normalizes github", () => {
    expect(sanitizeProfileEdits({ github: "@octocat" })).toEqual({ github: "octocat" });
    expect(sanitizeProfileEdits({ github: "" })).toEqual({ github: "" });
  });
  it("sanitizes social links and drops entries without a url", () => {
    const out = sanitizeProfileEdits({
      links: [{ label: "Mastodon", url: "https://m/u" }, { url: "" }, { label: "x" }],
    });
    expect(out.links).toEqual([{ label: "Mastodon", url: "https://m/u" }]);
  });
  it("defaults a missing label to the url, and caps to 6", () => {
    const links = Array.from({ length: 9 }, (_, i) => ({ url: `https://s/${i}` }));
    const out = sanitizeProfileEdits({ links });
    expect(out.links).toHaveLength(6);
    expect(out.links[0]).toEqual({ label: "https://s/0", url: "https://s/0" });
  });
  it("rejects non-array links", () => {
    expect(() => sanitizeProfileEdits({ links: "nope" })).toThrow(/array/i);
  });
});

describe("profileToHSET", () => {
  it("flattens to [field, value, …] and JSON-encodes links", () => {
    const flat = profileToHSET({ bio: "hi", links: [{ label: "a", url: "u" }] });
    const obj = {};
    for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
    expect(obj.bio).toBe("hi");
    expect(JSON.parse(obj.links)).toEqual([{ label: "a", url: "u" }]);
  });
});
