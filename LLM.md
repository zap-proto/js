# @zap-proto/zap — native ZAP TypeScript wire runtime

Zero dependencies. Its own wire format. The TS peer of `github.com/zap-proto/go`,
byte-compatible with it and with the `github.com/luxfi/zap` transport.

## What it is

The TypeScript half of the native ZAP stack. Generated TS (`zapgen --target=ts`)
emits View/Builder classes over this runtime; a buffer built here parses through
the Go runtime unchanged, and vice versa. Replaces the older schema-compiler `zap-es`
on the TS side — no legacy IDL, no `interface @0xID` dialect, just the wire runtime.

## Layers (src/)

| File | Role |
|------|------|
| `wire.ts` | Little-endian primitives + header constants (`HEADER_SIZE=16`, magic `ZAP\0`, version 1, 8-byte alignment). |
| `view.ts` | `Message` (parse + root), `StructView` (offset getters), `ListView` (element accessors). Read side. |
| `builder.ts` | `Builder` (header + cursor), `StructBuilder` (fixed section + deferred tails), `ListBuilder` (`addObjectBytes`). Write side. |
| `envelope.ts` | The msgType+method+capability call envelope. **Byte-compatible with `hanzoai/ui-customization/server/wire.go`.** |
| `client.ts` | TCP RPC client speaking the luxfi/zap node framing (length-prefix + nodeID handshake + correlated frames). Node-only (`node:net`). |
| `pipeline.ts` | Two-connection promise pipelining (mirrors the Go `Client.Pipeline()`). |

## Wire format (the contract)

- Header (16B): `magic[4]="ZAP\0"`, `version u16 LE`, `flags u16 LE`,
  `rootOffset u32 LE @8`, `size u32 LE @12`.
- Objects are 8-byte aligned. A field's fixed slot:
  - scalar: its width inline.
  - `bytes`/`text`/`list`: `{relOffset u32, length u32}` (8B), data appended
    after the fixed section, `relOffset = dataPos - fieldAbsPos`.
  - nested struct: `{relOffset u32}` (4B, signed).
  - `bytes_fixed[N]`: N bytes inline.
- Variable-element lists (`list<struct|text|bytes>`): each element is
  `{len u32}{data}` (`addObjectBytes`); the list pointer's length word is the
  ELEMENT count. Read via `ListView.objectAt/bytesAt/textAt`.

## Transport framing (client.ts)

luxfi/zap node.go, byte-for-byte:
- Frame: `[len u32 LE][payload]`, 10MB cap.
- Open: dial TCP, send our nodeID handshake (`[len][ZAP 64B-object: utf8 id at
  0, u32 len at 60]`), read peer's.
- Call: `[len=8+body][reqID u32][flag=1 (ReqFlagReq)][envelope]`.
- Response: `[len][reqID u32][flag=2 (ReqFlagResp)][envelope]`, correlated by reqID.

## Tests

`test/wire.test.ts`: byte-identical to a Go-produced `Capability` fixture
(`test/capability.go-fixture.hex`); 1000 random structs round-trip; envelope
round-trip. Self-hosts `@zap-proto/zap` → `./src` via the vitest alias.

## Build

`pnpm install` runs `prepare` → `tsup --format esm --dts` → `dist/`.
`pnpm typecheck` = `tsc --noEmit` (strict). `pnpm test` = vitest.

## Adding a new service (recipe)

1. Clone the Go service binary; write `proto/<svc>.zap` (zap-spec dialect).
2. `zapgen --target=ts proto/<svc>.zap -out <dest>` → generated views/builder.
3. Console drops in the generated file + uses this runtime's `ZapClient`,
   `buildRequest`/`parseResponse`, and the same envelope. No per-service wire code.
