import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // WebCrypto (crypto.subtle) is available on Node's global
    include: ["test/**/*.test.js"],
  },
});
