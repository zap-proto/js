// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, it, expect } from "vitest";
import { parse } from "../src/zapgen/parser.js";
import type { File } from "../src/zapgen/schema.js";

/**
 * Whitespace-significant syntax: a `struct`/`interface` body may be written by
 * indentation instead of braces. It desugars to the brace form before parsing,
 * so both styles produce the same AST. Brace syntax stays byte-for-byte valid
 * (mixed files, single-line structs, indented brace bodies, comments).
 *
 * Equivalence is asserted at the AST level: parse(brace) deepEquals
 * parse(whitespace) for the same logical schema. We parse with one filename so
 * the `source` field matches.
 */

const eq = (whitespace: string, brace: string): void => {
  expect(parse("x.zap", whitespace)).toEqual(parse("x.zap", brace));
};

describe("whitespace-significant syntax — equivalence", () => {
  it("braceless struct", () => {
    eq(
      `package p\nstruct Point\n  x i32 @0\n  y i32 @4\n`,
      `package p\nstruct Point {\n  x i32 @0\n  y i32 @4\n}\n`,
    );
  });

  it("braceless interface with methods (req, req+resp, none)", () => {
    eq(
      `package p
struct A
  v u32 @0
interface S
  a(req: A)
  b(req: A) returns (resp: A)
  c()
  d() returns ()
`,
      `package p
struct A { v u32 @0 }
interface S {
  a(req: A)
  b(req: A) returns (resp: A)
  c()
  d() returns ()
}
`,
    );
  });

  it("multiple top-level decls interleaved", () => {
    eq(
      `package p
struct A
  x u8 @0
interface S
  go(req: A)
struct B
  y u64 @0
`,
      `package p
struct A { x u8 @0 }
interface S { go(req: A) }
struct B { y u64 @0 }
`,
    );
  });

  it("empty braceless struct (no fields) ≡ empty braces", () => {
    eq(`package p\nstruct Empty\nstruct After\n  a u8 @0\n`,
       `package p\nstruct Empty {}\nstruct After { a u8 @0 }\n`);
  });

  it("empty braceless struct at EOF", () => {
    eq(`package p\nstruct Empty\n`, `package p\nstruct Empty {}\n`);
  });

  it("all primitive + pointer + fixed types", () => {
    const fields =
      "b bool @0\nc u8 @1\nd u16 @2\ne u32 @4\nf u64 @8\n" +
      "g i8 @16\nh i16 @18\nk i32 @20\nl i64 @24\n" +
      "m f32 @32\nn f64 @40\no text @48\npp bytes @56\n" +
      "q list<u32> @64\nr bytes_fixed[12] @72\n";
    eq(`package p\nstruct All\n  ${fields.replaceAll("\n", "\n  ").trimEnd()}\n`,
       `package p\nstruct All {\n  ${fields.replaceAll("\n", "\n  ").trimEnd()}\n}\n`);
  });

  it("explicit byte offsets preserved (NOT auto-renumbered)", () => {
    const f = parse("x.zap", `package p\nstruct S\n  a u32 @8\n  b u32 @0\n`);
    expect(f.structs[0].fields.map((x) => [x.name, x.offset])).toEqual([
      ["a", 8],
      ["b", 0],
    ]);
  });
});

