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
  const width = 28 + ((h >>> 3) % 22);          // 28–49px
  const height = 150 + ((h >>> 5) % 70);        // 150–219px
  return {
    "--spine-color": cloth.bg,
    "--spine-text": cloth.text,
    "--spine-foil": foil,
    "--spine-w": `${width}px`,
    "--spine-h": `${height}px`,
  };
}

function pickText(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1b1814" : "#f3ece0";
}
