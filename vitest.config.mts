import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Integration tests share one test database; run files serially.
    fileParallelism: false,
    // Integration set-up hashes passwords and runs daily jobs against a real database; on slower
    // machines that passes the 10s default.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
