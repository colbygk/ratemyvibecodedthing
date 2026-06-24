// Auth + submit modals, and the header session UI.
import { api } from "../lib/api.js";
import { toast } from "../lib/toast.js";

export function renderHeader(nav, session, handlers) {
  nav.innerHTML = "";
  if (session) {
    const hi = document.createElement("span");
    hi.className = "btn";
    hi.style.borderColor = "transparent";
    hi.textContent = `@${session.username}`;

    const submit = mkBtn("+ submit", "btn btn--accent", handlers.onCreate);
    const out = mkBtn("log out", "btn", () => { api.logout(); handlers.onSession(null); toast("Logged out"); });
    nav.append(hi, submit, out);
  } else {
    nav.append(
      mkBtn("log in", "btn", () => openAuth(handlers.modal, "login", handlers.onSession)),
      mkBtn("create account", "btn btn--accent", () => openAuth(handlers.modal, "signup", handlers.onSession))
    );
  }
}

function mkBtn(label, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

export function openAuth(overlay, mode, onSession) {
  const isSignup = mode === "signup";
  overlay.innerHTML = `
    <div class="modal" role="document">
      <h2>${isSignup ? "Create account" : "Welcome back"}</h2>
      <p class="hint">${isSignup ? "A username and a simple password is all you need." : "Log in to vote freely, leave notes, and follow makers."}</p>
      <form id="auth-form">
        <div class="field">
          <label for="u">Username</label>
          <input id="u" name="username" autocomplete="username" required minlength="2" />
        </div>
        <div class="field">
          <label for="p">Password</label>
          <input id="p" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="4" />
        </div>
        <button class="btn btn--accent" type="submit">${isSignup ? "Create account" : "Log in"}</button>
      </form>
      <p class="switch">
        ${isSignup ? "Already have an account?" : "New here?"}
        <button type="button" data-switch>${isSignup ? "Log in" : "Create one"}</button>
      </p>
      <button class="book-close" aria-label="Close" data-close>✕</button>
    </div>`;
  overlay.dataset.open = "true";

  const close = () => { overlay.dataset.open = "false"; overlay.innerHTML = ""; };
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("[data-switch]").addEventListener("click", () => openAuth(overlay, isSignup ? "login" : "signup", onSession));

  overlay.querySelector("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = fd.get("username").trim();
    const password = fd.get("password");
    try {
      const user = isSignup ? await api.signup(username, password) : await api.login(username, password);
      onSession(user);
      close();
      toast(isSignup ? `Welcome, @${username}` : `Logged in as @${username}`);
    } catch (err) {
      toast(err.message);
    }
  });
}

// Create (project=null) or edit (project provided) a project. Same form, both modes.
export function openProjectForm(overlay, { project = null, onSaved } = {}) {
  const editing = !!project;
  const link = editing ? (project.links?.[0]?.url || "") : "";
  const color = (editing && project.coverColor) || "#3a4a44";
  overlay.innerHTML = `
    <div class="modal" role="document">
      <h2>${editing ? "Edit your thing" : "Shelve a new thing"}</h2>
      <p class="hint">Tell us about the thing you vibe-coded. The project link becomes the spine's cover snapshot.</p>
      <form id="submit-form">
        <div class="field">
          <label for="t">Title</label>
          <input id="t" name="title" required maxlength="60" placeholder="What's it called?" value="${attr(editing ? project.title : "")}" />
        </div>
        <div class="field">
          <label for="d">Description</label>
          <textarea id="d" name="description" rows="3" maxlength="600" placeholder="How did the vibes go?">${esc(editing ? project.description : "")}</textarea>
        </div>
        <div class="field">
          <label for="l">Project link</label>
          <input id="l" name="link" type="url" placeholder="https://…" value="${attr(link)}" />
        </div>
        <div class="field">
          <label for="c">Spine color</label>
          <input id="c" name="coverColor" type="color" value="${attr(color)}" style="height:42px;padding:4px" />
        </div>
        <button class="btn btn--accent" type="submit">${editing ? "Save changes" : "Shelve it"}</button>
      </form>
      <button class="book-close" aria-label="Close" data-close>✕</button>
    </div>`;
  overlay.dataset.open = "true";

  const close = () => { overlay.dataset.open = "false"; overlay.innerHTML = ""; };
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#submit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const url = fd.get("link");
    const data = {
      title: fd.get("title").trim(),
      description: fd.get("description").trim(),
      coverColor: fd.get("coverColor"),
      links: url ? [{ label: "live demo", url }] : [],
    };
    try {
      const saved = editing ? await api.updateProject(project.id, data) : await api.createProject(data);
      close();
      toast(editing ? `“${saved.title}” updated` : `“${saved.title}” is on the shelf`);
      onSaved?.(saved);
    } catch (err) {
      toast(err.message);
    }
  });
}

const esc = (s = "") => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const attr = (s = "") => esc(s).replace(/"/g, "&quot;");
