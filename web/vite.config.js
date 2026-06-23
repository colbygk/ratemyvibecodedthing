import { defineConfig } from "vite";

// Custom domain (CNAME = ratemyvibecodedthing.ai) serves from root,
// so base stays "/". If you ever host at user.github.io/<repo>, set base to "/<repo>/".
export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    target: "es2020",
  },
});
