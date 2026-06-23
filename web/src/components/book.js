// The opened-book overlay: spine "opens" into two pages.
// Left page = project info/links; right page = media + voting (+ notes when logged in).
import { api } from "../lib/api.js";
import { toast } from "../lib/toast.js";

let circuits = null;
export function bindCircuits(c) { circuits = c; }

export async function openBook(overlay, id, { session, onAuthNeeded } = {}) {
  const project = await api.getProject(id);
  if (!project) return;

  const score = (project.up || 0) - (project.down || 0);
  const loggedIn = !!session;

  overlay.innerHTML = `
    <div class="book" role="document">
      <button class="book-close" aria-label="Close">✕</button>

      <section class="page page--left">
        <p class="byline">vibe-coded by ${escape(project.author)}</p>
        <h2>${escape(project.title)}</h2>
        <p class="desc">${escape(project.description || "No description supplied.")}</p>
        ${renderLinks(project.links)}
      </section>

      <section class="page page--right">
        ${renderMedia(project.media)}
        <div class="vote-block">
          <div class="vote-row">
            <button class="vote-btn" data-dir="up" aria-label="Upvote">▲ <span class="up">${project.up || 0}</span></button>
            <button class="vote-btn" data-dir="down" aria-label="Downvote">▼ <span class="down">${project.down || 0}</span></button>
            <span class="vote-tally" title="net score">${score >= 0 ? "+" : ""}${score}</span>
          </div>
          ${loggedIn
            ? `<div class="note-field">
                 <label class="sr-only" for="note">Your note</label>
                 <textarea id="note" placeholder="Add a free-form note about these vibes…"></textarea>
               </div>`
            : `<p class="note-locked">One vote per visitor. <a href="#" data-auth>Create an account</a> to vote more and leave notes.</p>`}
        </div>
      </section>
    </div>`;

  overlay.dataset.open = "true";
  circuits?.pause();

  const close = () => {
    overlay.dataset.open = "false";
    overlay.innerHTML = "";
    circuits?.resume();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  document.addEventListener("keydown", onKey);

  overlay.querySelector(".book-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-auth]")?.addEventListener("click", (e) => { e.preventDefault(); close(); onAuthNeeded?.(); });

  overlay.querySelectorAll(".vote-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const dir = btn.dataset.dir;
      const note = overlay.querySelector("#note")?.value?.trim() || undefined;
      try {
        const res = await api.vote(id, dir, note);
        if (res) {
          overlay.querySelector(".up").textContent = res.up;
          overlay.querySelector(".down").textContent = res.down;
          const net = res.up - res.down;
          overlay.querySelector(".vote-tally").textContent = `${net >= 0 ? "+" : ""}${net}`;
          btn.classList.add("is-active");
          toast(note ? "Vote + note recorded" : "Vote recorded");
        }
      } catch (err) {
        toast(err.message);
      }
    })
  );
}

function renderLinks(links) {
  if (!links?.length) return "";
  return `<div class="links">${links
    .map((l) => `<a href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">↗ ${escape(l.label || l.url)}</a>`)
    .join("")}</div>`;
}

function renderMedia(media) {
  if (!media?.length) {
    return `<div class="media-grid" aria-hidden="true" style="opacity:.5"><div style="aspect-ratio:4/3;border:1px dashed var(--paper-shadow);border-radius:4px;display:grid;place-items:center;font-family:var(--font-mono);font-size:.7rem;color:var(--paper-ink-soft)">no media</div></div>`;
  }
  return `<div class="media-grid">${media
    .map((m) =>
      m.type === "video"
        ? `<video src="${escape(m.url)}" controls preload="metadata"></video>`
        : `<img src="${escape(m.url)}" alt="${escape(m.alt || "project screenshot")}" loading="lazy" />`
    )
    .join("")}</div>`;
}

function escape(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
