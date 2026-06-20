// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * wire.ts — the byte-level primitives of the ZAP wire format.
 *
 * Every multi-byte integer is little-endian. The header is 16 bytes:
 *
 *   [0..4)   magic   "ZAP\0"
 *   [4..6)   version u16   (= 1)
 *   [6..8)   flags   u16
 *   [8..12)  rootOffset u32  (absolute offset of the root object)
 *   [12..16) size    u32     (total message length)
 *
 * These constants and helpers are the single source of truth shared by the
 * StructView (read) and StructBuilder/Builder (write) layers. They mirror, byte
 * for byte, github.com/zap-proto/go (zap.go / builder.go) and the identical
 * github.com/luxfi/zap runtime — a buffer built here parses there and vice
 * versa. The matching round-trip is asserted in the package tests.
 */

/** Size of the ZAP message header in bytes. */
export const HEADER_SIZE = 16;

/** Object/list start alignment in bytes. */
export const ALIGNMENT = 8;

/**
 * Wire format versions. Both share an identical body layout — version is a
 * header tag only.
 *
 *   VERSION_1 — github.com/zap-proto/go default. The generated views/builders
 *               (caps, payloads, response bodies) emit v1; zap-proto/go's Parse
 *               accepts ONLY v1, so anything that crosses a zap-proto/go view
 *               MUST be v1 (capability buffers especially).
 *   VERSION_2 — github.com/luxfi/zap default (NewBuilder). The transport
 *               envelope emitted by luxfi/zap is v2. luxfi/zap's Parse accepts
 *               both v1 and v2.
 *
 * This runtime therefore: parses BOTH; emits v1 by default (Builder); emits v2
 * for the transport envelope (see envelope.ts). VERSION is the default-emit
 * value, kept for back-compat references.
 */
export const VERSION_1 = 1;
export const VERSION_2 = 2;
export const VERSION = VERSION_1;

/** Magic bytes: "ZAP\0". */
export const MAGIC = Uint8Array.of(0x5a, 0x41, 0x50, 0x00); // 'Z','A','P',0

/** Header flag bits (mirror zap.go FlagXxx). */
export const FLAG_NONE = 0;
export const FLAG_COMPRESSED = 1 << 0;
export const FLAG_ENCRYPTED = 1 << 1;
export const FLAG_SIGNED = 1 << 2;

// --- read helpers (over a DataView) -----------------------------------------

export function readU8(dv: DataView, pos: number): number {
  return dv.getUint8(pos);
}
export function readU16(dv: DataView, pos: number): number {
  return dv.getUint16(pos, true);
}
export function readU32(dv: DataView, pos: number): number {
  return dv.getUint32(pos, true);
}
export function readU64(dv: DataView, pos: number): bigint {
  return dv.getBigUint64(pos, true);
}
export function readI8(dv: DataView, pos: number): number {
  return dv.getInt8(pos);
}
export function readI16(dv: DataView, pos: number): number {
  return dv.getInt16(pos, true);
}
export function readI32(dv: DataView, pos: number): number {
  return dv.getInt32(pos, true);
}
export function readI64(dv: DataView, pos: number): bigint {
  return dv.getBigInt64(pos, true);
}
export function readF32(dv: DataView, pos: number): number {
  return dv.getFloat32(pos, true);
}
export function readF64(dv: DataView, pos: number): number {
  return dv.getFloat64(pos, true);
}

// --- write helpers (over a DataView) ----------------------------------------

export function writeU8(dv: DataView, pos: number, v: number): void {
  dv.setUint8(pos, v & 0xff);
}
export function writeU16(dv: DataView, pos: number, v: number): void {
  dv.setUint16(pos, v & 0xffff, true);
}
export function writeU32(dv: DataView, pos: number, v: number): void {
  dv.setUint32(pos, v >>> 0, true);
}
export function writeU64(dv: DataView, pos: number, v: bigint): void {
  dv.setBigUint64(pos, BigInt.asUintN(64, v), true);
}
export function writeI8(dv: DataView, pos: number, v: number): void {
  dv.setInt8(pos, v);
}
export function writeI16(dv: DataView, pos: number, v: number): void {
  dv.setInt16(pos, v, true);
}
export function writeI32(dv: DataView, pos: number, v: number): void {
  dv.setInt32(pos, v | 0, true);
}
export function writeI64(dv: DataView, pos: number, v: bigint): void {
  dv.setBigInt64(pos, BigInt.asIntN(64, v), true);
}
export function writeF32(dv: DataView, pos: number, v: number): void {
  dv.setFloat32(pos, v, true);
}
export function writeF64(dv: DataView, pos: number, v: number): void {
  dv.setFloat64(pos, v, true);
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** UTF-8 encode a string to bytes (matches Go []byte(string)). */
export function encodeUtf8(s: string): Uint8Array {
  return TEXT_ENCODER.encode(s);
}

/** UTF-8 decode bytes to a string (matches Go string([]byte)). */
export function decodeUtf8(b: Uint8Array): string {
  return TEXT_DECODER.decode(b);
}
