import "./styles/main.css";
import { api, MOCK_MODE } from "./lib/api.js";
import { initCircuits } from "./components/circuits.js";
import { renderShelves } from "./components/shelf.js";
import { openBook, bindCircuits } from "./components/book.js";
import { renderHeader, openAuth, openSubmit } from "./components/auth.js";
import { toast } from "./lib/toast.js";

const els = {
  shelves: document.getElementById("shelves"),
  nav: document.getElementById("header-actions"),
  book: document.getElementById("book-overlay"),
  modal: document.getElementById("modal-overlay"),
  canvas: document.getElementById("circuits"),
};

const state = { session: null, projects: [] };

// ---- circuit background ----
const circuits = initCircuits(els.canvas);
bindCircuits(circuits);

// ---- render helpers ----
function paintShelves() {
  renderShelves(els.shelves, state.projects, {
    showCreate: !!state.session,
    onOpen: (id) => openBook(els.book, id, { session: state.session, onAuthNeeded: () => openAuth(els.modal, "signup", setSession) }),
    onCreate: () => openSubmit(els.modal, onCreated),
  });
}

function paintHeader() {
  renderHeader(els.nav, state.session, {
    modal: els.modal,
    onSession: setSession,
    onCreate: () => openSubmit(els.modal, onCreated),
  });
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
    toast("Couldn't load the shelves");
    state.projects = [];
  }
  paintShelves();

  if (MOCK_MODE) {
    console.info("%c[mock mode] No VITE_API_BASE set — using local sample data.", "color:#4ee6c8");
  }
}

boot();
