import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Liveness checks pace themselves to one request per host per second in the app.
    // Tests use mocked fetches and must not wait on that.
    env: { JST_LIVENESS_HOST_GAP_MS: "0" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
