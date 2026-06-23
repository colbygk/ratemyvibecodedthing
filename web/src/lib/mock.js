// Mock data so the site is fully browsable with NO backend running.
// The API client falls back to this when VITE_API_BASE is unset or unreachable.

const TITLES = [
  "Recipe Roulette", "Dreamcatcher", "Synthwave Todo", "Pixel Garden", "Quantum Notes",
  "Bonsai Tracker", "Moodboard.exe", "Cassette Player", "Tarot API", "Lo-fi Generator",
  "Habit Forest", "Glyph Maker", "Tiny Wiki", "Star Atlas", "Cloud Doodle",
  "Echo Journal", "Prompt Forge", "Vapor Shop", "Neon Snake", "Markdown Muse",
  "Latent Diary", "Cipher Pad", "Orbit Sim", "Fern", "Static Bloom",
  "Whisper Notes", "Pocket Oracle", "Drift", "Kintsugi", "Halcyon",
];

const AUTHORS = ["nova", "pixel_witch", "byte_baker", "deltav", "moss", "circuitghost", "lumen", "vega_dev"];
const BLURBS = [
  "A weekend build that got out of hand. Prompted into existence over three espressos.",
  "I described the vibe and let the model run. Somehow it works.",
  "No idea how the state management works anymore but the animations are nice.",
  "Built entirely by conversation. I wrote zero functions by hand.",
  "An experiment in letting the AI architect everything. Results: surprising.",
];

function rnd(seed) { // deterministic pseudo-random per index
  let h = (seed * 2654435761) >>> 0;
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296);
}

export const MOCK_PROJECTS = TITLES.map((title, i) => {
  const r = rnd(i + 1);
  const up = Math.floor(r() * 400);
  const down = Math.floor(r() * 120);
  return {
    id: `mock-${i}`,
    title,
    author: AUTHORS[i % AUTHORS.length],
    description: BLURBS[i % BLURBS.length],
    links: r() > 0.4 ? [{ label: "live demo", url: "https://example.com" }, { label: "source", url: "https://github.com" }] : [{ label: "live demo", url: "https://example.com" }],
    media: [], // populated from R2 in production
    up, down,
    coverSeed: title,
  };
});

export const MOCK_SESSION = null; // logged out by default in mock mode
