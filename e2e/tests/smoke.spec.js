import { test, expect } from "@playwright/test";

// A 1x1 transparent PNG — small but valid, for the media-upload round-trip.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function signup(page) {
  const user = `e2e${uniq()}`.slice(0, 24);
  await page.goto("/");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.locator("#u").fill(user);
  await page.locator("#p").fill("secret123");
  await page.getByRole("button", { name: /^Create account$/ }).click();
  await expect(page.locator("#header-actions")).toContainText(`@${user}`);
  return user;
}

async function createProject(page, title) {
  await page.getByRole("button", { name: /\+ submit/i }).click();
  await page.locator("#t").fill(title);
  await page.getByRole("button", { name: /shelve it/i }).click();
  const spine = page.getByRole("button", { name: new RegExp(`Open .*${esc(title)}`) });
  await expect(spine).toBeVisible();
  return spine;
}

test("home page renders the shelf and auth actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
});

test("signup, create a project, and upvote it (full stack)", async ({ page }) => {
  await signup(page);
  const title = `E2E Vibe ${uniq()}`;
  const spine = await createProject(page, title);

  await spine.click();
  const up = page.locator('#book-overlay .vote-btn[data-dir="up"] .up');
  const before = parseInt((await up.textContent()) || "0", 10);
  await page.locator('#book-overlay .vote-btn[data-dir="up"]').click();
  await expect(up).toHaveText(String(before + 1));
});

test("owner can upload media and it serves back from R2", async ({ page }) => {
  await signup(page);
  const title = `E2E Media ${uniq()}`;
  const spine = await createProject(page, title);
  await spine.click();

  await page.locator("#media-file").setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });

  const img = page.locator("#book-overlay .media-grid img").first();
  await expect(img).toBeVisible();
  // naturalWidth > 0 proves the <img> actually loaded from the Worker/R2 origin
  await expect.poll(() => img.evaluate((n) => n.complete && n.naturalWidth > 0)).toBe(true);

  // click-to-zoom: thumbnail opens a full-size lightbox; Escape closes it
  await img.click();
  await expect(page.locator(".lightbox .lightbox-img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).toHaveCount(0);
  // and the book overlay is still open underneath (Escape closed only the lightbox)
  await expect(page.locator("#book-overlay .media-grid")).toBeVisible();
});

// ADR-0002: media can be attached during creation (not only after).
test("media attached at creation appears in the book", async ({ page }) => {
  await signup(page);
  const title = `E2E Create Media ${uniq()}`;
  await page.getByRole("button", { name: /\+ submit/i }).click();
  await page.locator("#t").fill(title);
  await page.locator("#m").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: PNG_1x1 });
  await page.getByRole("button", { name: /shelve it/i }).click();

  const spine = page.getByRole("button", { name: new RegExp(`Open .*${esc(title)}`) });
  await expect(spine).toBeVisible();
  await spine.click();
  const img = page.locator("#book-overlay .media-grid img").first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((n) => n.complete && n.naturalWidth > 0)).toBe(true);
});

// ADR-0007: documentation versions — publish, list, fetch a prior version, and
// owner-only enforcement. Exercised at the API level (the book UX lands later).
test("project documentation versions (API)", async ({ request }) => {
  const base = process.env.E2E_API_URL;
  const mk = async (name) => (await (await request.post(`${base}/auth/signup`, { data: { username: name, password: "secret123" } })).json()).token;

  const owner = `ver${uniq()}`.slice(0, 24);
  const token = await mk(owner);
  const auth = { Authorization: `Bearer ${token}` };

  const created = await (await request.post(`${base}/projects`, { headers: auth, data: { title: `Ver ${uniq()}`, description: "v1 desc" } })).json();
  const id = created.id;
  expect(created.version).toBe(1);

  // publish v2
  const pub = await request.post(`${base}/projects/${id}/versions`, { headers: auth, data: { title: created.title, description: "v2 desc", changelog: "reworked the writeup" } });
  expect(pub.status()).toBe(201);
  const cur = await pub.json();
  expect(cur.version).toBe(2);
  expect(cur.description).toBe("v2 desc");

  // current project read reflects v2; votes/identity unchanged
  const proj = await (await request.get(`${base}/projects/${id}`)).json();
  expect(proj.version).toBe(2);
  expect(proj.up).toBe(0);

  // list shows both, newest current
  const list = await (await request.get(`${base}/projects/${id}/versions`)).json();
  expect(list.versions.map((x) => x.v).sort()).toEqual([1, 2]);
  expect(list.versions.find((x) => x.current).v).toBe(2);

  // fetch v1 → original description preserved
  const v1 = await (await request.get(`${base}/projects/${id}/versions/1`)).json();
  expect(v1.description).toBe("v1 desc");
  expect(v1.isCurrent).toBe(false);

  // a non-owner cannot publish
  const intruder = await mk(`ver${uniq()}x`.slice(0, 24));
  const forbidden = await request.post(`${base}/projects/${id}/versions`, { headers: { Authorization: `Bearer ${intruder}` }, data: { title: created.title } });
  expect(forbidden.status()).toBe(403);
});

