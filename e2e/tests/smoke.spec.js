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
