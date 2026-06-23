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

export function openSubmit(overlay, onCreated) {
  overlay.innerHTML = `
    <div class="modal" role="document">
      <h2>Shelve a new thing</h2>
      <p class="hint">Tell us about the thing you vibe-coded. Links and media are optional.</p>
      <form id="submit-form">
        <div class="field">
          <label for="t">Title</label>
          <input id="t" name="title" required maxlength="60" placeholder="What's it called?" />
        </div>
        <div class="field">
          <label for="d">Description</label>
          <textarea id="d" name="description" rows="3" maxlength="600" placeholder="How did the vibes go?"></textarea>
        </div>
        <div class="field">
          <label for="l">Project link</label>
          <input id="l" name="link" type="url" placeholder="https://…" />
        </div>
        <div class="field">
          <label for="c">Spine color (optional)</label>
          <input id="c" name="coverColor" type="color" value="#3a4a44" style="height:42px;padding:4px" />
        </div>
        <p class="hint" style="margin:0 0 1rem">Image / video upload is wired to the backend (Cloudflare R2) — add files after the API is connected.</p>
        <button class="btn btn--accent" type="submit">Shelve it</button>
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
    const link = fd.get("link");
    try {
      const project = await api.createProject({
        title: fd.get("title").trim(),
        description: fd.get("description").trim(),
        coverColor: fd.get("coverColor"),
        links: link ? [{ label: "live demo", url: link }] : [],
      });
      close();
      toast(`“${project.title}” is on the shelf`);
      onCreated?.(project);
    } catch (err) {
      toast(err.message);
    }
  });
}
