// User profile modal — opened by clicking a username anywhere (book byline, a
// note author, the header). Shows identity + follow + follower/following counts;
// moderators additionally see the user's role/trust, and super_admins can edit
// them here (ADR-0006) — this is where role/trust live, not on every project.
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

  overlay.innerHTML = `
    <div class="modal profile" role="document">
      <button class="book-close" aria-label="Close" data-close>✕</button>
      <h2 class="profile-name">@${esc(username)} <span class="role-badge" data-role-badge hidden></span></h2>
      <p class="profile-stats hint" data-stats>loading…</p>
      ${canFollow ? `<button class="btn btn--accent profile-follow${following ? " is-active" : ""}" data-follow>${following ? "Following" : "Follow"}</button>` : ""}
      ${isSuperAdmin
        ? `<div class="profile-admin" data-admin hidden>
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
               <input id="pr-trust" type="number" min="0" max="100" step="1" data-trust />
             </div>
             <button class="btn btn--accent" data-save-admin>Save changes</button>
           </div>`
        : ""}
    </div>`;
  overlay.dataset.open = "true";

  const close = () => { overlay.dataset.open = "false"; overlay.innerHTML = ""; };
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  const statsEl = overlay.querySelector("[data-stats]");
  const showStats = (g) => { if (statsEl) statsEl.textContent = `${g.following} following · ${g.followers} followers`; };
  api.graph(username).then(showStats).catch(() => { if (statsEl) statsEl.textContent = ""; });

  const badge = overlay.querySelector("[data-role-badge]");
  const showBadge = (role) => {
    if (!badge) return;
    if (ROLE_LABEL[role]) { badge.textContent = ROLE_LABEL[role]; badge.hidden = false; }
    else badge.hidden = true;
  };

  const followBtn = overlay.querySelector("[data-follow]");
  followBtn?.addEventListener("click", async () => {
    followBtn.disabled = true;
    try {
      following ? await api.unfollow(username) : await api.follow(username);
      following = !following;
      followBtn.textContent = following ? "Following" : "Follow";
      followBtn.classList.toggle("is-active", following);
      const list = session.following || (session.following = []);
      const i = list.findIndex((u) => u.toLowerCase() === username.toLowerCase());
      if (following && i < 0) list.push(username);
      if (!following && i >= 0) list.splice(i, 1);
      onSession?.(session);
      api.graph(username).then(showStats).catch(() => {});
      toast(following ? `Following @${username}` : `Unfollowed @${username}`);
    } catch (err) { toast(err.message); }
    finally { followBtn.disabled = false; }
  });

  // Moderators can see role/trust; super_admins get the editable controls.
  if (canViewAdmin) {
    api.userAdmin(username).then((a) => {
      showBadge(a.role);
      const adminEl = overlay.querySelector("[data-admin]");
      const roleSel = overlay.querySelector("[data-role]");
      const trustInp = overlay.querySelector("[data-trust]");
      if (roleSel) roleSel.value = a.role;
      if (trustInp) trustInp.value = a.trust;
      if (adminEl) adminEl.hidden = false;
    }).catch(() => {});
  }

  overlay.querySelector("[data-save-admin]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const roleSel = overlay.querySelector("[data-role]");
    const trustInp = overlay.querySelector("[data-trust]");
    btn.disabled = true;
    try {
      const r = await api.setRole(username, roleSel.value);
      const t = await api.setTrust(username, Number(trustInp.value));
      showBadge(r.role);
      toast(`Saved — @${username} is ${r.role}, trust ${t.trust}`);
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; }
  });

  return { close };
}

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
