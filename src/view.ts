// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * view.ts — zero-copy read side of the ZAP runtime.
 *
 *   Message    — a parsed buffer (header validated), yields the root view.
 *   StructView — base class for generated views: a DataView + base offset,
 *                getters by field offset that delegate to wire.ts.
 *   ListView   — a list field; element accessors mirror Go's List.
 *
 * Read semantics are byte-identical to github.com/zap-proto/go (zap.go) and
 * github.com/luxfi/zap. Bounds checks return the zero value (0 / empty) rather
 * than throwing, matching the Go runtime's defensive reads — except header
 * validation in Message.parse, which throws (the analogue of Parse's error).
 */

import {
  HEADER_SIZE,
  MAGIC,
  VERSION_1,
  VERSION_2,
  readU8,
  readU16,
  readU32,
  readU64,
  readI8,
  readI16,
  readI32,
  readI64,
  readF32,
  readF64,
  decodeUtf8,
} from "./wire.js";

/** Thrown by Message.parse when the wire-level header checks fail. */
export class ZapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZapParseError";
  }
}

/** A parsed ZAP message: a byte buffer whose header has been validated. */
export class Message {
  readonly data: Uint8Array;
  private readonly dv: DataView;

  private constructor(data: Uint8Array) {
    this.data = data;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Parse `b`, validating magic, version, and size. The returned Message
   * aliases `b` (no copy) truncated to the header's declared size. Throws
   * {@link ZapParseError} on any check failure — the TS analogue of the Go
   * Parse returning (nil, err).
   */
  static parse(b: Uint8Array): Message {
    if (b.byteLength < HEADER_SIZE) {
      throw new ZapParseError("zap: buffer too small");
    }
    if (
      b[0] !== MAGIC[0] ||
      b[1] !== MAGIC[1] ||
      b[2] !== MAGIC[2] ||
      b[3] !== MAGIC[3]
    ) {
      throw new ZapParseError("zap: invalid magic bytes");
    }
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const version = dv.getUint16(4, true);
    // Accept both v1 (zap-proto/go bodies) and v2 (luxfi/zap envelopes); the
    // body layout is identical, version is a header tag. Mirrors luxfi/zap
    // Parse, which accepts {Version1, Version2}.
    if (version !== VERSION_1 && version !== VERSION_2) {
      throw new ZapParseError(`zap: unsupported version ${version}`);
    }
    const size = dv.getUint32(12, true);
    if (size < HEADER_SIZE || size > b.byteLength) {
      throw new ZapParseError("zap: buffer too small for declared size");
    }
    return new Message(b.subarray(0, size));
  }

  /** Header flags (bytes [6..8)). */
  flags(): number {
    return this.dv.getUint16(6, true);
  }

  /** Total message size (bytes [12..16)). */
  size(): number {
    return this.dv.getUint32(12, true);
  }

  /** The root object view (offset from header bytes [8..12)). */
  root(): StructView {
    const offset = this.dv.getUint32(8, true);
    return new RootView(this.data, offset);
  }
}

/**
 * StructView is the base class generated views extend. It holds the message's
 * full byte buffer (`data`) and this object's base `offset`. Field getters add
 * the field offset to `offset` and read via wire.ts. Nested objects/lists
 * resolve forward pointers exactly as the Go Object does.
 *
 * Generated subclasses are constructed with (data, offset); see the codegen
 * `static wrap()` and nested-field getters.
 */
export abstract class StructView {
  readonly data: Uint8Array;
  readonly offset: number;
  protected readonly dv: DataView;

