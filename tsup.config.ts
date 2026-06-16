// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { defineConfig } from "tsup";

// Two output shapes from one source tree:
//
//   1. The library entries (index, node) — ESM `.js` with .d.ts, matching the
//      package `exports` map. `index` is universal (browser-safe); `node` adds
//      the Node-only TCP transport.
//   2. The `zapgen` CLI — a single ESM `.mjs` bundle under dist/bin with its
//      `#!/usr/bin/env node` shebang preserved, referenced by package `bin`.
export default defineConfig([
  {
    entry: ["src/index.ts", "src/node.ts"],
    format: "esm",
    dts: true,
    clean: true,
    sourcemap: false,
  },
  {
    entry: { "bin/zapgen": "src/bin/zapgen.ts" },
    format: "esm",
    outExtension: () => ({ js: ".mjs" }),
    dts: false,
    clean: false,
    sourcemap: false,
    // tsup preserves a leading shebang from the entry file automatically.
  },
]);
