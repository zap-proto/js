// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * pipeline.test.ts — the canonical Target-based promise pipelining model,
 * exercised end-to-end in-process (no sockets). Mirrors the Go
 * rpc/pipeline_test.go: call A authenticates and returns a token; call B
 * pipelines on A via Target, and the server substitutes A's resolved token
 * for B's payload before dispatch — so B's result reflects A's answer with
 * no round trip threading A's body back through the client.
 *
 * These tests drive the REAL Target field (Session sets it, Pipeliner
 * resolves it), not a `typeof === "function"` smoke check.
 */

import { describe, it, expect } from "vitest";
import {
  Session,
  Pipeliner,
  buildRequest,
  parseRequest,
  parseResponse,
  buildResponse,
  NO_TARGET,
  Status,
} from "@zap-proto/zap";

const M_AUTH = 1; // () -> token
const M_GET = 2; // (token) -> "resource@<token>"

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

/**
 * authServer: a dispatch fn (envelope -> response envelope). authenticate
 * returns a fixed token; getResource returns a resource keyed by the payload
 * it is dispatched with, recording every payload so the test can prove the
 * server fed A's result into B.
 */
function authServer(token: string) {
  const gotInput: Uint8Array[] = [];
  const dispatch = async (envelope: Uint8Array): Promise<Uint8Array> => {
    const call = parseRequest(envelope);
    switch (call.method) {
      case M_AUTH:
        return buildResponse(Status.OK, call.promiseID, enc(token));
      case M_GET:
        gotInput.push(call.payload.slice());
        return buildResponse(Status.OK, call.promiseID, enc("resource@" + dec(call.payload)));
      default:
        return buildResponse(Status.NotFound, call.promiseID, new Uint8Array(0));
    }
  };
  return { dispatch, gotInput };
}

/** Ship one Call through the Pipeliner and return the parsed Response. */
async function handle(p: Pipeliner, call: ReturnType<Session["origin"]>) {
  return parseResponse(await p.handle(buildRequest(call)));
}