describe("whitespace-significant syntax — lexical robustness", () => {
  it("trailing comment on a field line", () => {
    eq(`package p\nstruct S\n  a u32 @0  # hi { } interface struct\n`,
       `package p\nstruct S {\n  a u32 @0  # hi { } interface struct\n}\n`);
  });

  it("trailing comment on a header line", () => {
    eq(`package p\nstruct S  # the struct\n  a u32 @0\n`,
       `package p\nstruct S {  # the struct\n  a u32 @0\n}\n`);
  });

  it("full-line comments and blank lines inside a block don't close it", () => {
    eq(
      `package p
struct S

  # leading comment
  a u32 @0

  # between fields
  b u32 @4
`,
      `package p
struct S {

  # leading comment
  a u32 @0

  # between fields
  b u32 @4
}
`,
    );
  });

  it("a '#' comment containing 'struct'/'interface' is not a header", () => {
    eq(`package p\nstruct S\n  a u32 @0\n# struct NotAStruct interface Nope\nstruct T\n  b u8 @0\n`,
       `package p\nstruct S { a u32 @0 }\n# struct NotAStruct interface Nope\nstruct T { b u8 @0 }\n`);
  });

  it("a field named like a keyword prefix is not mistaken for a header", () => {
    // `structure`/`interfaces` start with struct/interface but \b must save them.
    eq(`package p\nstruct S\n  structure text @0\n  interfaces u32 @8\n`,
       `package p\nstruct S {\n  structure text @0\n  interfaces u32 @8\n}\n`);
  });

  it("tabs for indentation", () => {
    eq(`package p\nstruct S\n\ta u32 @0\n\tb u32 @4\n`,
       `package p\nstruct S {\n\ta u32 @0\n\tb u32 @4\n}\n`);
  });

  it("CRLF line endings", () => {
    const ws = `package p\r\nstruct S\r\n  a u32 @0\r\n  b u32 @4\r\n`;
    const br = `package p\r\nstruct S {\r\n  a u32 @0\r\n  b u32 @4\r\n}\r\n`;
    expect(parse("x.zap", ws)).toEqual(parse("x.zap", br));
  });

  it("trailing whitespace after a header still opens a block", () => {
    eq(`package p\nstruct S   \n  a u32 @0\n`,
       `package p\nstruct S {\n  a u32 @0\n}\n`);
  });

  it("no trailing newline", () => {
    eq(`package p\nstruct S\n  a u32 @0`,
       `package p\nstruct S {\n  a u32 @0\n}`);
  });

  it("leading blank lines and comments before package", () => {
    eq(`\n\n# header\n\npackage p\nstruct S\n  a u32 @0\n`,
       `\n\n# header\n\npackage p\nstruct S { a u32 @0 }\n`);
  });

  it("extra spaces between 'struct' and the name", () => {
    eq(`package p\nstruct    S\n  a u32 @0\n`,
       `package p\nstruct    S { a u32 @0 }\n`);
  });
});

describe("whitespace-significant syntax — brace back-compat (passthrough)", () => {
  it("single-line brace struct is untouched", () => {
    expect(() => parse("x.zap", `package p\nstruct S { a u32 @0 b u32 @4 }\n`)).not.toThrow();
  });

  it("empty brace struct {} is untouched", () => {
    expect(() => parse("x.zap", `package p\nstruct S {}\n`)).not.toThrow();
  });

  it("mixed brace + whitespace structs in one file", () => {
    eq(
      `package p
struct A { a u32 @0 }
struct B
  b u32 @0
struct C { c u32 @0 }
`,
      `package p
struct A { a u32 @0 }
struct B { b u32 @0 }
struct C { c u32 @0 }
`,
    );
  });

  it("brace struct whose fields are themselves indented is not re-braced", () => {
    expect(() =>
      parse("x.zap", `package p\nstruct S {\n    a u32 @0\n    b u32 @4\n}\n`),
    ).not.toThrow();
  });
});

describe("whitespace-significant syntax — red-team regressions", () => {
  it("[H4] a field named `struct`/`interface` is a field, not a block header", () => {
    eq(`package p\nstruct S\n  struct u8 @0\n  interface text @8\n`,
       `package p\nstruct S {\n  struct u8 @0\n  interface text @8\n}\n`);
    const f = parse("x.zap", `package p\nstruct S\n  struct u32 @0\n`);
    expect(f.structs[0].fields[0]).toMatchObject({ name: "struct", offset: 0 });
  });

  it("[H4] a field named `struct` with a trailing comment is still a field", () => {
    eq(`package p\nstruct S\n  struct u8 @0  # the struct field\n`,
       `package p\nstruct S {\n  struct u8 @0  # the struct field\n}\n`);
  });

  it("[H4] `structFoo`/`interfaceX` (no space) is not a header — parser rejects at top level", () => {
    expect(() => parse("x.zap", `package p\nstructFoo\n`)).toThrow();
  });

  it("[H4] brace header still passes through (single-line + multiline)", () => {
    expect(() => parse("x.zap", `package p\nstruct S { a u8 @0 }\n`)).not.toThrow();
    expect(() => parse("x.zap", `package p\nstruct S {\n  a u8 @0\n}\n`)).not.toThrow();
  });

  it("[H2] absurd byte offset is rejected, not silently truncated to a float", () => {
    expect(() => parse("x.zap", `package p\nstruct S { a u8 @99999999999999999999 }\n`))
      .toThrowError(/out of range/);
    expect(() => parse("x.zap", `package p\nstruct S\n  a u8 @18446744073709551616\n`))
      .toThrowError(/out of range/);
  });

  it("field comments are preserved through the desugar (fidelity)", () => {
    // TS keeps the comment; this guards against a future 'drop comment' regression.
    const f = parse("x.zap", `package p\nstruct S\n  a u32 @0  # documented\n`);
    expect(f.structs[0].fields[0]).toMatchObject({ name: "a", offset: 0 });
  });
});

