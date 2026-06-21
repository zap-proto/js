// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * @zap-proto/zap — the native ZAP TypeScript wire runtime.
 *
 * Zero runtime dependencies, its own wire format. Byte-compatible with the
 * canonical Go runtime (github.com/zap-proto/go) and the luxfi/zap transport,
 * so generated TS views/builders (zapgen --target=ts) interoperate with Go
 * service binaries over the wire.
 *
 * This root entry is UNIVERSAL — it imports no Node built-ins and is safe in
 * any browser bundle. The Node-only TCP transport (ZapClient, pipeline) lives
 * behind the `@zap-proto/zap/node` sub-path so it never leaks `node:net` into
 * the browser.
 *
 * Layers:
 *   - wire.ts:     little-endian primitives + header constants.
 *   - view.ts:     Message / StructView / ListView (read).
 *   - builder.ts:  Builder / StructBuilder / ListBuilder (write).
 *   - envelope.ts: the msgType+method+capability call envelope.
 *   - promise.ts:  Target-based promise pipelining (Session / Pipeliner),
 *                  byte-for-byte with Go's rpc.Session / rpc.Pipeliner.
 *
 * Node-only (import from `@zap-proto/zap/node`):
 *   - client.ts:   TCP RPC client (luxfi/zap framing; uses node:net).
 *   - pipeline.ts: two-connection socket overlap on top of promise.ts.
 */

export {
  HEADER_SIZE,
  ALIGNMENT,
  VERSION,
  VERSION_1,
  VERSION_2,
  MAGIC,
  FLAG_NONE,
  FLAG_COMPRESSED,
  FLAG_ENCRYPTED,
  FLAG_SIGNED,
  encodeUtf8,
  decodeUtf8,
} from "./wire.js";

export { Message, StructView, ListView, ZapParseError } from "./view.js";

export { Builder, StructBuilder, ListBuilder } from "./builder.js";

export {
  MSG_TYPE_ROUTER_BASE,
  Method,
  NO_TARGET,
  Status,
  buildRequest,
  parseRequest,
  buildResponse,
  parseResponse,
  type Call,
  type Response,
  type MethodValue,
} from "./envelope.js";

// Promise pipelining (universal: Target-based, byte-for-byte with Go's
// rpc.Session / rpc.Pipeliner). Touches only the envelope — no node:net, so
// it is safe in any browser bundle.
export {
  Session,
  Pipeliner,
  type PromiseHandle,
  type DispatchFn,
} from "./promise.js";
