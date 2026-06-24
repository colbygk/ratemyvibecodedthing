// Renders projects as large "volume" spines that flow responsively across rows,
// each backed by an auto-snapshot of the project's webpage (mShots) tinted with
// the chosen color, with the title set at the foot (à la "Since You Arrived").
import { spineStyle, shotURL, titleFontPx } from "../lib/spine-style.js";

export function renderShelves(container, projects, { onOpen, onCreate, showCreate } = {}) {
  container.innerHTML = "";
  const shelf = document.createElement("div");
  shelf.className = "shelf";

  if (showCreate) shelf.appendChild(slot(createAddSpine(onCreate)));
  for (const p of projects) shelf.appendChild(slot(createSpine(p, onOpen)));

  container.appendChild(shelf);
}

// fixed-height slot → every wrapped row gets the same baseline, so the repeating
// shelf-board line (drawn in CSS on .shelf) lines up under each row.
function slot(child) {
  const s = document.createElement("div");
  s.className = "slot";
  s.appendChild(child);
  return s;
}

function createSpine(project, onOpen) {
  const el = document.createElement("button");
  el.className = "spine";
  el.type = "button";
  el.setAttribute("aria-label", `Open “${project.title}” by ${project.author}`);
  const style = spineStyle(project);
  Object.entries(style).forEach(([k, v]) => el.style.setProperty(k, v));
  el.style.setProperty("--spine-title-size", `${titleFontPx(project.title, parseInt(style["--spine-w"], 10) || 170)}px`);

  const shot = shotURL(project.links?.[0]?.url);
  if (shot) {
    el.classList.add("spine--shot");
    el.style.setProperty("--spine-shot", `url("${shot}")`);
  }

  const net = (project.up || 0) - (project.down || 0);
  el.innerHTML = `
    <span class="spine-cover" aria-hidden="true"></span>
    <span class="spine-tint" aria-hidden="true"></span>
    <span class="spine-score">${net >= 0 ? "+" : ""}${net}</span>
    <span class="spine-foot">
      <span class="spine-title">${escape(project.title)}</span>
    </span>`;
  el.addEventListener("click", () => onOpen?.(project.id));
  return el;
}

function createAddSpine(onCreate) {
  const el = document.createElement("button");
  el.className = "spine spine--add";
  el.type = "button";
  el.style.setProperty("--spine-w", "170px");
  el.style.setProperty("--spine-h", "180px");
  el.setAttribute("aria-label", "Submit a new vibe-coded project");
  el.innerHTML = `<span class="plus">+</span><span class="spine-foot"><span class="spine-title">add a thing</span></span>`;
  el.addEventListener("click", () => onCreate?.());
  return el;
}

function escape(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
