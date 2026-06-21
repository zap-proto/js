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
| `promise.ts` | Target-based promise pipelining — `Session` (client: PromiseID allocator + `origin`/`pipe` Call builders) + `Pipeliner` (server: promise table that resolves Target before dispatch, queues unresolved dependents, refuses failed/finished). Byte-for-byte the TS peer of Go's `rpc.Session` / `rpc.Pipeliner`. Universal (no `node:net`), exported from the root. |
| `pipeline.ts` | Two-connection socket overlap on top of `promise.ts` — ships the dependent leg on a second TCP connection so two calls are genuinely in flight (one ZAP connection is strictly FIFO). Node-only (`node:net`). |
| `cap.ts` | Capability runtime — `issue`/`attenuate`/`verify`/`verifyChain`/`revoke`, `Ed25519Signer`, `Verifier`, `canonicalBytes`, `capId`. The TS peer of `github.com/zap-proto/go/cap`. Node-only (`node:crypto` for synchronous Ed25519 + SHA-256). Exported at `@zap-proto/zap/cap`, NOT from the universal root. |

## Capability runtime (`src/cap.ts` → `@zap-proto/zap/cap`)

Byte-for-byte port of `github.com/zap-proto/go/cap`. SPEC: `zap-spec/SPEC.md`
§2.3/§3/§4 + `capabilities_kinds.md`.

- **Synchronous**, matching Go exactly — no async contagion through the auth
  primitive. Crypto is `node:crypto` (stdlib): Ed25519 (RFC 8032, raw seed
  framed into PKCS8/SPKI via fixed ASN.1 prefixes) + SHA-256. **Zero npm deps.**
- **CapID** = `SHA-256(canonicalBytes(cap) || Sig)` (spec-corrected from BLAKE3).
  **Signed scope** = `Capability[0..164) || canonical(Caveats)` (Kind:u32-LE ||
  len:u32-LE || Value per caveat, list order) — heap-indirection excluded so the
  bytes are identical across runtimes.
- **Fail-closed scheme dispatch**: tag at `Sig[3407]`. Only `{0x01,0x02,0x03,0x04}`
  known; `0x00`/unknown → `unhandled_scheme`, no fallback. Ed25519 (0x02) is the
  only built-in primitive; ML-DSA-65 / hybrid / secp256k1 are refused unless a
  `schemeVerify` hook is wired (JS ships no PQ primitive — it NEVER fabricates a
  verify or returns true on an unverified sig). A hook may DECLINE a tag by
  returning `new CapError("unhandled_scheme")`; Ed25519 then bootstraps, any
  other declined tag is terminal.
- **Errors**: one `CapError` class with a `code` (`err.code`) mirroring Go's
  sentinels; `verify`/`verifyChain` return `CapError | null` (null = ok), mint
  paths (`issue`/`attenuate`/`revoke`) throw on refusal.
- **Cross-lang KAT**: `test/cap_go_kat.hex` (a Go-signed cap over seed 32×0x42)
  is decoded in `test/cap_kat.test.ts`; JS reproduces Go's exact canonicalBytes,
  CapID (`1b809edc…`), signature, and wire bytes, verifies the Go sig → true,
  rejects a tamper → false. Regenerate via `test/cap_go_kat_gen.go.txt` (`go run`
  it inside the go module).
- **Codec** vendored into `cap.ts` (built on `Builder`/`StructView`/`ListView`),
  exactly as Go vendors `capabilities_zap.go` into package `cap`. Schema:
  `zap-spec/capabilities.zap` (v1.1: 3408-byte Sig footer, struct 3572 B).

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
