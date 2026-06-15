import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    coverage: { include: ["src/**/*.ts"], exclude: ["src/codec/capnp/*.*"] },
    testTimeout: 10_000,
  },
  plugins: [tsconfigPaths()],
});
