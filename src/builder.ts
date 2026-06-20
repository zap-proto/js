// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * builder.ts — write side of the ZAP runtime.
 *
 *   Builder        — owns the growing output buffer + write cursor; writes the
 *                    16-byte header; vends StructBuilder (objects) and
 *                    ListBuilder (lists); finish() patches root offset + size.
 *   StructBuilder  — one object's fixed section; setX writes a field; finish()
 *                    flushes deferred variable-length tails and patches their
 *                    relative offsets.
 *   ListBuilder    — appends variable-length elements ({len u32}{data}).
 *
 * The byte layout is identical to github.com/zap-proto/go (builder.go) and
 * github.com/luxfi/zap: same header, same 8-byte object/list alignment, same
 * pre-extend-the-fixed-section discipline, same deferred-tail offset patching.
 * A buffer produced here parses through the Go runtime unchanged.
 */

import {
  HEADER_SIZE,
  ALIGNMENT,
  MAGIC,
  VERSION_1,
  encodeUtf8,
  writeU8,
  writeU16,
  writeU32,
  writeU64,
  writeI8,
  writeI16,
  writeI32,
  writeI64,
  writeF32,
  writeF64,
} from "./wire.js";

export class Builder {
  private buf: Uint8Array;
  private dv: DataView;
  /** Write cursor; starts past the header. */
  pos: number;
  private rootOffset = 0;

  /**
   * @param capacity initial buffer size (grows as needed).
   * @param version header version to emit. Default VERSION_1 — the generated
   *   views/builders produce zap-proto/go-compatible v1 bytes (caps, payloads,
   *   bodies). The transport envelope passes VERSION_2 to match luxfi/zap.
   */
  constructor(capacity = 256, version: number = VERSION_1) {
    if (capacity < HEADER_SIZE) capacity = 256;
    this.buf = new Uint8Array(capacity);
    this.dv = new DataView(this.buf.buffer);
    // Magic + version into the header; flags/root/size patched at finish.
    this.buf.set(MAGIC, 0);
    this.dv.setUint16(4, version, true);
    this.pos = HEADER_SIZE;
  }

  /** Internal: ensure capacity for n more bytes past pos (doubles, like Go grow). */
  private grow(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    let newCap = this.buf.byteLength * 2;
    if (newCap < this.pos + n) newCap = this.pos + n;
    const next = new Uint8Array(newCap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.dv = new DataView(this.buf.buffer);
  }

  /** Align the cursor to `alignment`, zero-filling the padding. */
  private align(alignment: number): void {
    const padding = (alignment - (this.pos % alignment)) % alignment;
    this.grow(padding);
    for (let i = 0; i < padding; i++) this.buf[this.pos++] = 0;
  }

  /** The live DataView (StructBuilder/ListBuilder write through this). */
  view(): DataView {
    return this.dv;
  }

  /** The live byte buffer (StructBuilder copies bytes through this). */
  bytes(): Uint8Array {
    return this.buf;
  }

  /** Ensure `endPos` bytes exist (grown + zero-filled), advancing pos. */
  ensure(endPos: number): void {
    if (endPos > this.pos) {
      this.grow(endPos - this.pos);
      // Newly grown bytes are already zero (fresh Uint8Array); but when
      // endPos extends within existing capacity past pos, those bytes are
      // also already zero from allocation. Just advance the cursor.
      this.pos = endPos;
    }
  }

  /** Current cursor position. */
  position(): number {
    return this.pos;
  }

  /** Advance the cursor by n (used after copying deferred data). */
  advance(n: number): void {
    this.pos += n;
  }

  /**
   * Start an object with the given fixed-section size. The buffer is pre-
   * extended and zero-filled to startPos+dataSize so later list/bytes tails
   * append after the fixed section, never interleaving with not-yet-written
   * fixed fields (mirrors Go StartObject's reservation).
   */
  startObject(dataSize: number): StructBuilder {
    this.align(ALIGNMENT);
    const ob = new StructBuilder(this, this.pos, dataSize);
    ob.ensureField(dataSize);
    return ob;
  }

  /** Start a list. Element framing is supplied by the caller (addObjectBytes). */
  startList(): ListBuilder {
    this.align(ALIGNMENT);
    return new ListBuilder(this, this.pos);
  }

  /** Set the message root offset (called by StructBuilder.finishAsRoot). */
  setRoot(offset: number): void {
    this.rootOffset = offset;
  }

  /** Finalize: patch root offset + total size; return the message bytes. */
  finish(): Uint8Array {
    this.dv.setUint32(8, this.rootOffset >>> 0, true);
    this.dv.setUint32(12, this.pos >>> 0, true);
    return this.buf.subarray(0, this.pos);
  }

  /** Finalize with explicit header flags (sets flags, then finish). */
  finishWithFlags(flags: number): Uint8Array {
    this.dv.setUint16(6, flags & 0xffff, true);
    return this.finish();
  }
}

/** A deferred variable-length tail: data to write + the field whose relOffset to patch. */
interface DeferredEntry {
  fieldOffset: number;
  data: Uint8Array;
}

export class StructBuilder {
  private readonly b: Builder;
  private readonly startPos: number;
  private readonly dataSize: number;
  private readonly deferred: DeferredEntry[] = [];

