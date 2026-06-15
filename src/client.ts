// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * client.ts — minimal ZAP capability-RPC client over the luxfi/zap TCP
 * transport. This is what the console bridge uses to reach a Go service binary
 * (e.g. ui-customization on :9999).
 *
 * The transport framing is byte-identical to github.com/luxfi/zap node.go:
 *
 *   open:   dial TCP, send our NodeID handshake, read the peer's handshake.
 *           handshake frame = [len u32 LE][ZAP msg: 64-byte object, bytes
 *           0..n = UTF-8 nodeID, u32@60 = n], len = HEADER_SIZE+64 = 80.
 *
 *   call:   writeCorrelated → [len=(8+bodyLen) u32 LE][reqID u32 LE]
 *           [flag=ReqFlagReq(1) u32 LE][envelope bytes].
 *
 *   recv:   the peer's dispatch loop replies [len u32 LE][reqID u32 LE]
 *           [flag=ReqFlagResp(2) u32 LE][envelope bytes]; we correlate by reqID.
 *
 * Node-only (uses node:net). The browser never imports this — the browser posts
 * to the Next.js bridge, which holds the TCP connection.
 */

import { Socket } from "node:net";
import { Builder } from "./builder.js";
import { Message } from "./view.js";
import { VERSION_2 } from "./wire.js";
import {
  buildRequest,
  parseResponse,
  NO_TARGET,
  type Call,
  type Response,
} from "./envelope.js";

const REQ_FLAG_REQ = 1;
const REQ_FLAG_RESP = 2;
const MAX_FRAME = 10 * 1024 * 1024; // matches node.go 10MB cap
const MAX_NODEID_LEN = 60; // node_codec.go maxNodeIDLen

/** Encode the NodeID handshake message (node_codec.go EncodeNodeIDHandshake). */
function encodeNodeIDHandshake(nodeID: string): Uint8Array {
  // v2 header — luxfi/zap builds the handshake with NewBuilder (v2 default).
  const b = new Builder(128, VERSION_2);
  const obj = b.startObject(64);
  const idBytes = new TextEncoder().encode(nodeID);
  const n = Math.min(idBytes.byteLength, MAX_NODEID_LEN);
  for (let i = 0; i < n; i++) obj.setU8(i, idBytes[i]);
  obj.setU32(MAX_NODEID_LEN, n);
  obj.finishAsRoot();
  return b.finish();
}

/** Decode a peer NodeID handshake; returns the peer id or "" if malformed. */
function decodeNodeIDHandshake(data: Uint8Array): string {
  let msg: Message;
  try {
    msg = Message.parse(data);
  } catch {
    return "";
  }
  const root = msg.root();
  // Read u32 length at offset 60, then that many bytes from offset 0.
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const base = root.offset;
  if (base + MAX_NODEID_LEN + 4 > data.byteLength) return "";
  const idLen = dv.getUint32(base + MAX_NODEID_LEN, true);
  if (idLen === 0 || idLen > MAX_NODEID_LEN) return "";
  return new TextDecoder().decode(data.subarray(base, base + idLen));
}

/**
 * FrameReader incrementally parses length-prefixed frames out of a byte stream.
 * Each call to push() feeds new bytes; complete frames are yielded in order.
 */
class FrameReader {
  private chunks: Uint8Array[] = [];
  private size = 0;

  push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.size += chunk.byteLength;
  }

  /** Pull the next complete frame (payload after the 4-byte length), or null. */
  next(): Uint8Array | null {
    if (this.size < 4) return null;
    const buf = this.coalesce();
    const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true);
    if (len > MAX_FRAME) throw new Error("zap: frame too large");
    if (buf.byteLength < 4 + len) return null;
    const frame = buf.subarray(4, 4 + len);
    const rest = buf.subarray(4 + len);
    this.chunks = rest.byteLength > 0 ? [rest.slice()] : [];
    this.size = rest.byteLength;
    return frame.slice();
  }

  private coalesce(): Uint8Array {
    if (this.chunks.length === 1) return this.chunks[0];
    const out = new Uint8Array(this.size);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    this.chunks = [out];
    return out;
  }
}

/** Options for {@link ZapClient.connect}. */
export interface ConnectOptions {
  host: string;
  port: number;
  /** This client's node id (sent in the handshake; default "zap-ts-client"). */
  nodeID?: string;
  /** Connect timeout in ms (default 5000). */
  connectTimeoutMs?: number;
}

/**
 * ZapClient is a single TCP connection to a ZAP service. It performs the nodeID
 * handshake on connect, then ships correlated Call frames and resolves their
 * responses by reqID. One connection is strictly FIFO on the wire, matching the
 * Go node's per-connection dispatch loop.
 */
export class ZapClient {
  private socket: Socket;
  private reqID = 0;
  private readonly pending = new Map<number, (r: Response) => void>();
  private readonly reader = new FrameReader();
  private closed = false;
  private readonly cap: Uint8Array;

