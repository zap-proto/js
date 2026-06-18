import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Self-host alias: the generated bindings import the public "@zap-proto/zap"
// specifier; under test we resolve it to the package's own source so the
// runtime under test is exactly what ships. (Mirrors zap-es self-hosting
// its own package specifier → ./src.)
export default defineConfig({
  resolve: {
    alias: {
      // Order matters: the ./node sub-path alias must precede the bare
      // specifier so it is not shadowed.
      "@zap-proto/zap/node": fileURLToPath(
        new URL("./src/node.ts", import.meta.url),
      ),
      "@zap-proto/zap": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
