// API client. Talks to the Cloudflare Worker when VITE_API_BASE is set;
// otherwise runs in "mock mode" so the frontend is fully demoable offline.

import { MOCK_PROJECTS } from "./mock.js";

const BASE = import.meta.env.VITE_API_BASE || "";
export const MOCK_MODE = !BASE;

const TOKEN_KEY = "rmvct_token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function req(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- In-memory mock store (per page load) ---------- */
const mockStore = structuredClone(MOCK_PROJECTS);
let mockSession = null;
const mockVoted = new Set();

export const api = {
  /* --- projects --- */
  async listProjects() {
    if (MOCK_MODE) return structuredClone(mockStore);
    return req("/projects");
  },
  async getProject(id) {
    if (MOCK_MODE) return structuredClone(mockStore.find((p) => p.id === id));
    return req(`/projects/${id}`);
  },
  async createProject(data) {
    if (MOCK_MODE) {
      const p = { id: `mock-new-${mockStore.length}`, author: mockSession?.username || "you", up: 0, down: 0, media: [], links: [], ...data };
      mockStore.unshift(p);
      return p;
    }
    return req("/projects", { method: "POST", body: data, auth: true });
  },
  async updateProject(id, data) {
    if (MOCK_MODE) {
      const p = mockStore.find((x) => x.id === id);
      if (!p) throw new Error("Not found");
      Object.assign(p, data);
      return structuredClone(p);
    }
    return req(`/projects/${id}`, { method: "PATCH", body: data, auth: true });
  },

  /* --- media (R2): POST the raw file as the body; type drives image vs video --- */
  async uploadMedia(id, file) {
    if (MOCK_MODE) {
      const p = mockStore.find((x) => x.id === id);
      if (!p) throw new Error("Not found");
      const kind = (file.type || "").startsWith("video/") ? "video" : "image";
      p.media = p.media || [];
      p.media.push({ type: kind, url: `mock:${file.name || "media"}` });
      return { media: structuredClone(p.media) };
    }
    const headers = { "Content-Type": file.type || "application/octet-stream" };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    const res = await fetch(`${BASE}/projects/${id}/media`, { method: "POST", headers, body: file });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({}));
      throw new Error(msg.error || `Upload failed (${res.status})`);
    }
    return res.json();
  },

  /* --- voting (anon: 1 per IP server-side; logged-in: may add a note) --- */
  async vote(id, dir, note) {
    if (MOCK_MODE) {
      const p = mockStore.find((x) => x.id === id);
      if (!p) return;
      if (mockVoted.has(id) && !mockSession) throw new Error("One vote per visitor — sign in for more.");
      mockVoted.add(id);
      if (dir === "up") p.up++; else p.down++;
      return { up: p.up, down: p.down, note: note || null };
    }
    return req(`/projects/${id}/vote`, { method: "POST", body: { dir, note }, auth: true });
  },

  /* --- auth --- */
  async signup(username, password) {
    if (MOCK_MODE) { mockSession = { username, following: [], followers: [] }; return mockSession; }
    const s = await req("/auth/signup", { method: "POST", body: { username, password } });
    if (s.token) setToken(s.token);
    return s.user || s;
  },
  async login(username, password) {
    if (MOCK_MODE) { mockSession = { username, following: [], followers: [] }; return mockSession; }
    const s = await req("/auth/login", { method: "POST", body: { username, password } });
    if (s.token) setToken(s.token);
    return s.user || s;
  },
  async me() {
    if (MOCK_MODE) return mockSession;
    if (!getToken()) return null;
    return req("/auth/me", { auth: true }).catch(() => null);
  },
  logout() {
    if (MOCK_MODE) { mockSession = null; return; }
    setToken(null);
  },

  /* --- my projects --- */
  async myProjects() {
    if (MOCK_MODE) return mockStore.filter((p) => p.author === (mockSession?.username));
    return req("/me/projects", { auth: true });
  },

  /* --- follow graph (Redis sets server-side) --- */
  async follow(username) { if (MOCK_MODE) return; return req(`/users/${username}/follow`, { method: "POST", auth: true }); },
  async unfollow(username) { if (MOCK_MODE) return; return req(`/users/${username}/follow`, { method: "DELETE", auth: true }); },
};
