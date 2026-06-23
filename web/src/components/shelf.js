// Renders projects as book spines, grouped into shelves.
import { spineStyle } from "../lib/spine-style.js";

const PER_SHELF = 22; // wraps responsively anyway; this just chunks shelf boards

export function renderShelves(container, projects, { onOpen, onCreate, showCreate } = {}) {
  container.innerHTML = "";
  const items = [...projects];

  // chunk into shelves
  const shelves = [];
  for (let i = 0; i < items.length; i += PER_SHELF) shelves.push(items.slice(i, i + PER_SHELF));
  if (!shelves.length) shelves.push([]);

  shelves.forEach((group, idx) => {
    const shelf = document.createElement("div");
    shelf.className = "shelf";

    // the create spine lives at the front of the first shelf when logged in
    if (idx === 0 && showCreate) {
      shelf.appendChild(createAddSpine(onCreate));
    }

    for (const p of group) shelf.appendChild(createSpine(p, onOpen));
    container.appendChild(shelf);
  });
}

function createSpine(project, onOpen) {
  const el = document.createElement("button");
  el.className = "spine";
  el.type = "button";
  el.setAttribute("aria-label", `Open “${project.title}” by ${project.author}`);
  Object.entries(spineStyle(project)).forEach(([k, v]) => el.style.setProperty(k, v));

  const title = document.createElement("span");
  title.className = "spine-title";
  title.textContent = project.title;

  const score = document.createElement("span");
  score.className = "spine-score";
  score.textContent = `${(project.up || 0) - (project.down || 0) >= 0 ? "+" : ""}${(project.up || 0) - (project.down || 0)}`;

  el.append(title, score);
  el.addEventListener("click", () => onOpen?.(project.id));
  return el;
}

function createAddSpine(onCreate) {
  const el = document.createElement("button");
  el.className = "spine spine--add";
  el.type = "button";
  el.style.setProperty("--spine-w", "44px");
  el.style.setProperty("--spine-h", "200px");
  el.setAttribute("aria-label", "Submit a new vibe-coded project");
  const plus = document.createElement("span");
  plus.className = "plus";
  plus.textContent = "+";
  el.appendChild(plus);
  el.addEventListener("click", () => onCreate?.());
  return el;
}
