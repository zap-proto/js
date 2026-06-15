// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * pipeline.ts — promise pipelining over two ZAP connections.
 *
 * Mirrors github.com/hanzoai/ui-customization/server/client.go Pipeline(): a
 * dependent call references the not-yet-resolved answer of an earlier call by
 * Target = the earlier call's PromiseID. The server resolves the first call's
 * answer (the authenticated org) and only then dispatches the dependent call
 * against it — no extra client round trip.
 *
 * Why two connections: the luxfi/zap transport processes a single connection's
 * frames strictly FIFO (one handler runs to completion before the next frame is
 * read). Genuine concurrent in-flight calls therefore require two connections;
 * the server's promise table coordinates them. This is exactly what the Go
 * Pipeline() does — the dependent getModules ships on a SECOND client.
 *
 * Single-connection async dispatch (queue a dependent call against an
 * unresolved local answer and flush both before the round trip resolves, all on
 * ONE connection) is a follow-up: it needs the transport to admit a second
 * outbound frame before the first response arrives, which the luxfi/zap node
 * supports per-connection, but the server's FIFO handler would serialize them.
 * Until the server runs concurrent per-connection dispatch, two connections is
 * the only way to overlap. TODO(follow-up): single-connection variant.
 */

import { ZapClient } from "./client.js";
import { Status, type Response } from "./envelope.js";

/** Process-unique promise-id allocator for pipeline groups (mirrors pipelineIDSeq). */
let pipelineIDSeq = 1 << 20;
function nextPipelineID(): number {
  pipelineIDSeq = (pipelineIDSeq + 1) >>> 0;
  return pipelineIDSeq;
}

/** One leg of a pipelined pair: which method, and whether it targets the other. */
export interface PipelineLeg {
  method: number;
  /** When true, this leg targets the FIRST leg's promise (the dependent call). */
  dependent?: boolean;
}

/** Result of a pipelined pair: both responses, in (first, second) order. */
export interface PipelineResult {
  first: Response;
  second: Response;
}

/**
 * Run two calls as a pipeline: `first` on connection `a`, `second` on
 * connection `b` with Target = first's PromiseID. The dependent send is
 * released only after the first send is committed (barrier), so the server
 * resolves first's promise before — or concurrently with — second's await,
 * never after a spurious timeout. Both are in flight before either resolves.
 *
 * Returns both responses. Status checks are left to the caller (it knows which
 * struct each body decodes to).
 */
export async function pipeline(
  a: ZapClient,
  b: ZapClient,
  first: number,
  second: number,
): Promise<PipelineResult> {
  const firstPromise = nextPipelineID();
  const secondPromise = nextPipelineID();

  // Barrier: hold the dependent send until the first send has been issued.
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((r) => {
    releaseBarrier = r;
  });

  const firstCall = (async () => {
    // Issuing the call synchronously writes its frame, then we release the
    // barrier so the dependent leg ships next.
    const p = a.call(first, { promiseID: firstPromise });
    releaseBarrier();
    return p;
  })();

  const secondCall = (async () => {
    await barrier;
    return b.call(second, { promiseID: secondPromise, target: firstPromise });
  })();

  const [firstResp, secondResp] = await Promise.all([firstCall, secondCall]);
  return { first: firstResp, second: secondResp };
}

/** Throw if a response is not OK, using `label` for the message. */
export function assertOK(resp: Response, label: string): Response {
  if (resp.status !== Status.OK) {
    const msg = new TextDecoder().decode(resp.body);
    throw new Error(`${label}: status ${resp.status}: ${msg}`);
  }
  return resp;
}
