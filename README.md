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

## Layers

| File          | Role                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| `wire.ts`     | Little-endian primitives + header constants (`HEADER_SIZE=16`, `ZAP\0`). |
| `view.ts`     | `Message`, `StructView`, `ListView` — the read side.                    |
| `builder.ts`  | `Builder`, `StructBuilder`, `ListBuilder` — the write side.             |
| `envelope.ts` | msgType + method + capability call envelope.                            |
| `client.ts`   | TCP RPC client speaking the luxfi/zap node framing (Node-only).         |
| `pipeline.ts` | Two-connection promise pipelining.                                      |

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
