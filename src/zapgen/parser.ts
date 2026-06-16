// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * parser.ts — recursive-descent parser for the `.zap` schema DSL.
 *
 * Ported from the canonical Go zapgen
 * (github.com/zap-proto/go/cmd/zapgen/parser.go). The struct/type/alias grammar
 * is unchanged so both parsers accept exactly the same struct schemas. This
 * file ADDS the service grammar:
 *
 *   interface MyService {
 *     method1(in: InputStruct) returns (out: OutputStruct)
 *     method2() returns ()
 *     method3(req: Request)
 *   }
 *
 * Method ordinals are auto-assigned 1, 2, 3, ... by declaration order.
 */

import { TypeKind } from "./schema.js";
import type {
  File,
  Interface,
  Method,
  Param,
  Struct,
  Field,
  Type,
} from "./schema.js";

/** filepathBase returns the final path element of name. */
function filepathBase(name: string): string {
  for (let i = name.length - 1; i >= 0; i--) {
    if (name[i] === "/" || name[i] === "\\") return name.slice(i + 1);
  }
  return name;
}

const isLetter = (c: string): boolean =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isDigit = (c: string): boolean => c >= "0" && c <= "9";
const isIdentStart = (c: string): boolean => c === "_" || isLetter(c);
const isIdentRune = (c: string): boolean =>
  c === "_" || isLetter(c) || isDigit(c);

class Parser {
  private src: string;
  private pos = 0;
  private line = 1;
  private filename: string;
  private file: File;

  constructor(filename: string, src: string) {
    this.src = src;
    this.filename = filename;
    this.file = {
      package: "",
      source: filepathBase(filename),
      aliases: new Map<string, Type>(),
      structs: [],
      interfaces: [],
    };
  }

  private errf(msg: string): Error {
    return new Error(`${this.filename}:${this.line}: ${msg}`);
  }

