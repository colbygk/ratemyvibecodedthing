import { defineConfig } from "vite";

// Custom domain (CNAME = ratemyvibecodedthing.ai) serves from root,
// so base stays "/". If you ever host at user.github.io/<repo>, set base to "/<repo>/".
export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    target: "es2020",
  },
  // Dev-server settings (ignored by `vite build`). `host: true` binds 0.0.0.0 so
  // the server is reachable inside Docker; allowedHosts lets the compose service
  // hostnames (web, web-e2e) load the app for end-to-end tests.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost", "web", "web-e2e"],
  },
});
