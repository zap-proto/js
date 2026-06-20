// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * schema.ts — the AST for the `.zap` schema DSL.
 *
 * Ported byte-for-byte from the canonical Go zapgen
 * (github.com/zap-proto/go/cmd/zapgen/schema.go) so the TS-native zapgen and
 * the Go zapgen agree on the struct wire model. The struct/field/type model is
 * unchanged; this file ADDS the `interface`/`method` service AST (Interface,
 * Method, Param) without touching the struct layout model.
 */

/** TypeKind enumerates the schema's primitive type tags. */
export enum TypeKind {
  Invalid = 0,
  Bool,
  U8,
  U16,
  U32,
  U64,
  I8,
  I16,
  I32,
  I64,
  F32,
  F64,
  Bytes, // variable-length bytes
  BytesFixed, // bytes_fixed[N]
  Text, // variable-length UTF-8
  List, // list<T>
  Struct, // nested struct
}

/** kindName returns the schema name of the kind. Used in error messages. */
export function kindName(k: TypeKind): string {
  switch (k) {
    case TypeKind.Bool:
      return "bool";
    case TypeKind.U8:
      return "u8";
    case TypeKind.U16:
      return "u16";
    case TypeKind.U32:
      return "u32";
    case TypeKind.U64:
      return "u64";
    case TypeKind.I8:
      return "i8";
    case TypeKind.I16:
      return "i16";
    case TypeKind.I32:
      return "i32";
    case TypeKind.I64:
      return "i64";
    case TypeKind.F32:
      return "f32";
    case TypeKind.F64:
      return "f64";
    case TypeKind.Bytes:
      return "bytes";
    case TypeKind.BytesFixed:
      return "bytes_fixed";
    case TypeKind.Text:
      return "text";
    case TypeKind.List:
      return "list";
    case TypeKind.Struct:
      return "struct";
    default:
      return "invalid";
  }
}

/**
 * Type is the resolved type of a field. Exactly one detail field carries the
 * type specifics: FixedSize (BytesFixed), ListElem (List), StructName (Struct).
 */
export interface Type {
  kind: TypeKind;
  fixedSize?: number; // bytes_fixed[N]
  listElem?: Type; // list<T>
  structName?: string; // nested struct by name
}

/**
 * slotSize returns the per-field byte width in the fixed section of an object.
 * Variable-length tails (bytes/text/list) occupy {relOff u32, length u32} = 8;
 * nested struct pointers occupy {relOff u32} = 4; bytes_fixed[N] occupies N
 * bytes inline. Mirrors Go Type.SlotSize.
 */
export function slotSize(t: Type): number {
  switch (t.kind) {
    case TypeKind.Bool:
    case TypeKind.U8:
    case TypeKind.I8:
      return 1;
    case TypeKind.U16:
    case TypeKind.I16:
      return 2;
    case TypeKind.U32:
    case TypeKind.I32:
    case TypeKind.F32:
      return 4;
    case TypeKind.U64:
    case TypeKind.I64:
    case TypeKind.F64:
      return 8;
    case TypeKind.BytesFixed:
      return t.fixedSize ?? 0;
    case TypeKind.Bytes:
    case TypeKind.Text:
    case TypeKind.List:
      return 8;
    case TypeKind.Struct:
      return 4;
    default:
      return 0;
  }
}

/**
 * Field is one struct field. Offset is author-controlled (the @N annotation in
 * the schema) and emitted as a generated constant.
 */
export interface Field {
  name: string;
  type: Type;
  offset: number;
}

/** Struct is one declared struct. */
export interface Struct {
  name: string;
  fields: Field[];
}

/**
 * Param is one method parameter (`name: Type`). Type is restricted to a struct
 * name at the service layer — method payloads are always ZAP structs.
 */
export interface Param {
  name: string;
  /** The struct type name this param carries, or "" for the empty param list. */
  structName: string;
}

/**
 * Method is one declared service method. Ordinal is auto-assigned 1, 2, 3, ...
 * by declaration order — stable wire compatibility: appending a method never
 * renumbers existing ones. `request` is the inbound param (at most one);
 * `response` is the returned param (at most one). Either may be absent.
 */
export interface Method {
  name: string;
  ordinal: number;
  request?: Param;
  response?: Param;
}

/** Interface is one declared service: a named set of ordinal-numbered methods. */
export interface Interface {
  name: string;
  methods: Method[];
}

/** File is the parsed contents of one .zap source file. */
export interface File {
  package: string;
  source: string; // basename of the input .zap file, for the // source: header
  aliases: Map<string, Type>; // alias name → resolved type
  structs: Struct[];
  interfaces: Interface[];
}
