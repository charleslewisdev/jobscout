import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "shared/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", "client"],
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      exclude: [
        "node_modules/**",
        "dist/**",
        "client/**",
        "**/*.config.*",
        "**/*.test.ts",
        "**/*.spec.ts",
        "src/db/migrations/**",
      ],
      thresholds: {
        statements: 30,
        branches: 60,
        functions: 30,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
