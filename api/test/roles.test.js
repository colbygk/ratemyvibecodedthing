import { describe, it, expect } from "vitest";
import {
  ROLES, ROLE_RANK, normalizeRole, roleAtLeast, can,
  parseSuperadmins, effectiveRole, accountKeysOnly, firstUserRole,
} from "../src/lib/roles.js";

describe("role normalization & ranking", () => {
  it("knows the three roles in order", () => {
    expect(ROLE_RANK[ROLES.USER]).toBeLessThan(ROLE_RANK[ROLES.MODERATOR]);
    expect(ROLE_RANK[ROLES.MODERATOR]).toBeLessThan(ROLE_RANK[ROLES.SUPER_ADMIN]);
  });
  it("normalizes unknown/empty roles to user", () => {
    expect(normalizeRole("wizard")).toBe(ROLES.USER);
    expect(normalizeRole(undefined)).toBe(ROLES.USER);
    expect(normalizeRole("moderator")).toBe(ROLES.MODERATOR);
  });
  it("roleAtLeast compares by rank", () => {
    expect(roleAtLeast(ROLES.SUPER_ADMIN, ROLES.MODERATOR)).toBe(true);
    expect(roleAtLeast(ROLES.MODERATOR, ROLES.MODERATOR)).toBe(true);
    expect(roleAtLeast(ROLES.USER, ROLES.MODERATOR)).toBe(false);
  });
});

describe("can(role, action)", () => {
  it("lets moderators hide projects and remove notes", () => {
    expect(can(ROLES.MODERATOR, "project:hide")).toBe(true);
    expect(can(ROLES.MODERATOR, "note:remove")).toBe(true);
  });
  it("reserves role/trust changes for super_admin", () => {
    expect(can(ROLES.MODERATOR, "role:set")).toBe(false);
    expect(can(ROLES.MODERATOR, "trust:set")).toBe(false);
    expect(can(ROLES.SUPER_ADMIN, "role:set")).toBe(true);
    expect(can(ROLES.SUPER_ADMIN, "trust:set")).toBe(true);
  });
  it("denies plain users everything privileged", () => {
    expect(can(ROLES.USER, "project:hide")).toBe(false);
    expect(can(ROLES.USER, "note:remove")).toBe(false);
  });
  it("denies unknown actions", () => {
    expect(can(ROLES.SUPER_ADMIN, "launch:missiles")).toBe(false);
  });
});

describe("parseSuperadmins + effectiveRole (env bootstrap)", () => {
  it("parses a csv allowlist case-insensitively", () => {
    const s = parseSuperadmins(" CGK , Nova ");
    expect(s.has("cgk")).toBe(true);
    expect(s.has("nova")).toBe(true);
  });
  it("elevates an allowlisted user to super_admin regardless of stored role", () => {
    expect(effectiveRole("user", "cgk", "cgk")).toBe(ROLES.SUPER_ADMIN);
    expect(effectiveRole(undefined, "CGK", "cgk,nova")).toBe(ROLES.SUPER_ADMIN);
  });
  it("otherwise returns the (normalized) stored role", () => {
    expect(effectiveRole("moderator", "nova", "cgk")).toBe(ROLES.MODERATOR);
    expect(effectiveRole(undefined, "nova", "")).toBe(ROLES.USER);
  });
});

describe("first-user detection (populated-DB safe)", () => {
  it("keeps only real account keys (user:<name>), not :projects or others", () => {
    expect(accountKeysOnly([
      "user:cgk", "user:cgk:projects", "user:nova", "following:cgk", "project:abc",
    ])).toEqual(["user:cgk", "user:nova"]);
  });
  it("grants super_admin only when there are zero existing accounts", () => {
    expect(firstUserRole(0)).toBe(ROLES.SUPER_ADMIN);
    expect(firstUserRole(1)).toBe(ROLES.USER);
    expect(firstUserRole(5)).toBe(ROLES.USER);
  });
});