describe("Target-based promise pipelining (canonical model)", () => {
  it("resolves a dependent call against its Target's answer", async () => {
    const srv = authServer("org-7");
    const p = new Pipeliner(srv.dispatch);
    const sess = new Session();

    // A: authenticate (Target = NO_TARGET).
    const a = sess.next();
    const aResp = await handle(p, sess.origin(a, M_AUTH));
    expect(dec(aResp.body)).toBe("org-7");

    // B: getResource pipelined on A — payload supplied server-side from A.
    const b = sess.next();
    const bResp = await handle(p, sess.pipe(b, a, M_GET));
    expect(dec(bResp.body)).toBe("resource@org-7");

    // The server dispatched B with A's token as the payload.
    expect(srv.gotInput.length).toBe(1);
    expect(dec(srv.gotInput[0])).toBe("org-7");
  });

  it("queues a dependent that arrives before its Target, then resolves it", async () => {
    const srv = authServer("org-42");
    const p = new Pipeliner(srv.dispatch);
    const sess = new Session();
    const a = sess.next();
    const b = sess.next();

    // B references A, but A has not been handled yet — B must park.
    let bSettled = false;
    const bPromise = handle(p, sess.pipe(b, a, M_GET)).then((r) => {
      bSettled = true;
      return r;
    });

    // Let microtasks drain; B must still be parked (A not handled).
    await Promise.resolve();
    await Promise.resolve();
    expect(bSettled).toBe(false);

    // Resolve A; B unblocks with A's token fed in.
    await handle(p, sess.origin(a, M_AUTH));
    const bResp = await bPromise;
    expect(dec(bResp.body)).toBe("resource@org-42");
  });

  it("resolves a chain deeper than two (A -> B -> C)", async () => {
    // method 1 seeds "a"; method 2 appends ">" to its payload.
    const dispatch = async (envelope: Uint8Array): Promise<Uint8Array> => {
      const call = parseRequest(envelope);
      if (call.method === 1) return buildResponse(Status.OK, call.promiseID, enc("a"));
      return buildResponse(Status.OK, call.promiseID, enc(dec(call.payload) + ">"));
    };
    const p = new Pipeliner(dispatch);
    const sess = new Session();
    const a = sess.next();
    const b = sess.next();
    const c = sess.next();

    // Queue C (on B) and B (on A) before A — both park, then cascade.
    const cPromise = handle(p, sess.pipe(c, b, 2));
    const bPromise = handle(p, sess.pipe(b, a, 2));
    await Promise.resolve();
    await handle(p, sess.origin(a, 1)); // resolve A -> B -> C
    expect(dec((await bPromise).body)).toBe("a>");
    expect(dec((await cPromise).body)).toBe("a>>");
  });

  it("refuses a dependent whose Target answered non-OK (immediate)", async () => {
    const dispatch = async (envelope: Uint8Array): Promise<Uint8Array> => {
      const call = parseRequest(envelope);
      if (call.method === M_AUTH) return buildResponse(Status.Unauthorized, call.promiseID, new Uint8Array(0));
      return buildResponse(Status.OK, call.promiseID, enc("resource@" + dec(call.payload)));
    };
    const p = new Pipeliner(dispatch);
    const sess = new Session();

    const a = sess.next();
    const aResp = await handle(p, sess.origin(a, M_AUTH));
    expect(aResp.status).toBe(Status.Unauthorized);

    const b = sess.next();
    const bResp = await handle(p, sess.pipe(b, a, M_GET));
    expect(bResp.status).toBe(Status.BadRequest);
  });

  it("refuses a queued dependent whose Target later fails", async () => {
    const dispatch = async (envelope: Uint8Array): Promise<Uint8Array> => {
      const call = parseRequest(envelope);
      if (call.method === M_AUTH) return buildResponse(Status.Forbidden, call.promiseID, new Uint8Array(0));
      return buildResponse(Status.OK, call.promiseID, new Uint8Array(0));
    };
    const p = new Pipeliner(dispatch);
    const sess = new Session();
    const a = sess.next();
    const b = sess.next();

    const bPromise = handle(p, sess.pipe(b, a, M_GET));
    await Promise.resolve();
    await handle(p, sess.origin(a, M_AUTH)); // A fails
    const bResp = await bPromise;
    expect(bResp.status).toBe(Status.BadRequest);
  });

  it("finish() wakes a parked dependent with a refusal (no hang)", async () => {
    const srv = authServer("org-3");
    const p = new Pipeliner(srv.dispatch);
    const sess = new Session();
    const a = sess.next();
    const b = sess.next();

    // B parks on A (A never originated).
    const bPromise = handle(p, sess.pipe(b, a, M_GET));
    await Promise.resolve();
    // Finishing A must wake B with a refusal, not leave it hung.
    p.finish(a.id);
    const bResp = await bPromise;
    expect(bResp.status).toBe(Status.BadRequest);
  });

  it("finish() drops a resolved answer so a later dependent is refused", async () => {
    const srv = authServer("org-9");
    const p = new Pipeliner(srv.dispatch);
    const sess = new Session();

    const a = sess.next();
    await handle(p, sess.origin(a, M_AUTH));
    // Before finish: the dependent resolves.
    const b = sess.next();
    expect(dec((await handle(p, sess.pipe(b, a, M_GET))).body)).toBe("resource@org-9");

    // After finish: a new dependent on A is refused.
    p.finish(a.id);
    const c = sess.next();
    const cResp = await handle(p, sess.pipe(c, a, M_GET));
    expect(cResp.status).toBe(Status.BadRequest);
  });
});

describe("Target rides on the wire (byte-level, byte-compatible with Go)", () => {
  it("encodes Target = the prior call's PromiseID, NO_TARGET for an origin", () => {
    const sess = new Session();
    const a = sess.next();
    const b = sess.next();
    expect(a.id).not.toBe(NO_TARGET);
    expect(b.id).not.toBe(NO_TARGET);
    expect(a.id).not.toBe(b.id);
    // Go's rpc.Session starts at 1, 2, … — the TS sequence must match so a
    // pipeline built on one runtime resolves on the other.
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);

    const aEnv = buildRequest(sess.origin(a, M_AUTH));
    expect(wireField(aEnv, 8)).toBe(NO_TARGET); // Target @8
    expect(wireField(aEnv, 4)).toBe(a.id); // PromiseID @4

    const bEnv = buildRequest(sess.pipe(b, a, M_GET));
    expect(wireField(bEnv, 8)).toBe(a.id); // B targets A
    expect(wireField(bEnv, 4)).toBe(b.id);

    // And it decodes back unchanged.
    const call = parseRequest(bEnv);
    expect(call.target).toBe(a.id);
    expect(call.promiseID).toBe(b.id);
    expect(call.method).toBe(M_GET);
  });
});

/**
 * Read the request struct's u32 field at struct offset `off` directly from the
 * encoded bytes (root object offset lives in the header at [8:12]), asserting
 * the on-wire bytes — the same way the Go test's wireField does.
 */
function wireField(env: Uint8Array, off: number): number {
  parseRequest(env); // validate framing as a peer would
  const dv = new DataView(env.buffer, env.byteOffset, env.byteLength);
  const root = dv.getUint32(8, true);
  return dv.getUint32(root + off, true);
}