  constructor(data: Uint8Array, offset: number) {
    this.data = data;
    this.offset = offset;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /** True when this view points at the null object (offset 0). */
  isNull(): boolean {
    return this.offset === 0;
  }

  protected bool(fieldOffset: number): boolean {
    return this.u8(fieldOffset) !== 0;
  }
  protected u8(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos >= this.data.byteLength) return 0;
    return readU8(this.dv, pos);
  }
  protected u16(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 2 > this.data.byteLength) return 0;
    return readU16(this.dv, pos);
  }
  protected u32(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 4 > this.data.byteLength) return 0;
    return readU32(this.dv, pos);
  }
  protected u64(fieldOffset: number): bigint {
    const pos = this.offset + fieldOffset;
    if (pos + 8 > this.data.byteLength) return 0n;
    return readU64(this.dv, pos);
  }
  protected i8(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos >= this.data.byteLength) return 0;
    return readI8(this.dv, pos);
  }
  protected i16(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 2 > this.data.byteLength) return 0;
    return readI16(this.dv, pos);
  }
  protected i32(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 4 > this.data.byteLength) return 0;
    return readI32(this.dv, pos);
  }
  protected i64(fieldOffset: number): bigint {
    const pos = this.offset + fieldOffset;
    if (pos + 8 > this.data.byteLength) return 0n;
    return readI64(this.dv, pos);
  }
  protected f32(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 4 > this.data.byteLength) return 0;
    return readF32(this.dv, pos);
  }
  protected f64(fieldOffset: number): number {
    const pos = this.offset + fieldOffset;
    if (pos + 8 > this.data.byteLength) return 0;
    return readF64(this.dv, pos);
  }

  /**
   * bytesFixed returns a `length`-byte slice inline at `fieldOffset`. The slice
   * aliases the underlying buffer; callers MUST NOT mutate it. Out-of-bounds
   * yields an empty slice (matches Go BytesFixed returning nil).
   */
  protected bytesFixed(fieldOffset: number, length: number): Uint8Array {
    if (length <= 0) return new Uint8Array(0);
    const pos = this.offset + fieldOffset;
    if (pos < 0 || pos + length > this.data.byteLength) return new Uint8Array(0);
    return this.data.subarray(pos, pos + length);
  }

  /**
   * bytes returns a variable-length byte field: a {relOffset u32, length u32}
   * slot whose data lives at pos+relOffset. relOffset 0 means null. Aliases the
   * buffer; do not mutate.
   */
  protected bytes(fieldOffset: number): Uint8Array {
    const pos = this.offset + fieldOffset;
    if (pos + 4 > this.data.byteLength) return new Uint8Array(0);
    const relOffset = readU32(this.dv, pos);
    if (relOffset === 0) return new Uint8Array(0);
    const lenPos = pos + 4;
    if (lenPos + 4 > this.data.byteLength) return new Uint8Array(0);
    const length = readU32(this.dv, lenPos);
    const absPos = pos + relOffset;
    if (absPos < 0 || absPos + length > this.data.byteLength)
      return new Uint8Array(0);
    return this.data.subarray(absPos, absPos + length);
  }

  /** text returns a UTF-8 string from a variable-length bytes slot. */
  protected text(fieldOffset: number): string {
    const b = this.bytes(fieldOffset);
    if (b.byteLength === 0) return "";
    return decodeUtf8(b);
  }

  /**
   * object resolves a nested-struct pointer ({relOffset u32}) and returns a
   * RootView at the target. relOffset 0 (null) yields a null view (offset 0).
   * relOffset is SIGNED (a nested object may have finalized earlier in the
   * buffer), matching the Go Object resolution.
   */
  protected object(fieldOffset: number): StructView {
    const pos = this.offset + fieldOffset;
    if (pos + 4 > this.data.byteLength) return new RootView(this.data, 0);
    const relOffset = readI32(this.dv, pos);
    if (relOffset === 0) return new RootView(this.data, 0);
    const absOffset = pos + relOffset;
    if (absOffset < 0 || absOffset >= this.data.byteLength)
      return new RootView(this.data, 0);
    return new RootView(this.data, absOffset);
  }

  /**
   * list resolves a list field ({relOffset u32, length u32}) and returns a
   * ListView. relOffset 0 (null) yields an empty list.
   */
  protected list(fieldOffset: number): ListView {
    const pos = this.offset + fieldOffset;
    if (pos + 8 > this.data.byteLength) return new ListView(this.data, 0, 0);
    const relOffset = readI32(this.dv, pos);
    if (relOffset === 0) return new ListView(this.data, 0, 0);
    const length = readU32(this.dv, pos + 4);
    const absOffset = pos + relOffset;
    if (absOffset < 0 || absOffset >= this.data.byteLength)
      return new ListView(this.data, 0, 0);
    return new ListView(this.data, absOffset, length);
  }
}

