# @zap-proto/zap

Native ZAP (Zero-copy Application Protocol) TypeScript wire runtime.

Zero dependencies. Its own wire format. The TypeScript peer of
[`github.com/zap-proto/go`](https://github.com/zap-proto/go), byte-compatible
with it and with the [`github.com/luxfi/zap`](https://github.com/luxfi/zap)
transport.

ZAP defines its own wire format, byte-defined by
`zap-proto/spec`. This package implements that format directly — no IDL files,
no `interface @0xID` dialect, no codec dependency.

Lives at `github.com/zap-proto/js`; published as `@zap-proto/zap`.

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
| `@zap-proto/zap`     | `wire` / `view` / `builder` / `envelope` + `Session` / `Pipeliner` — universal, no Node. |
| `@zap-proto/zap/node`| `ZapClient` (TCP, `node:net`) + two-connection `pipeline`.       |
| `@zap-proto/zap/cap` | The capability runtime — `issue` / `attenuate` / `verify` / `verifyChain` / `revoke` (Node, `node:crypto`). |

## Layers

| File          | Entry  | Role                                                                    |
| ------------- | ------ | ----------------------------------------------------------------------- |
| `wire.ts`     | root   | Little-endian primitives + header constants (`HEADER_SIZE=16`, `ZAP\0`). |
| `view.ts`     | root   | `Message`, `StructView`, `ListView` — the read side.                    |
| `builder.ts`  | root   | `Builder`, `StructBuilder`, `ListBuilder` — the write side.             |
| `envelope.ts` | root   | msgType + method + capability call envelope.                            |
| `promise.ts`  | root   | Target-based promise pipelining — `Session` + `Pipeliner` (universal).   |
| `client.ts`   | `/node`| TCP RPC client speaking the luxfi/zap node framing (uses `node:net`).   |
| `pipeline.ts` | `/node`| Two-connection socket overlap on top of `promise.ts`.                   |
| `cap.ts`      | `/cap` | Capability runtime — signed, attenuable authority tokens (`node:crypto`). |

## Capabilities

`@zap-proto/zap/cap` is the capability runtime — signed, attenuable tokens of
authority, the byte-for-byte TypeScript peer of
[`github.com/zap-proto/go/cap`](https://github.com/zap-proto/go/tree/main/cap).
A `Cap` grants a holder a `permissions` bitmask over a `target`, issued by an
`issuer`; caps chain via `parent`, and `verifyChain` walks back to a root.

```ts
import { issue, attenuate, CapKind, Perm, Ed25519Signer } from "@zap-proto/zap/cap";

const signer = Ed25519Signer.generate();
const root = issue(
  { kind: CapKind.IAMSession, permissions: Perm.Attenuate, expiresAt: 2_000_000_000n },
  signer,
);
// Narrower child: permissions intersect, expiry only shrinks, parent must carry
// Perm.Attenuate (or be a CapKind.Delegate cap).
const child = attenuate(root, childHolder, Perm.Audit, undefined, 0n, signer);
```

`issue` / `attenuate` enforce the SPEC §2.3 delegation gate at mint time;
`verify` / `verifyChain` return `CapError | null` (null = ok) with **fail-closed**
scheme dispatch — the tag at `Sig[3407]` must be in `{0x01,0x02,0x03,0x04}` or it
is refused, never downgraded. The CapID is `SHA-256(canonicalBytes(cap) || Sig)`
and the signed scope is `Capability[0..164) || canonical(Caveats)` — byte-identical
to the Go, Python, and Rust runtimes (pinned by `test/cap_go_kat.hex`). Ed25519 is
the only built-in primitive (`node:crypto`, **zero npm deps**); ML-DSA-65 / hybrid
/ secp256k1 are refused unless a `schemeVerify` hook is wired — it never fabricates
a verify. The capability layer ships in all four reference runtimes (Go, Python,
Rust, TypeScript).

## Promise pipelining

`Session` + `Pipeliner` (root entry, universal) are the canonical Target-based
pipelining model — the byte-for-byte TS peer of Go's `rpc.Session` /
`rpc.Pipeliner` and Python's `Session` / `Pipeliner`. A call carries a `promiseID`;
a dependent call sets `target` to a prior call's `promiseID`, and the server
substitutes that call's resolved body as the dependent's payload before dispatch.

```ts
import { Session, Pipeliner, buildRequest } from "@zap-proto/zap";

const sess = new Session();
const srv = new Pipeliner(dispatch);     // (envelope) => Promise<responseEnvelope>

const p = sess.next();                   // A: authenticate (target = NO_TARGET)
const a = await srv.handle(buildRequest(sess.origin(p, AUTH_ORDINAL, cap, req)));
const q = sess.next();                   // B: pipeline on A's answer
const b = await srv.handle(buildRequest(sess.pipe(q, p, GET_ORDINAL, cap)));
```

The `Pipeliner` queues a dependent whose target has not resolved, refuses
(`Status.BadRequest`) one whose target answered non-OK or was `finish`ed, and
never hangs. `buildRequest` / `buildResponse` are byte-identical to Go and Python,
so a pipelined exchange round-trips between all three. The `/node` `pipeline`
helper builds on this to ship the dependent leg on a second socket for true
wire-level overlap. (Rust's `zap-rpc` implements the richer capnp `PromisedAnswer`
superset.)

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

The canonical surface of ZAP is **whitespace-significant** — brace-free,
offside-rule blocks, ordinals implied by declaration order — and is documented at
[zap-proto.dev/docs/schema](https://zap-proto.dev/docs/schema). That surface is
parsed by the `zap` front-end ([`zap-proto/cpp-core`](https://github.com/zap-proto/cpp-core)),
which every language plugin shells out to.

`zapgen` in this repo is a self-contained TypeScript generator with its own
parser, and it reads the explicit **brace** form below (`struct ... { field type
@N }`, `method(...) returns (...)`). Both forms describe identical schemas; pick
the one your generator consumes — `npx zapgen` here expects the brace form.

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
