// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parse } from "../src/zapgen/parser.js";
import { emitTS } from "../src/zapgen/emit.js";

const echoSrc = readFileSync(
  fileURLToPath(new URL("./fixtures/echo.zap", import.meta.url)),
  "utf8",
);

describe("zapgen interface grammar (FIX 4)", () => {
  const file = parse("echo.zap", echoSrc);

  it("parses structs and interfaces additively", () => {
    expect(file.structs.map((s) => s.name)).toEqual(["EchoReq", "EchoResp"]);
    expect(file.interfaces.map((i) => i.name)).toEqual(["Echo"]);
  });

  it("auto-assigns method ordinals 1.. in declaration order", () => {
    const echo = file.interfaces[0];
    expect(echo.methods).toHaveLength(1);
    expect(echo.methods[0].name).toBe("echo");
    expect(echo.methods[0].ordinal).toBe(1);
    expect(echo.methods[0].request?.structName).toBe("EchoReq");
    expect(echo.methods[0].response?.structName).toBe("EchoResp");
  });

  it("emits a typed Client and abstract Server for each interface", () => {
    const [name, out] = emitTS(file);
    expect(name).toBe("echo_zap.ts");
    expect(out).toContain("class EchoClient");
    expect(out).toContain("abstract class EchoServer");
    expect(out).toContain("EchoMethod");
    // ordinal table value is the auto-assigned 1.
    expect(out).toContain("echo: 1,");
  });

  it("still emits struct View + Builder (struct emission unchanged)", () => {
    const [, out] = emitTS(file);
    expect(out).toContain("export class EchoReq extends StructView");
    expect(out).toContain("export function newEchoReq(");
    expect(out).toContain("export class EchoResp extends StructView");
  });
});

describe("zapgen interface ordinal stability", () => {
  it("numbers multiple methods 1, 2, 3 by declaration order", () => {
    const src = `package svc
struct A { X u32 @0 }
struct B { Y u32 @0 }
interface S {
  first(a: A) returns (b: B)
  second() returns ()
  third(a: A)
}`;
    const file = parse("svc.zap", src);
    const s = file.interfaces[0];
    expect(s.methods.map((m) => [m.name, m.ordinal])).toEqual([
      ["first", 1],
      ["second", 2],
      ["third", 3],
    ]);
    const [, out] = emitTS(file);
    expect(out).toContain("first: 1,");
    expect(out).toContain("second: 2,");
    expect(out).toContain("third: 3,");
  });
});
