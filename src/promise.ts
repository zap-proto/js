// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * promise.ts — promise pipelining over the ZAP call envelope (universal).
 *
 * The ONE canonical model, shared byte-for-byte with the Go runtime
 * (github.com/zap-proto/go/rpc, `Session` + `Pipeliner`): a call carries a
 * caller-assigned PromiseID (the id its answer resolves to); a *dependent*
 * call sets Target = a prior call's PromiseID, meaning "before you dispatch
 * me, substitute the resolved Body of the call that answered to that
 * PromiseID as my Payload." The result of A is the input to B, so B ships
 * back-to-back with A and the server chains them — no round trip threads A's
 * answer back through the client first.
 *
 * This module is UNIVERSAL: it touches only the envelope (buildRequest/
 * parseRequest/parseResponse), never `node:net`, so the exact same model
 * runs in a browser, in-process, and (via the two-connection helper in
 * pipeline.ts) over the TCP transport.
 *
 *   - {@link Session} (client side) is the PromiseID allocator + Call
 *     builders — the TS peer of rpc.Session.
 *   - {@link Pipeliner} (server side) is the promise table — the TS peer of
 *     rpc.Pipeliner: resolve Target before dispatch, record each OK answer,
 *     queue a dependent whose Target has not resolved yet, refuse one whose
 *     Target answered non-OK.
 *
 * A non-pipelined call sets Target = NO_TARGET, so a Pipeliner and a plain
 * dispatcher are byte-compatible on the wire and a non-pipelining peer
 * interoperates trivially.
 */

import {
  buildRequest,
  parseRequest,
  parseResponse,
  buildResponse,
  NO_TARGET,
  Status,
  type Call,
  type Response,
} from "./envelope.js";

const EMPTY = new Uint8Array(0);

/** A handle to the not-yet-resolved answer of an in-flight call. */
export interface PromiseHandle {
  /** The PromiseID the originating call's answer resolves to (never 0). */
  readonly id: number;
}

/**
 * Session is the client half of pipelining: a monotonic PromiseID allocator
 * scoped to one transport connection (the TS peer of Go's rpc.Session). The
 * first call of a pipeline takes a fresh PromiseID via {@link next}; a
 * dependent call sets Target to that PromiseID via {@link pipe}.
 *
 * PromiseIDs are unique and non-zero within a session (0 is NO_TARGET); the
 * sequence matches Go: the first id is 1.
 */
export class Session {
  private seq = 0;

  /** Allocate a fresh, unique, non-zero PromiseID and return its handle. */
  next(): PromiseHandle {
    this.seq = (this.seq + 1) >>> 0;
    if (this.seq === NO_TARGET) this.seq = (this.seq + 1) >>> 0; // skip 0 on wrap
    return { id: this.seq };
  }

  /**
   * Build the originating Call of a pipeline: a fresh PromiseID (`p`) and
   * Target = NO_TARGET. `cap`/`payload` are this call's own arguments.
   */
  origin(
    p: PromiseHandle,
    method: number,
    cap: Uint8Array = EMPTY,
    payload: Uint8Array = EMPTY,
  ): Call {
    return { method, promiseID: p.id, target: NO_TARGET, cap, payload };
  }

  /**
   * Build a dependent Call pipelined on `target`'s answer: its own fresh
   * PromiseID (`p`) and Target = target.id. The server substitutes target's
   * resolved Body for this call's payload before dispatch, so `payload` here
   * is only the part NOT supplied by the upstream answer (usually empty —
   * the whole input is the upstream result).
   */
  pipe(
    p: PromiseHandle,
    target: PromiseHandle,
    method: number,
    cap: Uint8Array = EMPTY,
    payload: Uint8Array = EMPTY,
  ): Call {
    return { method, promiseID: p.id, target: target.id, cap, payload };
  }
}

/** A server entry point: decode a Call envelope, dispatch, return a Response envelope. */
export type DispatchFn = (envelope: Uint8Array) => Promise<Uint8Array>;

/** A dependent call parked until its Target resolves. */
interface Pending {
  call: Call;
  resolve: (responseEnvelope: Uint8Array) => void;
  reject: (err: Error) => void;
}

