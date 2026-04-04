import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@internet-mindmap/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
