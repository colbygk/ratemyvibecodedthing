import { describe, it, expect, beforeEach, vi } from "vitest";

// The API client keeps module-level mock state; reset modules per test for isolation.
async function freshApi() {
  vi.resetModules();
  return (await import("../src/lib/api.js")).api;
}

describe("api (mock mode)", () => {
  let api;
  beforeEach(async () => {
    api = await freshApi();
  });

  it("runs in mock mode when no VITE_API_BASE is set", async () => {
    const { MOCK_MODE } = await import("../src/lib/api.js");
    expect(MOCK_MODE).toBe(true);
  });

  it("lists the sample projects", async () => {
    const list = await api.listProjects();
    expect(list.length).toBeGreaterThanOrEqual(20);
  });

  it("starts logged out, then signup establishes a session", async () => {
    expect(await api.me()).toBeNull();
    const user = await api.signup("nova", "secret");
    expect(user.username).toBe("nova");
    expect(await api.me()).toMatchObject({ username: "nova" });
  });

  it("allows one anonymous vote per project, then blocks", async () => {
    const [first] = await api.listProjects();
    const res = await api.vote(first.id, "up");
    expect(res.up).toBe(first.up + 1);
    await expect(api.vote(first.id, "up")).rejects.toThrow(/one vote/i);
  });

  it("lets a logged-in user vote and attach a note", async () => {
    await api.signup("nova", "secret");
    const list = await api.listProjects();
    const target = list[1];
    const res = await api.vote(target.id, "down", "shaky vibes");
    expect(res.down).toBe(target.down + 1);
    expect(res.note).toBe("shaky vibes");
  });

  it("prepends a newly created project to the shelf", async () => {
    await api.signup("nova", "secret");
    const created = await api.createProject({ title: "Brand New Thing" });
    const list = await api.listProjects();
    expect(list[0].title).toBe("Brand New Thing");
    expect(created.author).toBe("nova");
  });
});