  /** skipSpace advances past whitespace and # comments. */
  private skipSpace(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === "\n") {
        this.line++;
        this.pos++;
      } else if (c === " " || c === "\t" || c === "\r") {
        this.pos++;
      } else if (c === "#") {
        while (this.pos < this.src.length && this.src[this.pos] !== "\n") {
          this.pos++;
        }
      } else {
        return;
      }
    }
  }

  private peek(): string {
    return this.pos < this.src.length ? this.src[this.pos] : "\0";
  }

  /**
   * peekKeyword reports whether the upcoming bytes match keyword followed by a
   * non-identifier rune. Does not advance.
   */
  private peekKeyword(keyword: string): boolean {
    if (this.pos + keyword.length > this.src.length) return false;
    if (this.src.slice(this.pos, this.pos + keyword.length) !== keyword) {
      return false;
    }
    if (this.pos + keyword.length === this.src.length) return true;
    return !isIdentRune(this.src[this.pos + keyword.length]);
  }

  /** readIdent reads an identifier, or returns null if none is present. */
  private readIdent(): string | null {
    const start = this.pos;
    if (this.pos >= this.src.length || !isIdentStart(this.src[this.pos])) {
      return null;
    }
    this.pos++;
    while (this.pos < this.src.length && isIdentRune(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  /** readInt reads an unsigned integer. */
  private readInt(): number {
    const start = this.pos;
    while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
      this.pos++;
    }
    if (this.pos === start) throw this.errf("expected integer");
    const n = Number.parseInt(this.src.slice(start, this.pos), 10);
    if (!Number.isFinite(n)) throw this.errf("bad integer");
    return n;
  }

  /** expect consumes a literal; throws if it does not match. */
  private expect(lit: string): void {
    if (
      this.pos + lit.length > this.src.length ||
      this.src.slice(this.pos, this.pos + lit.length) !== lit
    ) {
      throw this.errf(`expected ${JSON.stringify(lit)}`);
    }
    for (let i = 0; i < lit.length; i++) {
      if (lit[i] === "\n") this.line++;
    }
    this.pos += lit.length;
  }

  /**
   * parseFile is the top-level entry. Grammar:
   *
   *   File        := PackageDecl (TypeAlias | Struct | Interface)*
   *   PackageDecl := 'package' Ident
   */
  parseFile(): File {
    this.skipSpace();
    if (!this.peekKeyword("package")) {
      throw this.errf("expected `package` declaration");
    }
    this.pos += "package".length;
    this.skipSpace();
    const name = this.readIdent();
    if (name === null) {
      throw this.errf("expected package name after `package`");
    }
    this.file.package = name;

    for (;;) {
      this.skipSpace();
      if (this.pos >= this.src.length) break;
      if (this.peekKeyword("struct")) {
        this.file.structs.push(this.parseStruct());
      } else if (this.peekKeyword("interface")) {
        this.file.interfaces.push(this.parseInterface());
      } else if (this.peekKeyword("type")) {
        this.parseAlias();
      } else {
        throw this.errf(
          "expected `struct`, `interface`, or `type` at top level",
        );
      }
    }
    return this.file;
  }

  /** parseAlias := 'type' Ident '=' Type */
  private parseAlias(): void {
    this.pos += "type".length;
    this.skipSpace();
    const name = this.readIdent();
    if (name === null) throw this.errf("expected alias name after `type`");
    this.skipSpace();
    this.expect("=");
    this.skipSpace();
    const t = this.parseType();
    if (this.file.aliases.has(name)) {
      throw this.errf(`duplicate type alias ${JSON.stringify(name)}`);
    }
    this.file.aliases.set(name, t);
  }

  /** parseStruct := 'struct' Ident '{' Field* '}' */
  private parseStruct(): Struct {
    this.pos += "struct".length;
    this.skipSpace();
    const name = this.readIdent();
    if (name === null) throw this.errf("expected struct name");
    this.skipSpace();
    this.expect("{");
    const s: Struct = { name, fields: [] };
    for (;;) {
      this.skipSpace();
      if (this.pos >= this.src.length) {
        throw this.errf(`unterminated struct ${JSON.stringify(name)}`);
      }
      if (this.src[this.pos] === "}") {
        this.pos++;
        return s;
      }
      s.fields.push(this.parseField());
    }
  }

  /** parseField := Ident Type '@' Int */
  private parseField(): Field {
    const name = this.readIdent();
    if (name === null) throw this.errf("expected field name");
    this.skipSpace();
    const t = this.parseType();
    this.skipSpace();
    this.expect("@");
    this.skipSpace();
    const offset = this.readInt();
    return { name, type: t, offset };
  }

  /**
   * parseInterface := 'interface' Ident '{' Method* '}'
   *
   * Methods are ordinal-numbered 1, 2, 3, ... in declaration order.
   */
  private parseInterface(): Interface {
    this.pos += "interface".length;
    this.skipSpace();
    const name = this.readIdent();
    if (name === null) throw this.errf("expected interface name");
    this.skipSpace();
    this.expect("{");
    const iface: Interface = { name, methods: [] };
    let ordinal = 1;
    for (;;) {
      this.skipSpace();
      if (this.pos >= this.src.length) {
        throw this.errf(`unterminated interface ${JSON.stringify(name)}`);
      }
      if (this.src[this.pos] === "}") {
        this.pos++;
        return iface;
      }
      iface.methods.push(this.parseMethod(ordinal));
      ordinal++;
    }
  }

  /**
   * parseMethod := Ident '(' Param? ')' ( 'returns' '(' Param? ')' )?
   *
   * Param := Ident ':' Ident   (name : StructTypeName)
   *
   * The request param list and the optional `returns` param list each hold at
   * most one struct param — ZAP method payloads are always a single struct.
   */
  private parseMethod(ordinal: number): Method {
    const name = this.readIdent();
    if (name === null) throw this.errf("expected method name");
    this.skipSpace();
    const request = this.parseParamList();
    this.skipSpace();
    let response: Param | undefined;
    if (this.peekKeyword("returns")) {
      this.pos += "returns".length;
      this.skipSpace();
      response = this.parseParamList() ?? undefined;
    }
    return {
      name,
      ordinal,
      request: request ?? undefined,
      response: response ?? undefined,
    };
  }

  /**
   * parseParamList parses `( name: StructType )` or `()`. Returns the single
   * Param, or null for the empty list. Throws on more than one param — a ZAP
   * method carries exactly one struct payload per direction.
   */
  private parseParamList(): Param | null {
    this.expect("(");
    this.skipSpace();
    if (this.src[this.pos] === ")") {
      this.pos++;
      return null;
    }
    const pname = this.readIdent();
    if (pname === null) throw this.errf("expected parameter name");
    this.skipSpace();
    this.expect(":");
    this.skipSpace();
    const tname = this.readIdent();
    if (tname === null) throw this.errf("expected parameter type");
    this.skipSpace();
    if (this.src[this.pos] === ",") {
      throw this.errf(
        "method params carry exactly one struct payload per direction",
      );
    }
    this.expect(")");
    return { name: pname, structName: tname };
  }

  /** parseType parses one type expression. */
  private parseType(): Type {
    if (this.peekKeyword("list")) {
      this.pos += "list".length;
      this.skipSpace();
      this.expect("<");
      this.skipSpace();
      const inner = this.parseType();
      this.skipSpace();
      this.expect(">");
      return { kind: TypeKind.List, listElem: inner };
    }
    if (this.peekKeyword("bytes_fixed")) {
      this.pos += "bytes_fixed".length;
      this.skipSpace();
      this.expect("[");
      this.skipSpace();
      const n = this.readInt();
      if (n <= 0) throw this.errf("bytes_fixed[N] must have N > 0");
      this.skipSpace();
      this.expect("]");
      return { kind: TypeKind.BytesFixed, fixedSize: n };
    }
    const prims: Array<[string, TypeKind]> = [
      ["bool", TypeKind.Bool],
      ["u8", TypeKind.U8],
      ["u16", TypeKind.U16],
      ["u32", TypeKind.U32],
      ["u64", TypeKind.U64],
      ["i8", TypeKind.I8],
      ["i16", TypeKind.I16],
      ["i32", TypeKind.I32],
      ["i64", TypeKind.I64],
      ["f32", TypeKind.F32],
      ["f64", TypeKind.F64],
      ["bytes", TypeKind.Bytes],
      ["text", TypeKind.Text],
    ];
    for (const [kw, kind] of prims) {
      if (this.peekKeyword(kw)) {
        this.pos += kw.length;
        return { kind };
      }
    }
    // User-defined name: alias or nested struct.
    const name = this.readIdent();
    if (name === null) {
      throw this.errf(`expected type, got ${JSON.stringify(this.peek())}`);
    }
    const alias = this.file.aliases.get(name);
    if (alias !== undefined) return alias;
    return { kind: TypeKind.Struct, structName: name };
  }
}

/** parse parses a .zap source file into a File AST. */
export function parse(filename: string, src: string): File {
  return new Parser(filename, src).parseFile();
}