/** A concrete StructView with no typed fields — used for roots and nested objects. */
class RootView extends StructView {}

/**
 * ListView is a read view over a ZAP list. Two element shapes exist on the
 * wire (mirroring the two ListBuilder paths in Go):
 *
 *   - flat scalar lists (u8/u32/u64): packed elements; use {@link u32}/{@link u64}.
 *   - variable-element lists (`list<struct>`, `list<text>`, `list<bytes>`): each
 *     element is `{len u32}{bytes}` (AddObjectBytes); use {@link objectAt} /
 *     {@link bytesAt} / {@link textAt}. `length` is the ELEMENT count.
 */
export class ListView {
  readonly data: Uint8Array;
  readonly offset: number;
  readonly length: number;
  private readonly dv: DataView;

  constructor(data: Uint8Array, offset: number, length: number) {
    this.data = data;
    this.offset = offset;
    this.length = length;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  /** Element count (spec name `length`; Go alias Len()/Length()). */
  len(): number {
    return this.length;
  }

  isNull(): boolean {
    return this.offset === 0;
  }

  /** i-th uint32 element of a flat scalar list. */
  u32(i: number): number {
    if (i < 0 || i >= this.length) return 0;
    const pos = this.offset + i * 4;
    if (pos + 4 > this.data.byteLength) return 0;
    return readU32(this.dv, pos);
  }

  /** i-th uint64 element of a flat scalar list. */
  u64(i: number): bigint {
    if (i < 0 || i >= this.length) return 0n;
    const pos = this.offset + i * 8;
    if (pos + 8 > this.data.byteLength) return 0n;
    return readU64(this.dv, pos);
  }

  /**
   * i-th raw-bytes element of a variable-element list. Walks the {len u32}{data}
   * framing from the list start. Aliases the buffer; do not mutate. Mirrors Go
   * List.BytesAt.
   */
  bytesAt(i: number): Uint8Array {
    if (i < 0 || i >= this.length) return new Uint8Array(0);
    let p = this.offset;
    for (let k = 0; k < i; k++) {
      if (p + 4 > this.data.byteLength) return new Uint8Array(0);
      const sz = readU32(this.dv, p);
      p += 4 + sz;
    }
    if (p + 4 > this.data.byteLength) return new Uint8Array(0);
    const sz = readU32(this.dv, p);
    const start = p + 4;
    const end = start + sz;
    if (end > this.data.byteLength) return new Uint8Array(0);
    return this.data.subarray(start, end);
  }

  /** i-th element decoded as UTF-8 text (variable-element list). */
  textAt(i: number): string {
    const b = this.bytesAt(i);
    if (b.byteLength === 0) return "";
    return decodeUtf8(b);
  }

  /**
   * i-th element parsed as a nested ZAP object (variable-element list of
   * structs). Each element sub-buffer is a self-contained ZAP message; the
   * caller wraps the returned view's (data, offset) in the generated type.
   * Mirrors Go List.ObjectAt. Returns a null view on any bounds/parse failure.
   */
  objectAt(i: number): StructView {
    const b = this.bytesAt(i);
    if (b.byteLength === 0) return new RootView(this.data, 0);
    let sub: Message;
    try {
      sub = Message.parse(b);
    } catch {
      return new RootView(this.data, 0);
    }
    return sub.root();
  }

  /** Decode an entire variable-element text list to a string[]. */
  toStringArray(): string[] {
    const out: string[] = new Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.textAt(i);
    return out;
  }
}
