import { defineBuildConfig } from "unbuild";
import { fileURLToPath } from "node:url";

export default defineBuildConfig({
  declaration: true,
  entries: [
    "./src/index.ts", // . — codec
    "./src/rpc/index.ts", // ./rpc — Level-4 RPC
    "./src/compiler/index.ts", // ./compiler
    "./src/compiler/capnpc-js.ts", // bin
    "./src/compiler/capnpc-dts.ts", // bin
    "./src/compiler/capnpc-ts.ts", // bin
    "./src/debug/index.ts", // ./debug
    // Built-in Cap'n Proto schemas, importable as @zap-proto/zap/codec/capnp/*
    ...["cpp", "persistent", "rpc-twoparty", "rpc", "schema", "ts"].map(
      (n) => `./src/codec/capnp/${n}.ts`,
    ),
  ],
  alias: {
    "@zap-proto/zap": fileURLToPath(new URL("src/index.ts", import.meta.url)),
  },
  hooks: {
    "rollup:options"(_ctx, rollupOptions) {
      rollupOptions.external = ["typescript"];
    },
  },
});
