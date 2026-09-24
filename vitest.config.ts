import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["node_modules", ".next", "dist"],
    execArgv: ["--experimental-require-module"],
    pool: "forks",
  },
  resolve: {
    alias: {
      "@/auth": resolve(__dirname, "auth.ts"),
      "@/auth.config": resolve(__dirname, "auth.config.ts"),
      "@/routes": resolve(__dirname, "routes.ts"),
      "next/server": resolve(__dirname, "node_modules/next/server.js"),
      "@": resolve(__dirname, "src"),
    },
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
});
