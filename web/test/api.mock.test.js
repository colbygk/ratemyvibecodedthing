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

  it("exposes follow graph + follow/unfollow without throwing (mock)", async () => {
    await api.signup("nova", "secret");
    expect(await api.graph("byte_baker")).toMatchObject({ username: "byte_baker", followers: 0, following: 0 });
    await expect(api.follow("byte_baker")).resolves.toBeUndefined();
    await expect(api.unfollow("byte_baker")).resolves.toBeUndefined();
  });

  it("resolves media urls: root-relative against the base, absolute untouched", async () => {
    const { mediaUrl } = await import("../src/lib/api.js");
    expect(mediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    // mock mode has an empty base, so a root-relative path is returned as-is
    expect(mediaUrl("/media/a/b.png")).toBe("/media/a/b.png");
  });

  it("appends uploaded media to a project (mock)", async () => {
    await api.signup("nova", "secret");
    const created = await api.createProject({ title: "Has Media" });
    const res = await api.uploadMedia(created.id, { name: "demo.mp4", type: "video/mp4", size: 2048 });
    expect(res.media).toHaveLength(1);
    expect(res.media[0].type).toBe("video");
    const fetched = await api.getProject(created.id);
    expect(fetched.media).toHaveLength(1);
  });

  it("exposes a shared media cap of 3", async () => {
    const { MAX_MEDIA } = await import("../src/lib/api.js");
    expect(MAX_MEDIA).toBe(3);
  });

  it("surfaces a note via the notes read path (ADR-0003 bug fix)", async () => {
    await api.signup("nova", "secret");
    const [target] = await api.listProjects();
    expect((await api.notes(target.id)).notes).toEqual([]); // none yet
    await api.vote(target.id, "up", "lovely vibes");
    const { notes } = await api.notes(target.id);
    expect(notes).toEqual([{ username: "nova", note: "lovely vibes" }]);
  });

  it("does not record a note for anonymous voters", async () => {
    const list = await api.listProjects();
    const target = list[2];
    await api.vote(target.id, "up", "anon note");
    expect((await api.notes(target.id)).notes).toEqual([]);
  });
});
