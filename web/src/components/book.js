// The opened-book overlay: spine "opens" into two pages.
// Left page = project info/links; right page = media + voting (+ notes when logged in).
import { api, mediaUrl } from "../lib/api.js";
import { maxMediaFor } from "../lib/limits.js";
import { openLightbox } from "./lightbox.js";
import { toast } from "../lib/toast.js";

const ROLE_RANK = { user: 0, moderator: 1, super_admin: 2 };
const atLeast = (role, min) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);

let circuits = null;
export function bindCircuits(c) { circuits = c; }

export async function openBook(overlay, id, { session, onAuthNeeded, onEdit, onVoted, onFollow, onModerated, onOpenProfile, onPublish } = {}) {
  const project = await api.getProject(id);
  if (!project) return;

  const score = (project.up || 0) - (project.down || 0);
  const loggedIn = !!session;
  const author = project.author || "";
  const isOwner = loggedIn && session.username?.toLowerCase() === author.toLowerCase();
  const canFollow = loggedIn && !isOwner;
  const follows = canFollow && (session.following || []).some((u) => u.toLowerCase() === author.toLowerCase());
  // RBAC (ADR-0006): moderators can hide/unhide projects and remove notes. Role
  // and trust are managed on the user's profile, not here.
  const canModerate = loggedIn && atLeast(session.role, "moderator");
  const maxMedia = maxMediaFor(session?.trust); // trust-graduated cap (ADR-0005)
  const mediaCount = project.media?.length || 0;

  overlay.innerHTML = `
    <div class="book" role="document">
      <button class="book-close" aria-label="Close">✕</button>

      <section class="page page--left">
        <p class="byline">vibe-coded by ${userLink(author)}${isOwner ? ` · <span data-owner-actions><button class="link-btn" data-edit>✎ edit</button> · <button class="link-btn" data-publish>＋ new version</button></span>` : ""}</p>
        ${canFollow
          ? `<div class="follow-row">
               <button class="follow-btn${follows ? " is-active" : ""}" data-follow>${follows ? "Following" : "Follow"}</button>
               <span class="follow-count" data-followers></span>
             </div>`
          : ""}
        ${canModerate ? renderModBar(project) : ""}
        <div class="version-nav" data-vnav hidden>
          <button class="vnav-btn" data-vprev aria-label="Older version" title="Older version">←</button>
          <span class="vnav-label" data-vlabel></span>
          <button class="vnav-btn" data-vnext aria-label="Newer version" title="Newer version">→</button>
        </div>
        <h2><span class="book-title" data-title>${escape(project.title)}</span><span class="hidden-badge" data-hidden-badge${project.hidden ? "" : " hidden"}>hidden</span></h2>
        <p class="version-changelog" data-vchangelog hidden></p>
        <p class="desc" data-desc>${escape(project.description || "No description supplied.")}</p>
        <div class="links" data-links>${renderLinksInner(project.links)}</div>
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
  // Click a thumbnail → view it full-size. Delegated so it survives the media
  // grid being re-rendered after an upload.
  overlay.addEventListener("click", (e) => {
    const img = e.target.closest(".media-grid img");
    if (img) openLightbox(img.src, { alt: img.alt });
  });
  overlay.querySelector("[data-auth]")?.addEventListener("click", (e) => { e.preventDefault(); close(); onAuthNeeded?.(); });
  overlay.querySelector("[data-edit]")?.addEventListener("click", () => { close(); onEdit?.(project); });
  overlay.querySelector("[data-publish]")?.addEventListener("click", () => { close(); onPublish?.(project); });
  // Click a username (byline or a note author) → open that user's profile.
  overlay.addEventListener("click", (e) => {
    const u = e.target.closest(".user-link")?.dataset.user;
    if (u) { close(); onOpenProfile?.(u); }
  });

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
          ${userLink(n.username, "note-who")}
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

  if (canModerate) wireModBar(overlay, id, project, onModerated);

  // ---- documentation versions (ADR-0007): flip back through prior versions ----
  let viewV = project.version || 1;
  let vmeta = []; // [{ v, created, changelog, current }]
  const ownerActions = overlay.querySelector("[data-owner-actions]");
  const mediaUpload = overlay.querySelector(".media-upload");
  const mediaCountEl = overlay.querySelector(".media-count");

  function renderNav() {
    const nav = overlay.querySelector("[data-vnav]");
    if (!nav) return;
    if (vmeta.length <= 1) { nav.hidden = true; return; }
    const vs = vmeta.map((x) => x.v);
    const maxV = Math.max(...vs), minV = Math.min(...vs);
    nav.hidden = false;
    // Attach the status to the version being VIEWED (avoids "of 2 · older" being
    // misread as "v2 is older"); name the latest explicitly when on an old one.
    overlay.querySelector("[data-vlabel]").textContent =
      viewV === maxV ? `v${viewV} · latest` : `v${viewV} · older (latest is v${maxV})`;
    // ← steps to an older (lower) version, → to a newer (higher) one.
    overlay.querySelector("[data-vprev]").disabled = viewV <= minV;
    overlay.querySelector("[data-vnext]").disabled = viewV >= maxV;
  }

  async function showVersion(v) {
    const isCur = v === (project.version || 1);
    const doc = isCur
      ? { title: project.title, description: project.description, links: project.links, media: project.media, changelog: project.changelog }
      : await api.getVersion(id, v).catch(() => null);
    if (!doc) return;
    viewV = v;
    overlay.querySelector("[data-title]").textContent = doc.title || "";
    overlay.querySelector("[data-desc]").textContent = doc.description || "No description supplied.";
    overlay.querySelector("[data-links]").innerHTML = renderLinksInner(doc.links);
    overlay.querySelector(".media-grid").outerHTML = renderMedia(doc.media);
    const cl = overlay.querySelector("[data-vchangelog]");
    const text = vmeta.find((x) => x.v === v)?.changelog || doc.changelog || "";
    cl.textContent = text ? `“${text}”` : "";
    cl.hidden = !text;
    // owner controls only act on the current version
    if (ownerActions) ownerActions.hidden = !isCur;
    if (mediaUpload) mediaUpload.hidden = !isCur || (doc.media?.length || 0) >= maxMedia;
    renderNav();
  }

  overlay.querySelector("[data-vprev]")?.addEventListener("click", () => {
    const older = Math.max(...vmeta.map((x) => x.v).filter((v) => v < viewV));
    if (Number.isFinite(older)) showVersion(older);
  });
  overlay.querySelector("[data-vnext]")?.addEventListener("click", () => {
    const newer = Math.min(...vmeta.map((x) => x.v).filter((v) => v > viewV));
    if (Number.isFinite(newer)) showVersion(newer);
  });
  api.listVersions(id).then((r) => { vmeta = r.versions || []; renderNav(); }).catch(() => {});

  const fileInput = overlay.querySelector("#media-file");
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    toast("Uploading…");
    try {
      const res = await api.uploadMedia(id, file);
      project.media = res.media; // keep current-version media in sync for flipping
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

// Moderator toolbar (ADR-0006): hide/unhide this project. Role/trust are managed
// on the user's profile (openProfile), not per project.
function renderModBar(project) {
  return `<div class="mod-bar" data-mod-bar>
    <span class="mod-tag">mod</span>
    <button class="link-btn" data-hide-toggle>${project.hidden ? "unhide" : "hide"} project</button>
  </div>`;
}

function wireModBar(overlay, id, project, onModerated) {
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
}

// A clickable username that opens the user's profile (handler is delegated).
function userLink(name, extra = "") {
  const cls = `user-link${extra ? " " + extra : ""}`;
  return `<button class="${cls}" data-user="${escape(name)}">@${escape(name)}</button>`;
}

// Inner <a> list for the links container (so a version flip can swap it in place).
function renderLinksInner(links) {
  return (links || [])
    .map((l) => `<a href="${escape(l.url)}" target="_blank" rel="noopener noreferrer">↗ ${escape(l.label || l.url)}</a>`)
    .join("");
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
