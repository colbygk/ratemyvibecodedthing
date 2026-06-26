import "./styles/main.css";
import { api, MOCK_MODE } from "./lib/api.js";
import { initCircuits } from "./components/circuits.js";
import { renderShelves } from "./components/shelf.js";
import { openBook, bindCircuits } from "./components/book.js";
import { renderHeader, openAuth, openProjectForm } from "./components/auth.js";
import { openProfile } from "./components/profile.js";
import { toast } from "./lib/toast.js";

const els = {
  shelves: document.getElementById("shelves"),
  nav: document.getElementById("header-actions"),
  book: document.getElementById("book-overlay"),
  modal: document.getElementById("modal-overlay"),
  canvas: document.getElementById("circuits"),
};

const state = { session: null, projects: [] };

// ---- circuit background (decorative; must never break the app) ----
try {
  bindCircuits(initCircuits(els.canvas));
} catch (err) {
  console.warn("circuit background disabled:", err);
}

// ---- render helpers ----
function paintShelves() {
  renderShelves(els.shelves, state.projects, {
    showCreate: !!state.session,
    onOpen: (id) => openBook(els.book, id, {
      session: state.session,
      onAuthNeeded: () => openAuth(els.modal, "signup", setSession),
      onEdit: (project) => openProjectForm(els.modal, { project, session: state.session, onSaved: onUpdated }),
      onPublish: (project) => openProjectForm(els.modal, { project, session: state.session, mode: "version", onSaved: onUpdated }),
      onVoted,
      onFollow: (session) => { state.session = session; paintHeader(); },
      onModerated: reloadProjects,
      onOpenProfile: showProfile,
    }),
    onCreate: () => openProjectForm(els.modal, { session: state.session, onSaved: onCreated }),
  });
}

function paintHeader() {
  renderHeader(els.nav, state.session, {
    modal: els.modal,
    onSession: setSession,
    onCreate: () => openProjectForm(els.modal, { session: state.session, onSaved: onCreated }),
    onOpenProfile: showProfile,
  });
}

// Open a user's profile (identity + follow + counts; role/trust for moderators).
function showProfile(username) {
  openProfile(els.modal, username, {
    session: state.session,
    onSession: (s) => { state.session = s; paintHeader(); },
  });
}

// Re-fetch the shelf from the server (e.g. after a moderator hides a project, so
// it drops off — or unhides one elsewhere).
async function reloadProjects() {
  try {
    state.projects = await api.listProjects();
    paintShelves();
  } catch (err) { toast(err.message || "Couldn't refresh the shelves"); }
}

function setSession(user) {
  state.session = user;
  paintHeader();
  paintShelves(); // create-spine visibility depends on session
}

function onCreated(project) {
  state.projects.unshift(project);
  paintShelves();
}

function onUpdated(project) {
  const i = state.projects.findIndex((p) => p.id === project.id);
  if (i >= 0) state.projects[i] = project; else state.projects.unshift(project);
  paintShelves();
}

// After a vote: reflect the new tally on the shelf and re-sort by upvotes
// (the server orders the shelf the same way), so the spine isn't stale.
function onVoted({ id, up, down }) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  p.up = up;
  p.down = down;
  state.projects.sort((a, b) => (b.up || 0) - (a.up || 0));
  paintShelves();
}

// ---- boot ----
async function boot() {
  paintHeader();
  try {
    state.session = await api.me();
  } catch { /* anon */ }
  paintHeader();

  try {
    state.projects = await api.listProjects();
  } catch (err) {
    // Surface the server's reason (e.g. a daily-limit 429) rather than a generic line.
    toast(err.message || "Couldn't load the shelves");
    state.projects = [];
  }
  paintShelves();

  if (MOCK_MODE) {
    console.info("%c[mock mode] No VITE_API_BASE set — using local sample data.", "color:#4ee6c8");
  }
}

boot();
