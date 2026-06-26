// The opened-book overlay: spine "opens" into two pages.
// Left page = project info/links; right page = media + voting (+ notes when logged in).
import { api, mediaUrl } from "../lib/api.js";
import { maxMediaFor } from "../lib/limits.js";
import { toast } from "../lib/toast.js";

const ROLE_RANK = { user: 0, moderator: 1, super_admin: 2 };
const atLeast = (role, min) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);

let circuits = null;
export function bindCircuits(c) { circuits = c; }

export async function openBook(overlay, id, { session, onAuthNeeded, onEdit, onVoted, onFollow, onModerated } = {}) {
  const project = await api.getProject(id);
  if (!project) return;

  const score = (project.up || 0) - (project.down || 0);
  const loggedIn = !!session;
  const author = project.author || "";
  const isOwner = loggedIn && session.username?.toLowerCase() === author.toLowerCase();
  const canFollow = loggedIn && !isOwner;
  const follows = canFollow && (session.following || []).some((u) => u.toLowerCase() === author.toLowerCase());
  // RBAC (ADR-0006): moderators can hide/unhide and remove notes; super_admins
  // can additionally set the author's role/trust.
  const canModerate = loggedIn && atLeast(session.role, "moderator");
  const isSuperAdmin = loggedIn && atLeast(session.role, "super_admin");
  const maxMedia = maxMediaFor(session?.trust); // trust-graduated cap (ADR-0005)
  const mediaCount = project.media?.length || 0;

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
        ${canModerate ? renderModBar(project, isSuperAdmin, author) : ""}
        <h2>${escape(project.title)}${project.hidden ? ` <span class="hidden-badge" data-hidden-badge>hidden</span>` : `<span class="hidden-badge" data-hidden-badge hidden>hidden</span>`}</h2>
        <p class="desc">${escape(project.description || "No description supplied.")}</p>
        ${renderLinks(project.links)}
      </section>

      <section class="page page--right">
        ${renderMedia(project.media)}
        ${isOwner
          ? `<div class="media-upload"${mediaCount >= maxMedia ? " hidden" : ""}>
               <label class="link-btn" for="media-file">＋ add image / video</label>
               <span class="media-count">${mediaCount} / ${maxMedia}</span>
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
        <div class="notes" data-notes hidden></div>
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

  // Notes left on this project (public read path — ADR-0003). Render under votes.
  // Moderators get a per-note remove control (ADR-0006).
  const notesEl = overlay.querySelector("[data-notes]");
  const renderNotes = (notes) => {
    if (!notesEl) return;
    if (!notes?.length) { notesEl.hidden = true; notesEl.innerHTML = ""; return; }
    notesEl.hidden = false;
    notesEl.innerHTML = `<h3 class="notes-title">Notes</h3>${notes
      .map((n) => `<div class="note-item">
          <span class="note-who">@${escape(n.username)}</span>
          <span class="note-text">${escape(n.note)}</span>
          ${canModerate ? `<button class="note-remove" title="Remove note" data-remove-note="${escape(n.username)}">✕</button>` : ""}
        </div>`)
      .join("")}`;
  };
  api.notes(id).then((r) => renderNotes(r.notes)).catch(() => {});
  notesEl?.addEventListener("click", async (e) => {
    const who = e.target.closest("[data-remove-note]")?.dataset.removeNote;
    if (!who) return;
    try {
      await api.removeNote(id, who);
      const r = await api.notes(id);
      renderNotes(r.notes);
      toast(`Removed @${who}'s note`);
    } catch (err) { toast(err.message); }
  });

  if (canModerate) wireModBar(overlay, id, project, isSuperAdmin, author, onModerated);

  const mediaUpload = overlay.querySelector(".media-upload");
  const mediaCountEl = overlay.querySelector(".media-count");
  const fileInput = overlay.querySelector("#media-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    toast("Uploading…");
    try {
      const res = await api.uploadMedia(id, file);
      overlay.querySelector(".media-grid").outerHTML = renderMedia(res.media);
      if (mediaCountEl) mediaCountEl.textContent = `${res.media.length} / ${maxMedia}`;
      if (res.media.length >= maxMedia && mediaUpload) mediaUpload.hidden = true;
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
          if (note) api.notes(id).then((r) => renderNotes(r.notes)).catch(() => {});
          onVoted?.({ id, up: res.up, down: res.down });
        }
      } catch (err) {
        toast(err.message);
      }
    })
  );
}

// Moderator toolbar (ADR-0006): hide/unhide this project, and — for super_admins —
// adjust the author's role and trust (the latter unlocks higher upload tiers).
function renderModBar(project, isSuperAdmin, author) {
  return `<div class="mod-bar" data-mod-bar>
    <span class="mod-tag">mod</span>
    <button class="link-btn" data-hide-toggle>${project.hidden ? "unhide" : "hide"} project</button>
    ${isSuperAdmin
      ? `<span class="mod-admin" data-mod-admin hidden>
           <label>role
             <select data-role>
               <option value="user">user</option>
               <option value="moderator">moderator</option>
               <option value="super_admin">super_admin</option>
             </select>
           </label>
           <label>trust <input type="number" min="0" max="100" step="1" data-trust style="width:3.5rem" /></label>
         </span>`
      : ""}
  </div>`;
}

function wireModBar(overlay, id, project, isSuperAdmin, author, onModerated) {
  let hidden = !!project.hidden;
  const badge = overlay.querySelector("[data-hidden-badge]");
  const hideBtn = overlay.querySelector("[data-hide-toggle]");
  hideBtn?.addEventListener("click", async () => {
    hideBtn.disabled = true;
    try {
      await api.hideProject(id, !hidden);
      hidden = !hidden;
      hideBtn.textContent = `${hidden ? "unhide" : "hide"} project`;
      if (badge) badge.hidden = !hidden;
      toast(hidden ? "Project hidden from the shelf" : "Project restored to the shelf");
      onModerated?.();
    } catch (err) { toast(err.message); }
    finally { hideBtn.disabled = false; }
  });

  if (!isSuperAdmin) return;
  const adminEl = overlay.querySelector("[data-mod-admin]");
  const roleSel = overlay.querySelector("[data-role]");
  const trustInp = overlay.querySelector("[data-trust]");
  // Load the author's current role/trust, then reveal the controls.
  api.userAdmin(author).then((a) => {
    if (roleSel) roleSel.value = a.role;
    if (trustInp) trustInp.value = a.trust;
    if (adminEl) adminEl.hidden = false;
  }).catch(() => {});
  roleSel?.addEventListener("change", async () => {
    try { const r = await api.setRole(author, roleSel.value); toast(`@${author} is now ${r.role}`); }
    catch (err) { toast(err.message); }
  });
  trustInp?.addEventListener("change", async () => {
    try { const r = await api.setTrust(author, Number(trustInp.value)); toast(`@${author} trust set to ${r.trust}`); }
    catch (err) { toast(err.message); }
  });
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
