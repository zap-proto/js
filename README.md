# @zap-proto/zap

> **Docs:** [ZAP TypeScript SDK](https://zap-proto.dev/docs/sdks/typescript) · part of the [ZAP Protocol](https://zap-proto.io)

The **ZAP foundation layer** for TypeScript — the Cap'n-Proto wire codec plus the
Level-4 RPC primitives. This is the wire underneath [`@zap-proto/mcp`](https://github.com/zap-proto/mcp)
and the rest of the ZAP protocol family. Fork of [`unjs/capnp-es`](https://github.com/unjs/capnp-es).

[![npm version](https://img.shields.io/npm/v/@zap-proto/zap)](https://npmjs.com/package/@zap-proto/zap)

## What it owns

`@zap-proto/zap` is the foundation — and **only** the foundation. It carries:

- **Codec** — the Cap'n-Proto wire format: zero-copy serialization, segments,
  arenas, pointers, packing, and the generated built-in schema bindings.
- **RPC** — the Level-4 RPC primitives: `Conn`, `Client`, `Server`, `Pipeline`,
  `Call`, `Registry`, `Transport`, capability tables, promise pipelining.
- **Compiler** — the `capnpc-ts` / `capnpc-js` / `capnpc-dts` code generators.

No MCP, no browser glue, no application protocols. Those layer on top in their
own packages (`@zap-proto/mcp`, `@zap-proto/web`, …).

## Layout

```
src/
  codec/          # Cap'n-Proto wire format
    serialization/  # runtime: message, segment, arena, pointers, packing
    capnp/          # generated built-in schema bindings (schema, rpc, …)
  rpc/            # Level-4 RPC primitives
  compiler/       # capnpc-ts / -js / -dts code generators
  debug/          # message dump / inspection helpers
  constants.ts    # shared primitives used across codec + rpc + compiler
  errors.ts
  util.ts
```

## Entry points

| Import                                         | Contains                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| `@zap-proto/zap`                               | Full runtime — codec **and** RPC. Generated schema code binds here. |
| `@zap-proto/zap/rpc`                           | RPC primitives only (focused, tree-shakeable).                      |
| `@zap-proto/zap/debug`                         | Message dump / inspection helpers.                                  |
| `@zap-proto/zap/compiler`                      | Programmatic compiler API.                                          |
| `@zap-proto/zap/codec/capnp/*`                 | Built-in schema bindings (`schema`, `rpc`, `cpp`, …).               |
| `capnpc-ts` · `capnpc-js` · `capnpc-dts` (bin) | Schema → TypeScript/JS/d.ts.                                        |

```ts
import { Message, Struct } from "@zap-proto/zap"; // codec (full runtime)
import { Conn, Client, Server } from "@zap-proto/zap/rpc"; // RPC only
```

## Compile a schema

```sh
pnpm capnpc-ts path/to/schema.capnp -ots:./src/gen
```

Generated code imports the runtime as `import * as $ from "@zap-proto/zap"`.

## Install

```sh
pnpm add @zap-proto/zap
```

## Related

- [`@zap-proto/mcp`](https://github.com/zap-proto/mcp) — Model Context Protocol over ZAP (sits on this wire layer)
- [`zap-proto/spec`](https://github.com/zap-proto/spec) — canonical, language-agnostic wire spec
- [`zap-proto/go`](https://github.com/zap-proto/go) · [`zap-proto/rust`](https://github.com/zap-proto/rust) — sibling implementations

## License

MIT