/**
 * Pipeliner is a server-side promise table for one session (the TS peer of
 * Go's rpc.Pipeliner). Feed each inbound request envelope to {@link handle};
 * it resolves Target references, records OK answers, and queues a dependent
 * whose Target has not resolved yet until a later handle resolves it.
 *
 * A request with Target = NO_TARGET dispatches straight through. JS is
 * single-threaded, so handle is naturally serialized; a parked dependent is
 * released by the microtask that records its target's answer.
 */
export class Pipeliner {
  private readonly resolved = new Map<number, Uint8Array>(); // PromiseID -> OK body
  private readonly failed = new Set<number>(); // PromiseID -> answered non-OK
  private readonly finished = new Set<number>(); // PromiseID -> Finished (answer dropped)
  private readonly waiters = new Map<number, Pending[]>(); // Target -> parked dependents

  constructor(private readonly dispatch: DispatchFn) {}

  /**
   * Process one inbound request envelope and resolve to its response
   * envelope. A request with Target = NO_TARGET dispatches straight through.
   * Otherwise the Target decides:
   *   - resolved (OK): substitute the resolved body for the payload and
   *     dispatch immediately.
   *   - failed (non-OK) or finished: refuse with StatusBadRequest — it can
   *     never produce a result to pipeline on.
   *   - unknown: park until a later handle resolves it (the dependent
   *     legitimately arrived before its origin), or finish() refuses it.
   */
  async handle(envelope: Uint8Array): Promise<Uint8Array> {
    const call = parseRequest(envelope);
    if (call.target === NO_TARGET) {
      return this.dispatchAndRecord(call);
    }
    const body = this.resolved.get(call.target);
    if (body !== undefined) {
      return this.dispatchAndRecord({ ...call, payload: body });
    }
    if (this.failed.has(call.target) || this.finished.has(call.target)) {
      return buildResponse(Status.BadRequest, call.promiseID, EMPTY);
    }
    // Unknown Target: park under it (its origin may still be in flight).
    return new Promise<Uint8Array>((resolve, reject) => {
      const list = this.waiters.get(call.target) ?? [];
      list.push({ call, resolve, reject });
      this.waiters.set(call.target, list);
    });
  }

  /**
   * Finish drops the cached answer for `id` once no further call will
   * pipeline on it (the analogue of capnp's Finish). Optional: without it,
   * an OK answer is retained for the session so a dependent arriving after
   * its target resolves still finds it.
   *
   * After Finish, `id` is terminal: any dependent targeting it — already
   * parked or arriving later — is refused (StatusBadRequest), not hung.
   */
  finish(id: number): void {
    this.resolved.delete(id);
    this.failed.delete(id);
    this.finished.add(id);
    const woken = this.waiters.get(id) ?? [];
    this.waiters.delete(id);
    for (const pc of woken) {
      pc.resolve(buildResponse(Status.BadRequest, pc.call.promiseID, EMPTY));
    }
  }

  /** Run one resolved call, record its answer under its PromiseID, wake dependents. */
  private async dispatchAndRecord(call: Call): Promise<Uint8Array> {
    let respBytes: Uint8Array;
    try {
      respBytes = await this.dispatch(buildRequest(call));
    } catch (err) {
      this.poison(call.promiseID, err as Error);
      throw err;
    }
    const resp = parseResponse(respBytes);
    this.record(call.promiseID, resp);
    return respBytes;
  }

  /** Cache an OK answer (and wake dependents with it) or mark id failed (refuse them). */
  private record(id: number, resp: Response): void {
    const woken = this.waiters.get(id) ?? [];
    this.waiters.delete(id);
    if (resp.status === Status.OK) {
      // Copy: resp.body aliases the dispatch buffer, but a parked dependent
      // reuses it as its payload past this call's lifetime.
      const body = resp.body.slice();
      this.resolved.set(id, body);
      for (const pc of woken) {
        this.dispatchAndRecord({ ...pc.call, payload: body }).then(
          pc.resolve,
          pc.reject,
        );
      }
      return;
    }
    this.failed.add(id);
    for (const pc of woken) {
      pc.resolve(buildResponse(Status.BadRequest, pc.call.promiseID, EMPTY));
    }
  }

  /** Wake every dependent parked on id with err (dispatch itself failed). */
  private poison(id: number, err: Error): void {
    this.failed.add(id);
    const woken = this.waiters.get(id) ?? [];
    this.waiters.delete(id);
    for (const pc of woken) pc.reject(err);
  }
}
