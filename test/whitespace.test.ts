// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, it, expect } from "vitest";
import { parse } from "../src/zapgen/parser.js";

/**
 * Whitespace-significant syntax: a `struct`/`interface` body may be written by
 * indentation instead of braces. It desugars to the brace form, so both
 * styles parse to the same AST. Brace syntax stays byte-for-byte valid.
 */
describe("whitespace-significant syntax", () => {
  const brace = `package demo

struct Point {
  x i32 @0
  y i32 @4
}

interface Echo {
  ping(req: Point) returns (resp: Point)
}
`;

  const ws = `package demo

struct Point
  x i32 @0
  y i32 @4

interface Echo
  ping(req: Point) returns (resp: Point)
`;

  it("offside (braceless) blocks parse to the same AST as braces", () => {
    expect(parse("x.zap", ws)).toEqual(parse("x.zap", brace));
  });

  it("keeps brace syntax working: single-line, nested, and trailing comments", () => {
    const mixed = `package p

struct A { a u32 @0 }

struct Outer
  inner Inner @0   # a field with a trailing comment

struct Inner {
  v u32 @0
}
`;
    expect(() => parse("p.zap", mixed)).not.toThrow();
  });
});
