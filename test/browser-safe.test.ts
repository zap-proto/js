// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * @vitest-environment happy-dom
 *
 * Browser-safety guard for the @zap-proto/zap root entry (FIX 1).
 *
 * The root entry must import zero Node built-ins so it bundles cleanly into a
 * browser. We assert two things:
 *
 *   1. `await import("@zap-proto/zap")` resolves with no error under a DOM
 *      environment and exposes the universal runtime (envelope/view/builder).
 *   2. The BUILT root bundle (dist/index.js) contains no `node:` / bare-builtin
 *      import — the Node-only TCP transport lives only behind ./node.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/** Strip `//` line comments and block comments so JSDoc prose mentioning
 *  `node:` / `createRequire` does not trip the code-only guard below. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("@zap-proto/zap root is browser-safe (FIX 1)", () => {
  it("imports under a DOM environment with no resolution error", async () => {
    // happy-dom installs a DOM global; this confirms the env is active.
    expect(typeof (globalThis as Record<string, unknown>).window).toBe(
      "object",
    );
    const mod = await import("@zap-proto/zap");
    // Universal runtime surface is present...
    expect(typeof mod.buildRequest).toBe("function");
    expect(typeof mod.Builder).toBe("function");
    expect(typeof mod.Message).toBe("function");
    // ...and the Node-only TCP client is NOT reachable from root.
    expect((mod as Record<string, unknown>).ZapClient).toBeUndefined();
  });

  it("built dist/index.js imports no Node built-in", () => {
    // Resolve from cwd (the package root): import.meta.url is an http:// URL
    // under happy-dom, so fileURLToPath would reject it.
    const dist = join(process.cwd(), "dist", "index.js");
    if (!existsSync(dist)) {
      // dist is produced by `pnpm build`; skip if running pre-build.
      return;
    }
    const code = stripComments(readFileSync(dist, "utf8"));
    // No `from "node:..."`, no bare `from "net"/"tls"/"module"`, no require().
    expect(/from\s*["']node:/.test(code)).toBe(false);
    expect(/from\s*["'](?:net|tls|module|http|stream)["']/.test(code)).toBe(
      false,
    );
    expect(/\bcreateRequire\b/.test(code)).toBe(false);
  });

  it("the Node sub-path still carries the TCP client", async () => {
    const node = await import("@zap-proto/zap/node");
    expect(typeof node.ZapClient).toBe("function");
    expect(typeof node.pipeline).toBe("function");
  });
});