  constructor(b: Builder, startPos: number, dataSize: number) {
    this.b = b;
    this.startPos = startPos;
    this.dataSize = dataSize;
  }

  /** Ensure the buffer covers this object's field at [startPos, startPos+endOffset). */
  ensureField(endOffset: number): void {
    this.b.ensure(this.startPos + endOffset);
  }

  private dv(): DataView {
    return this.b.view();
  }

  setBool(fieldOffset: number, v: boolean): void {
    this.setU8(fieldOffset, v ? 1 : 0);
  }
  setU8(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 1);
    writeU8(this.dv(), this.startPos + fieldOffset, v);
  }
  setU16(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 2);
    writeU16(this.dv(), this.startPos + fieldOffset, v);
  }
  setU32(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 4);
    writeU32(this.dv(), this.startPos + fieldOffset, v);
  }
  setU64(fieldOffset: number, v: bigint): void {
    this.ensureField(fieldOffset + 8);
    writeU64(this.dv(), this.startPos + fieldOffset, v);
  }
  setI8(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 1);
    writeI8(this.dv(), this.startPos + fieldOffset, v);
  }
  setI16(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 2);
    writeI16(this.dv(), this.startPos + fieldOffset, v);
  }
  setI32(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 4);
    writeI32(this.dv(), this.startPos + fieldOffset, v);
  }
  setI64(fieldOffset: number, v: bigint): void {
    this.ensureField(fieldOffset + 8);
    writeI64(this.dv(), this.startPos + fieldOffset, v);
  }
  setF32(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 4);
    writeF32(this.dv(), this.startPos + fieldOffset, v);
  }
  setF64(fieldOffset: number, v: number): void {
    this.ensureField(fieldOffset + 8);
    writeF64(this.dv(), this.startPos + fieldOffset, v);
  }

  /** Set a UTF-8 text field (encodes then defers like setBytes). */
  setText(fieldOffset: number, v: string): void {
    this.setBytes(fieldOffset, encodeUtf8(v));
  }

  /**
   * Set a variable-length bytes field. Writes the length now into the
   * {relOffset u32, length u32} slot; the data + relOffset are emitted after
   * the fixed section in finish(). Empty → null slot (both words zero).
   * Mirrors Go SetBytes exactly.
   */
  setBytes(fieldOffset: number, v: Uint8Array): void {
    this.ensureField(fieldOffset + 8);
    if (v.byteLength === 0) {
      writeU32(this.dv(), this.startPos + fieldOffset, 0);
      writeU32(this.dv(), this.startPos + fieldOffset + 4, 0);
      return;
    }
    this.deferred.push({ fieldOffset, data: v.slice() }); // copy, like Go
    writeU32(this.dv(), this.startPos + fieldOffset + 4, v.byteLength);
  }

  /**
   * Set a fixed-width inline bytes field at fieldOffset. Empty is a no-op (slot
   * keeps its zero value). Mirrors Go SetBytesFixed.
   */
  setBytesFixed(fieldOffset: number, v: Uint8Array): void {
    if (v.byteLength === 0) return;
    this.ensureField(fieldOffset + v.byteLength);
    this.b.bytes().set(v, this.startPos + fieldOffset);
  }

  /**
   * Set a nested-object pointer ({relOffset u32}) to an already-finalized
   * object at absolute `objOffset`. relOffset is signed = objOffset - fieldAbs.
   * objOffset 0 → null. Mirrors Go SetObject.
   */
  setObject(fieldOffset: number, objOffset: number): void {
    this.ensureField(fieldOffset + 4);
    if (objOffset === 0) {
      writeU32(this.dv(), this.startPos + fieldOffset, 0);
      return;
    }
    const relOffset = objOffset - (this.startPos + fieldOffset);
    writeI32(this.dv(), this.startPos + fieldOffset, relOffset);
  }

  /**
   * Set a list pointer ({relOffset u32, length u32}). listOffset is the list's
   * absolute start; length is the element count. Zero offset or length → null
   * slot. Mirrors Go SetList.
   */
  setList(fieldOffset: number, listOffset: number, length: number): void {
    this.ensureField(fieldOffset + 8);
    if (listOffset === 0 || length === 0) {
      writeU32(this.dv(), this.startPos + fieldOffset, 0);
      writeU32(this.dv(), this.startPos + fieldOffset + 4, 0);
      return;
    }
    const relOffset = listOffset - (this.startPos + fieldOffset);
    writeI32(this.dv(), this.startPos + fieldOffset, relOffset);
    writeU32(this.dv(), this.startPos + fieldOffset + 4, length);
  }

  /**
   * Finalize the object: ensure the fixed section, then append each deferred
   * tail at the current cursor and patch its relOffset = dataPos - fieldAbs.
   * Returns this object's absolute start offset. Mirrors Go ObjectBuilder.Finish.
   */
  finish(): number {
    this.ensureField(this.dataSize);
    for (const entry of this.deferred) {
      const dataPos = this.b.position();
      // ensure() may reallocate the backing buffer; fetch bytes()/view() AFTER.
      this.b.ensure(dataPos + entry.data.byteLength);
      this.b.bytes().set(entry.data, dataPos);
      const fieldAbs = this.startPos + entry.fieldOffset;
      const relOffset = dataPos - fieldAbs;
      writeI32(this.b.view(), fieldAbs, relOffset);
    }
    return this.startPos;
  }

  /** Finalize and set as the message root. */
  finishAsRoot(): number {
    const offset = this.finish();
    this.b.setRoot(offset);
    return offset;
  }
}

export class ListBuilder {
  private readonly b: Builder;
  private readonly startPos: number;
  private count = 0;

  constructor(b: Builder, startPos: number) {
    this.b = b;
    this.startPos = startPos;
  }

  /**
   * Append one variable-length element: a 4-byte LE length prefix followed by
   * the data. Increments the element count by 1. Mirrors Go AddObjectBytes —
   * the matching reader is ListView.objectAt / bytesAt / textAt.
   */
  addObjectBytes(data: Uint8Array): void {
    const lenPos = this.b.position();
    this.b.ensure(lenPos + 4 + data.byteLength);
    writeU32(this.b.view(), lenPos, data.byteLength);
    this.b.bytes().set(data, lenPos + 4);
    this.count++;
  }

  /** The list's start offset (count tracked separately, passed to setList). */
  finishOffset(): number {
    return this.startPos;
  }

  /** The element count appended so far. */
  finishCount(): number {
    return this.count;
  }
}
