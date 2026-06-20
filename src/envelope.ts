// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * envelope.ts — the msgType + method + capability call envelope.
 *
 * BYTE-COMPATIBLE with the canonical ZAP wire format (github.com/zap-proto/go).
 * That is the on-the-wire contract; the offsets and fixed sizes below mirror it
 * exactly. A request built here is decoded by the Go server's parseRequest, and
 * a response built by the Go server's buildResponse is decoded by parseResponse
 * here.
 *
 * Request object (fixed size 28):
 *   Method    u32   @0    which interface method (the .zap `@n` ordinal)
 *   PromiseID u32   @4    caller-assigned id this call's answer resolves to
 *   Target    u32   @8    promise this call pipelines off (0 = root)
 *   Cap       bytes @12   opaque zap-proto/go capability buffer
 *   Payload   bytes @20   zap-proto/go-encoded method params
 *
 * Response object (fixed size 20):
 *   Status    u32   @0    200 ok, else error
 *   PromiseID u32   @4    echoes the request's PromiseID
 *   Body      bytes @12   zap-proto/go-encoded results (or error JSON)
 *
 * Both envelopes are finished with header flags = MSG_TYPE_ROUTER_BASE << 8 so
 * the luxfi/zap node routes them to this service's handler (msgType = flags>>8).
 */

import { Builder } from "./builder.js";
import { Message, StructView } from "./view.js";
import { VERSION_2 } from "./wire.js";

/** This service's ZAP message-type slot (server/wire.go MsgTypeRouterBase). */
export const MSG_TYPE_ROUTER_BASE = 200;

/** Method ordinals — one per .zap interface method. */
export const Method = {
  Get: 0,
  GetModules: 1,
} as const;
export type MethodValue = (typeof Method)[keyof typeof Method];

/** Target value for a call that does not pipeline off an earlier promise. */
export const NO_TARGET = 0;

/** Status codes (server/wire.go). */
export const Status = {
  OK: 200,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Internal: 500,
} as const;

// Request field offsets (server/wire.go reqXxxOff).
const reqMethodOff = 0;
const reqPromiseIDOff = 4;
const reqTargetOff = 8;
const reqCapOff = 12;
const reqPayloadOff = 20;
const reqFixedSize = 28;

// Response field offsets (server/wire.go respXxxOff).
const respStatusOff = 0;
const respPromiseIDOff = 4;
const respBodyOff = 12;
const respFixedSize = 20;

/** A request call's fields. */
export interface Call {
  method: number;
  promiseID: number;
  target: number;
  cap: Uint8Array;
  payload: Uint8Array;
}

/**
 * Encode a Call into a router-tagged ZAP message (the bytes a luxfi/zap frame
 * carries). Mirrors server/wire.go buildRequest.
 */
export function buildRequest(c: Call): Uint8Array {
  // v2 header — the transport envelope matches luxfi/zap's NewBuilder default.
  const b = new Builder(c.cap.byteLength + c.payload.byteLength + reqFixedSize + 64, VERSION_2);
  const ob = b.startObject(reqFixedSize);
  ob.setU32(reqMethodOff, c.method);
  ob.setU32(reqPromiseIDOff, c.promiseID);
  ob.setU32(reqTargetOff, c.target);
  ob.setBytes(reqCapOff, c.cap);
  ob.setBytes(reqPayloadOff, c.payload);
  ob.finishAsRoot();
  return b.finishWithFlags(MSG_TYPE_ROUTER_BASE << 8);
}

/** A decoded response envelope. */
export interface Response {
  status: number;
  promiseID: number;
  body: Uint8Array;
}

/** View over a request envelope (used in tests / by an in-TS server, if any). */
class RequestView extends StructView {
  get method(): number {
    return this.u32(reqMethodOff);
  }
  get promiseID(): number {
    return this.u32(reqPromiseIDOff);
  }
  get target(): number {
    return this.u32(reqTargetOff);
  }
  get cap(): Uint8Array {
    return this.bytes(reqCapOff);
  }
  get payload(): Uint8Array {
    return this.bytes(reqPayloadOff);
  }
}

/** Decode a router-tagged request message into a Call. Mirrors parseRequest. */
export function parseRequest(msgBytes: Uint8Array): Call {
  const root = Message.parse(msgBytes).root();
  const r = new RequestView(root.data, root.offset);
  return {
    method: r.method,
    promiseID: r.promiseID,
    target: r.target,
    cap: r.cap,
    payload: r.payload,
  };
}

/** View over a response envelope. */
class ResponseView extends StructView {
  get status(): number {
    return this.u32(respStatusOff);
  }
  get promiseID(): number {
    return this.u32(respPromiseIDOff);
  }
  get body(): Uint8Array {
    return this.bytes(respBodyOff);
  }
}

/** Encode a status + body into a router-tagged response. Mirrors buildResponse. */
export function buildResponse(
  status: number,
  promiseID: number,
  body: Uint8Array,
): Uint8Array {
  // v2 header — matches luxfi/zap (the Go side builds responses with luxfi/zap).
  const b = new Builder(body.byteLength + respFixedSize + 64, VERSION_2);
  const ob = b.startObject(respFixedSize);
  ob.setU32(respStatusOff, status);
  ob.setU32(respPromiseIDOff, promiseID);
  ob.setBytes(respBodyOff, body);
  ob.finishAsRoot();
  return b.finishWithFlags(MSG_TYPE_ROUTER_BASE << 8);
}

/** Decode a router-tagged response message into a Response. Mirrors parseResponse. */
export function parseResponse(msgBytes: Uint8Array): Response {
  const root = Message.parse(msgBytes).root();
  const r = new ResponseView(root.data, root.offset);
  return { status: r.status, promiseID: r.promiseID, body: r.body };
}
