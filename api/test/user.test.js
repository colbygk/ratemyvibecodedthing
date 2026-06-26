import { describe, it, expect } from "vitest";
import { DEFAULT_TRUST, newUserFields, publicUserShape } from "../src/lib/user.js";

describe("DEFAULT_TRUST", () => {
  it("starts new users at 1", () => expect(DEFAULT_TRUST).toBe(1));
});

describe("newUserFields", () => {
  it("produces a flat HSET field list including trust=1 by default", () => {
    const flat = newUserFields({ username: "Nova", pwhash: "ph", salt: "sa", now: 1700 });
    // even-length [field, value, …]
    expect(flat.length % 2).toBe(0);
    const obj = {};
    for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
    expect(obj).toMatchObject({
      pwhash: "ph",
      salt: "sa",
      created: "1700",
      username: "Nova",
      trust: "1",
    });
  });

  it("stores every value as a string (Redis HSET wants strings)", () => {
    const flat = newUserFields({ username: "x", pwhash: "p", salt: "s", now: 42 });
    expect(flat.every((v) => typeof v === "string")).toBe(true);
  });

  it("honors an explicit trust override", () => {
    const flat = newUserFields({ username: "x", pwhash: "p", salt: "s", now: 1, trust: 5 });
    const i = flat.indexOf("trust");
    expect(flat[i + 1]).toBe("5");
  });
});

describe("publicUserShape", () => {
  it("defaults following/followers to [] and trust to 1", () => {
    expect(publicUserShape({ username: "Nova" })).toEqual({
      username: "Nova",
      following: [],
      followers: [],
      trust: 1,
    });
  });

  it("coerces a string trust (as Redis returns it) to a number", () => {
    expect(publicUserShape({ username: "x", trust: "3" }).trust).toBe(3);
  });

  it("treats a missing/null trust as 1 (backward compatible)", () => {
    expect(publicUserShape({ username: "x", trust: null }).trust).toBe(1);
    expect(publicUserShape({ username: "x", trust: undefined }).trust).toBe(1);
  });

  it("passes through follow lists", () => {
    const out = publicUserShape({ username: "x", following: ["a"], followers: ["b", "c"] });
    expect(out.following).toEqual(["a"]);
    expect(out.followers).toEqual(["b", "c"]);
  });
});
