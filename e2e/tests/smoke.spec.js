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
