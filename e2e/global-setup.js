import { request } from "@playwright/test";

// Block until the API and the web dev-server are actually answering, so tests
// don't race the stack's startup (compose depends_on only gets us so far —
// vite still needs a moment to compile on first request).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(ctx, url, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await ctx.get(url, { timeout: 4000 });
      if (res.ok()) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL || "http://web-e2e:5173";
  const api = process.env.E2E_API_URL || "http://api:8787";
  const ctx = await request.newContext();
  await waitFor(ctx, `${api}/`);
  await waitFor(ctx, `${base}/`);
  await ctx.dispose();
}
