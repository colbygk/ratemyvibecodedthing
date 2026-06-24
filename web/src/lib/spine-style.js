// Deterministic spine appearance derived from a project id/title.
// Same input -> same cloth color, foil, height & width. Library-cloth palette.

const CLOTH = [
  { bg: "#3a4a44", text: "#f1ece0" }, // forest
  { bg: "#6e2b2b", text: "#f3e7df" }, // oxblood
  { bg: "#243b53", text: "#e7eef5" }, // navy
  { bg: "#7a5c1e", text: "#f6efd9" }, // mustard
  { bg: "#3c3550", text: "#ece7f3" }, // aubergine
  { bg: "#2f4858", text: "#e4eef2" }, // slate teal
  { bg: "#5a3825", text: "#f1e4d6" }, // tan leather
  { bg: "#1f3d34", text: "#e3f0e9" }, // deep green
  { bg: "#4a2f3a", text: "#f2e2e8" }, // plum
  { bg: "#33363d", text: "#e9eaee" }, // charcoal
];

const FOIL = ["#e8b75f", "#4ee6c8", "#d9cfbd", "#cfa6e0"];

// tiny string hash -> uint32
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function spineStyle(project) {
  const seed = String(project.coverSeed ?? project.id ?? project.title ?? "x");
  const h = hash(seed);
  // user can override the cloth color via project.coverColor
  const cloth = project.coverColor
    ? { bg: project.coverColor, text: pickText(project.coverColor) }
    : CLOTH[h % CLOTH.length];
  // Use unsigned shifts (>>>): the hash can exceed 2^31, and signed >> would
  // go negative and push width/height out of their intended ranges.
  const foil = FOIL[(h >>> 8) % FOIL.length];
  const width = 160 + ((h >>> 3) % 40);          // 160–199px (large "volume" panels)
  const height = 460 + ((h >>> 5) % 90);         // 460–549px (taller volumes)
  // Rich gradient (not flat): dark crown → color wash at the foot. Used as the
  // cover when there's no screenshot, and as a tint over screenshots.
  const grad = `linear-gradient(180deg, #08090d 0%, ${cloth.bg}1f 42%, ${cloth.bg}cc 100%)`;
  // wash sits OVER a screenshot: faint dark crown (score legibility), clear
  // middle (screenshot shows), color at the foot (title legibility).
  const wash = `linear-gradient(180deg, rgba(8,9,13,0.6) 0%, rgba(8,9,13,0) 20%, rgba(8,9,13,0) 40%, ${cloth.bg}80 72%, ${cloth.bg}f2 100%)`;
  return {
    "--spine-color": cloth.bg,
    "--spine-text": cloth.text,
    "--spine-foil": foil,
    "--spine-grad": grad,
    "--spine-wash": wash,
    "--spine-w": `${width}px`,
    "--spine-h": `${height}px`,
  };
}

// mShots (free, no key, server-cached) screenshot of a project URL → spine cover.
export function shotURL(url, w = 360, h = 520) {
  if (!url) return null;
  return `https://s0.wp.com/mshots/v1/${encodeURIComponent(url)}?w=${w}&h=${h}`;
}

function pickText(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1b1814" : "#f3ece0";
}
