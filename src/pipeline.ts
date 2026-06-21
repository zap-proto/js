// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * pipeline.ts — two-connection overlap for promise pipelining over the TCP
 * transport (Node-only; rides on {@link ZapClient}).
 *
 * The pipelining MECHANISM is the Target field of the call envelope, resolved
 * by a server-side promise table — see {@link Session}/{@link Pipeliner} in
 * promise.ts (the universal, byte-for-byte peer of Go's rpc.Session /
 * rpc.Pipeliner). This file is only the transport convenience for exercising
 * it across a real socket: one ZAP connection processes its frames strictly
 * FIFO (one handler runs to completion before the next frame is read), so to
 * have two calls genuinely in flight at once you ship the dependent leg on a
 * SECOND connection. A `Pipeliner`-backed server chains them by Target.
 *
 * The single-connection, in-process path (drive a `Pipeliner` directly with
 * the same Target wire bytes, no second socket) is the unit-tested one in
 * test/pipeline.test.ts; this helper is the socket-level overlap on top of it.
 */

import { ZapClient } from "./client.js";
import { Status, type Response } from "./envelope.js";
import { Session } from "./promise.js";

/** Result of a pipelined pair: both responses, in (first, second) order. */
export interface PipelineResult {
  first: Response;
  second: Response;
}

/**
 * Overlap two pipelined calls across two TCP connections: `first` on `a`,
 * `second` on `b` with Target = first's PromiseID, both in flight before
 * either resolves. The dependent send is barriered behind the first send so
 * the server records first's answer before — or concurrently with — second's
 * await.
 *
 * Returns both responses; status checks are left to the caller (it knows
 * which struct each body decodes to).
 */
export async function pipeline(
  a: ZapClient,
  b: ZapClient,
  first: number,
  second: number,
): Promise<PipelineResult> {
  const session = new Session();
  const firstPromise = session.next();
  const secondPromise = session.next();

  // Barrier: hold the dependent send until the first send has been issued.
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((r) => {
    releaseBarrier = r;
  });

  const firstCall = (async () => {
    const p = a.call(first, { promiseID: firstPromise.id });
    releaseBarrier();
    return p;
  })();

  const secondCall = (async () => {
    await barrier;
    return b.call(second, { promiseID: secondPromise.id, target: firstPromise.id });
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
