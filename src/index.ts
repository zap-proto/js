// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * @zap-proto/zap — the native ZAP TypeScript wire runtime.
 *
 * Zero runtime dependencies, zero Cap'n Proto. Byte-compatible with the
 * canonical Go runtime (github.com/zap-proto/go) and the luxfi/zap transport,
 * so generated TS views/builders (zapgen --target=ts) interoperate with Go
 * service binaries over the wire.
 *
 * Layers:
 *   - wire.ts:     little-endian primitives + header constants.
 *   - view.ts:     Message / StructView / ListView (read).
 *   - builder.ts:  Builder / StructBuilder / ListBuilder (write).
 *   - envelope.ts: the msgType+method+capability call envelope.
 *   - client.ts:   TCP RPC client (luxfi/zap framing; Node-only).
 *   - pipeline.ts: two-connection promise pipelining.
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

export { ZapClient, type ConnectOptions } from "./client.js";

export {
  pipeline,
  assertOK,
  type PipelineLeg,
  type PipelineResult,
} from "./pipeline.js";