  private constructor(socket: Socket, cap: Uint8Array) {
    this.socket = socket;
    this.cap = cap;
    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("error", () => this.fail());
    socket.on("close", () => this.fail());
  }

  /**
   * Dial `host:port`, complete the handshake, and return a ready client. `cap`
   * is the opaque capability buffer shipped with every call (a zap-proto/go
   * Cap.Bytes()).
   */
  static async connect(opts: ConnectOptions, cap: Uint8Array): Promise<ZapClient> {
    const nodeID = opts.nodeID ?? "zap-ts-client";
    const socket = new Socket();
    socket.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error(`zap: connect ${opts.host}:${opts.port} timed out`)),
        opts.connectTimeoutMs ?? 5000,
      );
      socket.once("error", (err) => {
        clearTimeout(to);
        reject(err);
      });
      socket.connect(opts.port, opts.host, () => {
        clearTimeout(to);
        resolve();
      });
    });

    // Handshake: send ours, read theirs (each a length-prefixed frame).
    writeFrame(socket, encodeNodeIDHandshake(nodeID));
    const peerHandshake = await readOneFrame(socket);
    const peerID = decodeNodeIDHandshake(peerHandshake);
    if (peerID === "") {
      socket.destroy();
      throw new Error("zap: invalid peer handshake");
    }

    return new ZapClient(socket, cap);
  }

  private onData(chunk: Buffer): void {
    this.reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    for (;;) {
      let frame: Uint8Array | null;
      try {
        frame = this.reader.next();
      } catch {
        this.fail();
        return;
      }
      if (frame === null) break;
      // Correlated frame: [reqID u32][flag u32][body]. We only originate Calls,
      // so we only expect ReqFlagResp here.
      if (frame.byteLength < 8) continue;
      const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
      const reqID = dv.getUint32(0, true);
      const flag = dv.getUint32(4, true);
      if (flag !== REQ_FLAG_RESP) continue;
      const body = frame.subarray(8);
      const resolve = this.pending.get(reqID);
      if (!resolve) continue;
      this.pending.delete(reqID);
      try {
        resolve(parseResponse(body));
      } catch {
        // malformed response body — surface as a synthetic error response.
        resolve({ status: 500, promiseID: 0, body: new TextEncoder().encode('{"error":"malformed response"}') });
      }
    }
  }

  private fail(): void {
    if (this.closed) return;
    this.closed = true;
    const err = { status: 0, promiseID: 0, body: new TextEncoder().encode('{"error":"connection closed"}') };
    for (const [, resolve] of this.pending) resolve(err);
    this.pending.clear();
  }

  /**
   * Ship one Call and await its correlated response. The cap is injected from
   * the connection (every call carries the verified capability).
   */
  call(method: number, opts: { promiseID?: number; target?: number; payload?: Uint8Array } = {}): Promise<Response> {
    if (this.closed) return Promise.reject(new Error("zap: client closed"));
    this.reqID++;
    const reqID = this.reqID;
    const c: Call = {
      method,
      promiseID: opts.promiseID ?? reqID,
      target: opts.target ?? NO_TARGET,
      cap: this.cap,
      payload: opts.payload ?? new Uint8Array(0),
    };
    const envelope = buildRequest(c);
    return new Promise<Response>((resolve) => {
      this.pending.set(reqID, resolve);
      writeCorrelated(this.socket, reqID, REQ_FLAG_REQ, envelope);
    });
  }

  /** Close the connection. */
  close(): void {
    this.closed = true;
    this.socket.destroy();
  }
}

// --- frame writers (mirror node.go writeMessage / writeCorrelated) ----------

function writeFrame(socket: Socket, data: Uint8Array): void {
  const hdr = new Uint8Array(4);
  new DataView(hdr.buffer).setUint32(0, data.byteLength, true);
  socket.write(hdr);
  socket.write(data);
}

function writeCorrelated(socket: Socket, reqID: number, flag: number, body: Uint8Array): void {
  const hdr = new Uint8Array(12);
  const dv = new DataView(hdr.buffer);
  dv.setUint32(0, 8 + body.byteLength, true); // len = correlatedHeaderSize + body
  dv.setUint32(4, reqID, true);
  dv.setUint32(8, flag, true);
  socket.write(hdr);
  if (body.byteLength > 0) socket.write(body);
}

/** Read exactly one length-prefixed frame (used for the handshake reply). */
function readOneFrame(socket: Socket): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FrameReader();
    const onData = (chunk: Buffer) => {
      reader.push(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      let frame: Uint8Array | null;
      try {
        frame = reader.next();
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }
      if (frame !== null) {
        cleanup();
        resolve(frame);
      }
    };
    const onErr = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("zap: connection closed during handshake"));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onErr);
      socket.off("close", onClose);
    };
    socket.on("data", onData);
    socket.on("error", onErr);
    socket.on("close", onClose);
  });
}
