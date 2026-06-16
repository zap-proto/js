# @zap-proto/zap

Native ZAP (Zero-copy Application Protocol) TypeScript wire runtime.

Zero dependencies. Zero Cap'n Proto. The TypeScript peer of
[`github.com/zap-proto/go`](https://github.com/zap-proto/go), byte-compatible
with it and with the [`github.com/luxfi/zap`](https://github.com/luxfi/zap)
transport.

ZAP is **not** Cap'n Proto. It has its own wire format, byte-defined by
`zap-proto/spec`. This package implements that format directly — no `*.capnp`,
no `interface @0xID` dialect, no codec dependency.

Lives at `github.com/zap-proto/ts`; published as `@zap-proto/zap`.

## Install

```sh
pnpm add @zap-proto/zap
```

## Entry points

The root entry is **universal** — it imports no Node built-ins and bundles
cleanly into a browser. The Node-only TCP transport lives behind the `/node`
sub-path so `node:net` never leaks into a browser bundle.

```ts
// Universal (browser + Node): wire codec, views, builders, the call envelope.
import { Builder, Message, buildRequest, parseResponse } from "@zap-proto/zap";

// Node only: the luxfi/zap TCP RPC client + promise pipelining.
import { ZapClient, pipeline } from "@zap-proto/zap/node";
```

| Sub-path             | Role                                                              |
| -------------------- | ---------------------------------------------------------------- |
| `@zap-proto/zap`     | `wire` / `view` / `builder` / `envelope` — universal, no Node.   |
| `@zap-proto/zap/node`| `ZapClient` (TCP, `node:net`) + two-connection `pipeline`.       |

## Layers

| File          | Entry  | Role                                                                    |
| ------------- | ------ | ----------------------------------------------------------------------- |
| `wire.ts`     | root   | Little-endian primitives + header constants (`HEADER_SIZE=16`, `ZAP\0`). |
| `view.ts`     | root   | `Message`, `StructView`, `ListView` — the read side.                    |
| `builder.ts`  | root   | `Builder`, `StructBuilder`, `ListBuilder` — the write side.             |
| `envelope.ts` | root   | msgType + method + capability call envelope.                            |
| `client.ts`   | `/node`| TCP RPC client speaking the luxfi/zap node framing (uses `node:net`).   |
| `pipeline.ts` | `/node`| Two-connection promise pipelining.                                      |

## Codegen — `zapgen`

`@zap-proto/zap` ships the `zapgen` CLI as a bin, so any consumer can generate
TypeScript bindings from a `.zap` schema after install:

```sh
npx zapgen schema.zap                      # writes schema_zap.ts next to the input
npx zapgen -out ./src/gen schema.zap       # writes into the given directory
npx zapgen --emit=openapi schema.zap       # writes schema.openapi.json (OpenAPI 3.1)
npx zapgen --emit=ts,openapi schema.zap    # writes both targets
npx zapgen --help
```

The `--emit` targets are `ts` (default) and `openapi`. `openapi` emits one
OpenAPI 3.1 document per `interface`: each method becomes a
`POST /<service-name-kebab>/<method-name-kebab>` operation whose request/response
bodies are the JSON Schema of the method's structs, and every referenced struct
lands in `components.schemas`. The emitted paths match what
`@zap-proto/web/server`'s `httpServe` mounts, so the OpenAPI surface and the live
HTTP service stay in lockstep. `# @openapi:version X` and `# @openapi:server URL`
comment directives set `info.version` and `servers[]`.

### Schema syntax

```zap
package myservice

type id32 = bytes_fixed[32]

# Structs — zero-copy View + builder per struct (byte-compatible with Go).
struct EchoReq  { Msg text @0 }
struct EchoResp { Msg text @0 }

# Interfaces — a typed Client + abstract Server + method-ordinal table.
interface Echo {
  echo(req: EchoReq) returns (resp: EchoResp)   # ordinal 1
  ping() returns ()                              # ordinal 2
  notify(n: EchoReq)                             # ordinal 3, no response
}
```

Method ordinals are auto-assigned `1, 2, 3, …` in declaration order — stable
wire compatibility: appending a method never renumbers the existing ones.

### Output

For `echo.zap` above, `zapgen` writes `echo_zap.ts` containing:

- `class EchoReq extends StructView` + `newEchoReq(...)` (one View + builder per struct).
- `const EchoMethod = { echo: 1, … }` — the ordinal table.
- `class EchoClient` — one `async` method per declared method, over a `call`
  channel.
- `abstract class EchoServer` — one abstract handler per method plus a
  `dispatch(envelope)` that decodes the ordinal and routes to it.

The generated file imports from `@zap-proto/zap` and is byte-compatible with the
Go runtime over the wire.

## Develop

```sh
pnpm install     # runs prepare → tsup → dist/
pnpm build       # tsup --format esm --dts
pnpm test        # vitest (byte-identical Go fixture + round-trips)
pnpm typecheck   # tsc --noEmit (strict)
```

See [`LLM.md`](./LLM.md) for the full wire-format contract and transport framing.

## License

MIT
