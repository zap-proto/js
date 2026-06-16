// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * @zap-proto/zap/node — the Node-only surface of the ZAP runtime.
 *
 * Everything here reaches `node:net` (directly or transitively) and must NEVER
 * be pulled into a browser bundle. The root entry (`@zap-proto/zap`) is the
 * universal wire runtime (envelope, view, builder, wire codec); this sub-path
 * adds the TCP transport.
 *
 *   - client.ts:   TCP RPC client (luxfi/zap framing; uses node:net).
 *   - pipeline.ts: two-connection promise pipelining (rides on the TCP client).
 */

export { ZapClient, type ConnectOptions } from "./client.js";

export {
  pipeline,
  assertOK,
  type PipelineLeg,
  type PipelineResult,
} from "./pipeline.js";