// ADR-0007 (UX): owner publishes a new version from the book, then flips back.
test("owner publishes a new version and flips back in the book", async ({ page }) => {
  await signup(page);
  const title = `E2E VerUX ${uniq()}`;
  await page.getByRole("button", { name: /\+ submit/i }).click();
  await page.locator("#t").fill(title);
  await page.locator("#d").fill("first version text");
  await page.getByRole("button", { name: /shelve it/i }).click();

  const spine = page.getByRole("button", { name: new RegExp(`Open .*${esc(title)}`) });
  await expect(spine).toBeVisible();
  await spine.click();

  // publish v2
  await page.locator("#book-overlay [data-publish]").click();
  await expect(page.locator("#modal-overlay")).toContainText(/Publish a new version/i);
  await page.locator("#modal-overlay #d").fill("second version text");
  await page.locator("#modal-overlay #cl").fill("reworked the writeup");
  await page.getByRole("button", { name: /publish version/i }).click();

  // reopen → nav shows v2 current, then flip back to v1
  await spine.click();
  await expect(page.locator("#book-overlay .version-nav")).toBeVisible();
  await expect(page.locator("#book-overlay [data-vlabel]")).toContainText("v2 of 2");
  await expect(page.locator("#book-overlay [data-desc]")).toContainText("second version text");
  await page.locator("#book-overlay [data-vprev]").click();
  await expect(page.locator("#book-overlay [data-desc]")).toContainText("first version text");
  await expect(page.locator("#book-overlay [data-vlabel]")).toContainText("v1 of 2");
});

// A project can carry both a live-demo and a repo link, shown in the book.
test("a project can carry a repo link, shown in the book", async ({ page }) => {
  await signup(page);
  const title = `E2E Repo ${uniq()}`;
  await page.getByRole("button", { name: /\+ submit/i }).click();
  await page.locator("#t").fill(title);
  await page.locator("#l").fill("https://demo.example");
  await page.locator("#r").fill("https://github.com/octocat/hello");
  await page.getByRole("button", { name: /shelve it/i }).click();

  const spine = page.getByRole("button", { name: new RegExp(`Open .*${esc(title)}`) });
  await expect(spine).toBeVisible();
  await spine.click();
  const links = page.locator("#book-overlay .links");
  await expect(links).toContainText(/repo/i);
  await expect(links.locator('a[href="https://github.com/octocat/hello"]')).toHaveCount(1);
});

// A user can edit their own profile (bio + GitHub), and it renders back.
test("a user can edit their own profile", async ({ page }) => {
  await signup(page);
  await page.locator("#header-actions .header-me").click();
  await expect(page.locator("#modal-overlay .profile")).toBeVisible();
  await page.locator("#modal-overlay [data-edit-profile]").click();
  await page.locator("#modal-overlay [data-bio]").fill("vibes only");
  await page.locator("#modal-overlay [data-github]").fill("octocat");
  await page.locator("#modal-overlay [data-save-profile]").click();
  await expect(page.locator("#modal-overlay .profile-bio")).toContainText("vibes only");
  await expect(page.locator('#modal-overlay .profile-links a[href="https://github.com/octocat"]')).toHaveCount(1);
});

// ADR-0006: a moderator (here a super_admin via the SUPERADMINS allowlist) can
// hide a project off the shelf and remove a note. Username `e2eadmin` matches the
// allowlist wired into the Docker API, so this is order-independent.
test("a super_admin can hide a project and remove a note", async ({ page }) => {
  // sign up the allow-listed admin (idempotent fresh DB per run)
  await page.goto("/");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.locator("#u").fill("e2eadmin");
  await page.locator("#p").fill("secret123");
  await page.getByRole("button", { name: /^Create account$/ }).click();
  await expect(page.locator("#header-actions")).toContainText("@e2eadmin");
  await expect(page.locator("#header-actions .role-badge")).toContainText(/super admin/i);

  const title = `E2E Mod ${uniq()}`;
  const spine = await createProject(page, title);
  await spine.click();

  // leave a note, then remove it as a moderator
  const note = `note to remove ${uniq()}`;
  await page.locator("#book-overlay #note").fill(note);
  await page.locator('#book-overlay .vote-btn[data-dir="up"]').click();
  await expect(page.locator("#book-overlay .notes")).toContainText(note);
  await page.locator("#book-overlay .note-remove").first().click();
  await expect(page.locator("#book-overlay .notes")).not.toContainText(note);

  // hide the project — it should drop off the shelf
  await page.locator("#book-overlay [data-hide-toggle]").click();
  await expect(page.locator("#book-overlay [data-hidden-badge]")).toBeVisible();
  await page.locator("#book-overlay .book-close").click();
  await expect(page.getByRole("button", { name: new RegExp(`Open .*${esc(title)}`) })).toHaveCount(0);

  // role/trust now live on the user profile: open it from the header username and
  // confirm the super_admin moderation editor is present and populated.
  await page.locator("#header-actions .header-me").click();
  await expect(page.locator("#modal-overlay .profile")).toBeVisible();
  await expect(page.locator("#modal-overlay [data-save-admin]")).toBeVisible();
  await expect(page.locator("#modal-overlay [data-role]")).toBeVisible();
  await expect(page.locator("#modal-overlay [data-trust]")).toHaveValue("1");
});

// ADR-0003: a note left with a vote is persisted AND rendered back in the book.
test("a note left with a vote is surfaced in the book", async ({ page }) => {
  const user = await signup(page);
  const title = `E2E Note ${uniq()}`;
  const spine = await createProject(page, title);
  await spine.click();

  const note = `vibes were immaculate ${uniq()}`;
  await page.locator("#book-overlay #note").fill(note);
  await page.locator('#book-overlay .vote-btn[data-dir="up"]').click();

  const notes = page.locator("#book-overlay .notes");
  await expect(notes).toContainText(note);
  await expect(notes).toContainText(`@${user}`);

  // and it survives a reload (persisted, not just optimistic UI)
  await page.reload();
  await spine.click();
  await expect(page.locator("#book-overlay .notes")).toContainText(note);
});