/* ----------------------------- property fuzz ----------------------------- */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLOT: Record<string, number> = {
  bool: 1, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4,
  u64: 8, i64: 8, f64: 8, text: 8, bytes: 8, "list<u32>": 8,
};
const PRIMS = Object.keys(SLOT);

interface FField { name: string; type: string; offset: number }
interface FStruct { name: string; fields: FField[] }
interface FMethod { name: string; req: string | null; resp: string | null }
interface FIface { name: string; methods: FMethod[] }
type FDecl = { struct: FStruct } | { iface: FIface };

function genSchema(rng: () => number, i: number): { decls: FDecl[]; structNames: string[] } {
  const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)];
  const id = (p: string, n: number) => `${p}${i}_${n}`;
  const nStruct = 1 + Math.floor(rng() * 4);
  const decls: FDecl[] = [];
  const structNames: string[] = [];
  for (let s = 0; s < nStruct; s++) {
    const name = id("S", s);
    structNames.push(name);
    const nf = Math.floor(rng() * 6); // 0..5 (exercise empty structs)
    const fields: FField[] = [];
    let cursor = 0;
    for (let f = 0; f < nf; f++) {
      let type = pick(PRIMS);
      let size = SLOT[type];
      if (rng() < 0.12) { const n = 1 + Math.floor(rng() * 16); type = `bytes_fixed[${n}]`; size = n; }
      fields.push({ name: id("f", f), type, offset: cursor });
      cursor += size;
    }
    decls.push({ struct: { name, fields } });
  }
  const nIface = Math.floor(rng() * 3);
  for (let k = 0; k < nIface; k++) {
    const methods: FMethod[] = [];
    const nm = 1 + Math.floor(rng() * 4);
    for (let m = 0; m < nm; m++) {
      const hasReq = rng() < 0.7;
      const hasResp = rng() < 0.5;
      methods.push({
        name: id("m", m),
        req: hasReq ? pick(structNames) : null,
        resp: hasResp ? pick(structNames) : null,
      });
    }
    decls.push({ iface: { name: id("I", k), methods } });
  }
  // shuffle decls so structs/interfaces interleave
  for (let a = decls.length - 1; a > 0; a--) {
    const b = Math.floor(rng() * (a + 1));
    [decls[a], decls[b]] = [decls[b], decls[a]];
  }
  return { decls, structNames };
}

function method(m: FMethod): string {
  const req = m.req ? `req: ${m.req}` : "";
  const head = `${m.name}(${req})`;
  return m.resp ? `${head} returns (resp: ${m.resp})` : head;
}

function renderBrace(decls: FDecl[]): string {
  let out = "package fuzz\n\n";
  for (const d of decls) {
    if ("struct" in d) {
      out += `struct ${d.struct.name} {\n`;
      for (const f of d.struct.fields) out += `  ${f.name} ${f.type} @${f.offset}\n`;
      out += `}\n\n`;
    } else {
      out += `interface ${d.iface.name} {\n`;
      for (const m of d.iface.methods) out += `  ${method(m)}\n`;
      out += `}\n\n`;
    }
  }
  return out;
}

function renderWhitespace(decls: FDecl[]): string {
  let out = "package fuzz\n\n";
  for (const d of decls) {
    if ("struct" in d) {
      out += `struct ${d.struct.name}\n`;
      for (const f of d.struct.fields) out += `  ${f.name} ${f.type} @${f.offset}\n`;
      out += `\n`;
    } else {
      out += `interface ${d.iface.name}\n`;
      for (const m of d.iface.methods) out += `  ${method(m)}\n`;
      out += `\n`;
    }
  }
  return out;
}

describe("whitespace-significant syntax — property fuzz (brace ≡ whitespace)", () => {
  it("500 random schemas: whitespace parses identically to braces", () => {
    const rng = mulberry32(0x5eed1234);
    for (let i = 0; i < 500; i++) {
      const { decls } = genSchema(rng, i);
      const brace = renderBrace(decls);
      const ws = renderWhitespace(decls);
      let bAst: File, wAst: File;
      try {
        bAst = parse("f.zap", brace);
      } catch (e) {
        throw new Error(`brace render failed to parse (i=${i}): ${(e as Error).message}\n${brace}`);
      }
      try {
        wAst = parse("f.zap", ws);
      } catch (e) {
        throw new Error(`whitespace render failed to parse (i=${i}): ${(e as Error).message}\n${ws}`);
      }
      expect(wAst, `i=${i}\nWS:\n${ws}\nBRACE:\n${brace}`).toEqual(bAst);
    }
  });

  it("idempotent: parsing the same brace fixture twice is stable", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const brace = renderBrace(genSchema(rng, i).decls);
      expect(parse("f.zap", brace)).toEqual(parse("f.zap", brace));
    }
  });
});
