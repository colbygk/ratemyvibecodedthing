// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

async function fresh() {
  vi.resetModules();
  return (await import("../src/components/profile.js")).openProfile;
}

describe("openProfile", () => {
  let overlay;
  beforeEach(() => { document.body.innerHTML = ""; overlay = document.createElement("div"); document.body.appendChild(overlay); });

  it("renders the username and a follow button (viewing someone else), and closes", async () => {
    const openProfile = await fresh();
    const { close } = openProfile(overlay, "nova", { session: { username: "cgk", role: "user", following: [] } });
    expect(overlay.textContent).toContain("@nova");
    expect(overlay.querySelector("[data-follow]")).toBeTruthy();
    close();
    expect(overlay.dataset.open).toBe("false");
    expect(overlay.innerHTML).toBe("");
  });

  it("omits the follow button when viewing your own profile", async () => {
    const openProfile = await fresh();
    openProfile(overlay, "cgk", { session: { username: "cgk", role: "user", following: [] } });
    expect(overlay.querySelector("[data-follow]")).toBeNull();
  });

  it("shows the role/trust editor only for a super_admin viewer", async () => {
    const openProfile = await fresh();
    openProfile(overlay, "nova", { session: { username: "boss", role: "super_admin", following: [] } });
    expect(overlay.querySelector("[data-save-admin]")).toBeTruthy();
    expect(overlay.querySelector("[data-role]")).toBeTruthy();
    expect(overlay.querySelector("[data-trust]")).toBeTruthy();
  });

  it("hides the editor from a plain user", async () => {
    const openProfile = await fresh();
    openProfile(overlay, "nova", { session: { username: "rando", role: "user", following: [] } });
    expect(overlay.querySelector("[data-save-admin]")).toBeNull();
  });

  it("works for anonymous viewers (no session): name only, no follow/editor", async () => {
    const openProfile = await fresh();
    openProfile(overlay, "nova", {});
    expect(overlay.textContent).toContain("@nova");
    expect(overlay.querySelector("[data-follow]")).toBeNull();
    expect(overlay.querySelector("[data-save-admin]")).toBeNull();
  });
});
