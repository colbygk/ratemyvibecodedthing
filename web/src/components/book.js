// The opened-book overlay: spine "opens" into two pages.
// Left page = project info/links; right page = media + voting (+ notes when logged in).
import { api, mediaUrl } from "../lib/api.js";
import { toast } from "../lib/toast.js";

let circuits = null;
export function bindCircuits(c) { circuits = c; }

export async function openBook(overlay, id, { session, onAuthNeeded, onEdit, onVoted, onFollow } = {}) {
  const project = await api.getProject(id);
  if (!project) return;

  const score = (project.up || 0) - (project.down || 0);
  const loggedIn = !!session;
  const author = project.author || "";
  const isOwner = loggedIn && session.username?.toLowerCase() === author.toLowerCase();
  const canFollow = loggedIn && !isOwner;
  const follows = canFollow && (session.following || []).some((u) => u.toLowerCase() === author.toLowerCase());

  overlay.innerHTML = `
    <div class="book" role="document">
      <button class="book-close" aria-label="Close">✕</button>

      <section class="page page--left">
        <p class="byline">vibe-coded by ${escape(author)}${isOwner ? ` · <button class="link-btn" data-edit>✎ edit</button>` : ""}</p>
        ${canFollow
          ? `<div class="follow-row">
               <button class="follow-btn${follows ? " is-active" : ""}" data-follow>${follows ? "Following" : "Follow"}</button>
               <span class="follow-count" data-followers></span>
             </div>`
          : ""}
        <h2>${escape(project.title)}</h2>
        <p class="desc">${escape(project.description || "No description supplied.")}</p>
        ${renderLinks(project.links)}
      </section>

      <section class="page page--right">
        ${renderMedia(project.media)}
        ${isOwner
          ? `<div class="media-upload">
               <label class="link-btn" for="media-file">＋ add image / video</label>
               <input id="media-file" type="file" accept="image/*,video/*" hidden />
             </div>`
          : ""}
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
  overlay.querySelector("[data-edit]")?.addEventListener("click", () => { close(); onEdit?.(project); });

  const followBtn = overlay.querySelector("[data-follow]");
  if (followBtn) {
    const followersEl = overlay.querySelector("[data-followers]");
    let following = follows;
    const showCount = (n) => { if (followersEl) followersEl.textContent = `${n} follower${n === 1 ? "" : "s"}`; };
    api.graph(author).then((g) => showCount(g.followers)).catch(() => {});
    followBtn.addEventListener("click", async () => {
      followBtn.disabled = true;
      try {
        following ? await api.unfollow(author) : await api.follow(author);
        following = !following;
        followBtn.textContent = following ? "Following" : "Follow";
        followBtn.classList.toggle("is-active", following);
        // keep the session's following list in sync so counts/state persist
        const list = session.following || (session.following = []);
        const i = list.findIndex((u) => u.toLowerCase() === author.toLowerCase());
        if (following && i < 0) list.push(author);
        if (!following && i >= 0) list.splice(i, 1);
        onFollow?.(session);
        api.graph(author).then((g) => showCount(g.followers)).catch(() => {});
        toast(following ? `Following @${author}` : `Unfollowed @${author}`);
      } catch (err) {
        toast(err.message);
      } finally {
        followBtn.disabled = false;
      }
    });
  }

  const fileInput = overlay.querySelector("#media-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    toast("Uploading…");
    try {
      const res = await api.uploadMedia(id, file);
      overlay.querySelector(".media-grid").outerHTML = renderMedia(res.media);
      toast("Media added");
    } catch (err) {
      toast(err.message);
    } finally {
      fileInput.value = "";
    }
  });

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
          onVoted?.({ id, up: res.up, down: res.down });
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
        ? `<video src="${escape(mediaUrl(m.url))}" controls preload="metadata"></video>`
        : `<img src="${escape(mediaUrl(m.url))}" alt="${escape(m.alt || "project screenshot")}" loading="lazy" />`
    )
    .join("")}</div>`;
}

function escape(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
