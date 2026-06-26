// User profile modal — opened by clicking a username anywhere (book byline, a
// note author, the header). Shows identity, bio, GitHub + social links, follow,
// and follower/following counts. You can edit your OWN profile here. Moderators
// additionally see role/trust, and super_admins can edit them (ADR-0006).
import { api } from "../lib/api.js";
import { toast } from "../lib/toast.js";

const ROLE_RANK = { user: 0, moderator: 1, super_admin: 2 };
const atLeast = (role, min) => (ROLE_RANK[role] || 0) >= (ROLE_RANK[min] || 0);
const ROLE_LABEL = { moderator: "moderator", super_admin: "super admin" };

export function openProfile(overlay, username, { session = null, onSession } = {}) {
  const isSelf = !!session && session.username?.toLowerCase() === username.toLowerCase();
  const canFollow = !!session && !isSelf;
  const canViewAdmin = !!session && atLeast(session.role, "moderator");
  const isSuperAdmin = !!session && atLeast(session.role, "super_admin");

  let following = canFollow && (session.following || []).some((u) => u.toLowerCase() === username.toLowerCase());
  let mode = "view";
  // start with whatever we already know (self → from session), filled in by loads
  const profile = {
    bio: isSelf ? (session.bio || "") : "",
    github: isSelf ? (session.github || "") : "",
    links: isSelf ? (session.links || []) : [],
    followers: null, following: null,
    role: undefined, trust: undefined,
  };

  const close = () => { overlay.dataset.open = "false"; overlay.innerHTML = ""; };

  function render() {
    overlay.innerHTML = mode === "edit" ? editHTML() : viewHTML();
    overlay.dataset.open = "true";
    wire();
  }

  function viewHTML() {
    const badge = (canViewAdmin && ROLE_LABEL[profile.role]) ? ` <span class="role-badge">${ROLE_LABEL[profile.role]}</span>` : "";
    const gh = profile.github
      ? `<a class="profile-link" href="https://github.com/${esc(profile.github)}" target="_blank" rel="noopener noreferrer">↗ GitHub @${esc(profile.github)}</a>`
      : "";
    const socials = (profile.links || [])
      .map((l) => `<a class="profile-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">↗ ${esc(l.label || l.url)}</a>`)
      .join("");
    const stats = `${profile.following ?? "…"} following · ${profile.followers ?? "…"} followers`;
    return `
      <div class="modal profile" role="document">
        <button class="book-close" aria-label="Close" data-close>✕</button>
        <h2 class="profile-name">@${esc(username)}${badge}</h2>
        <p class="profile-stats hint" data-stats>${stats}</p>
        ${profile.bio ? `<p class="profile-bio">${esc(profile.bio)}</p>` : ""}
        ${gh || socials ? `<div class="profile-links">${gh}${socials}</div>` : ""}
        ${canFollow ? `<button class="btn btn--accent profile-follow${following ? " is-active" : ""}" data-follow>${following ? "Following" : "Follow"}</button>` : ""}
        ${isSelf ? `<button class="link-btn profile-edit-btn" data-edit-profile>✎ edit profile</button>` : ""}
        ${isSuperAdmin ? adminHTML() : ""}
      </div>`;
  }

  function adminHTML() {
    return `
      <div class="profile-admin" data-admin${profile.role === undefined ? " hidden" : ""}>
        <h3 class="profile-admin-title">Moderation</h3>
        <div class="field">
          <label for="pr-role">Role</label>
          <select id="pr-role" data-role>
            <option value="user">user</option>
            <option value="moderator">moderator</option>
            <option value="super_admin">super admin</option>
          </select>
        </div>
        <div class="field">
          <label for="pr-trust">Trust score <span class="hint">unlocks higher upload tiers</span></label>
          <input id="pr-trust" type="number" min="0" max="100" step="1" data-trust value="${profile.trust ?? 1}" />
        </div>
        <button class="btn btn--accent" data-save-admin>Save changes</button>
      </div>`;
  }

  function editHTML() {
    const links = profile.links || [];
    const rows = Math.max(3, links.length);
    let rowsHtml = "";
    for (let i = 0; i < rows; i++) {
      const l = links[i] || {};
      rowsHtml += `<div class="link-row">
        <input data-link-label maxlength="40" placeholder="label (e.g. Mastodon)" value="${attr(l.label || "")}" />
        <input data-link-url type="url" maxlength="300" placeholder="https://…" value="${attr(l.url || "")}" />
      </div>`;
    }
    return `
      <div class="modal profile" role="document">
        <button class="book-close" aria-label="Close" data-close>✕</button>
        <h2>Edit profile</h2>
        <div class="field">
          <label for="pf-bio">Bio</label>
          <textarea id="pf-bio" data-bio rows="3" maxlength="280" placeholder="A line about you">${esc(profile.bio || "")}</textarea>
        </div>
        <div class="field">
          <label for="pf-gh">GitHub username</label>
          <input id="pf-gh" data-github maxlength="100" placeholder="e.g. octocat" value="${attr(profile.github || "")}" />
        </div>
        <label class="profile-links-label">Social / links</label>
        ${rowsHtml}
        <button class="btn btn--accent" data-save-profile>Save profile</button>
        <button class="link-btn profile-cancel" data-cancel>cancel</button>
      </div>`;
  }

  function wire() {
    overlay.querySelector("[data-close]").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    if (mode === "edit") {
      overlay.querySelector("[data-cancel]").addEventListener("click", () => { mode = "view"; render(); });
      overlay.querySelector("[data-save-profile]").addEventListener("click", saveProfile);
      return;
    }

    // follow toggle (in-place, no re-render)
    const followBtn = overlay.querySelector("[data-follow]");
    followBtn?.addEventListener("click", async () => {
      followBtn.disabled = true;
      try {
        following ? await api.unfollow(username) : await api.follow(username);
        following = !following;
        followBtn.textContent = following ? "Following" : "Follow";
        followBtn.classList.toggle("is-active", following);
        const list = session.following || (session.following = []);
        const idx = list.findIndex((u) => u.toLowerCase() === username.toLowerCase());
        if (following && idx < 0) list.push(username);
        if (!following && idx >= 0) list.splice(idx, 1);
        onSession?.(session);
        loadGraph();
        toast(following ? `Following @${username}` : `Unfollowed @${username}`);
      } catch (err) { toast(err.message); }
      finally { followBtn.disabled = false; }
    });

    overlay.querySelector("[data-edit-profile]")?.addEventListener("click", () => { mode = "edit"; render(); });

    const roleSel = overlay.querySelector("[data-role]");
    if (roleSel && profile.role) roleSel.value = profile.role;
    overlay.querySelector("[data-save-admin]")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await api.setRole(username, roleSel.value);
        const tr = await api.setTrust(username, Number(overlay.querySelector("[data-trust]").value));
        profile.role = r.role; profile.trust = tr.trust;
        toast(`Saved — @${username} is ${r.role}, trust ${tr.trust}`);
      } catch (err) { toast(err.message); }
      finally { btn.disabled = false; }
    });
  }

  async function saveProfile(e) {
    const btn = e.currentTarget;
    const bio = overlay.querySelector("[data-bio]").value;
    const github = overlay.querySelector("[data-github]").value;
    const labels = [...overlay.querySelectorAll("[data-link-label]")];
    const links = [...overlay.querySelectorAll("[data-link-url]")]
      .map((u, i) => ({ label: labels[i].value.trim(), url: u.value.trim() }))
      .filter((l) => l.url);
    btn.disabled = true;
    try {
      const u = await api.updateMe({ bio, github, links });
      profile.bio = u.bio; profile.github = u.github; profile.links = u.links || [];
      if (session) { Object.assign(session, { bio: u.bio, github: u.github, links: u.links || [] }); onSession?.(session); }
      mode = "view";
      render();
      toast("Profile saved");
    } catch (err) { toast(err.message); btn.disabled = false; }
  }

  function loadGraph() {
    api.graph(username).then((g) => {
      profile.followers = g.followers; profile.following = g.following;
      if (!isSelf) { profile.bio = g.bio || ""; profile.github = g.github || ""; profile.links = g.links || []; }
      if (mode === "view") render();
    }).catch(() => {});
  }

  render();
  loadGraph();
  if (canViewAdmin) {
    api.userAdmin(username).then((a) => {
      profile.role = a.role; profile.trust = a.trust;
      if (mode === "view") render();
    }).catch(() => {});
  }

  return { close };
}

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attr = (s = "") => esc(s);
