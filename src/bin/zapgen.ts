#!/usr/bin/env node
// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * zapgen — read a `.zap` schema file and emit TypeScript views, builders, and
 * RPC client/server skeletons over the @zap-proto/zap runtime.
 *
 * Usage:
 *   zapgen schema.zap                 # emit <schema>_zap.ts next to the input
 *   zapgen -out ./gen schema.zap      # emit into the given directory
 *   zapgen --help
 *
 * The emitted file imports from "@zap-proto/zap" and is byte-compatible with
 * the Go runtime (github.com/zap-proto/go) over the wire.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "../zapgen/parser.js";
import { emitTS } from "../zapgen/emit.js";

const USAGE = `usage: zapgen [-out OUTDIR] SCHEMA.zap

Reads a .zap schema and emits one <SCHEMA>_zap.ts file containing a zero-copy
View + builder per struct, and a typed Client + abstract Server + method-ordinal
table per interface, over the @zap-proto/zap runtime.

Options:
  -out, --out DIR   output directory (default: the input file's directory)
  -h,   --help      show this help and exit

Schema syntax:
  package myservice

  type id32 = bytes_fixed[32]

  struct Echo.Req  { Text text @0 }
  struct Echo.Resp { Text text @0 }

  interface Echo {
    echo(req: Echo.Req) returns (resp: Echo.Resp)
    ping() returns ()
  }

Method ordinals are auto-assigned 1, 2, 3, ... in declaration order (stable
wire compatibility — appending a method never renumbers existing ones).`;

function main(argv: string[]): number {
  let outDir = "";
  const inputs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      process.stdout.write(USAGE + "\n");
      return 0;
    }
    if (a === "-out" || a === "--out") {
      outDir = argv[++i];
      if (outDir === undefined) {
        process.stderr.write("zapgen: -out requires a directory argument\n");
        return 2;
      }
      continue;
    }
    if (a.startsWith("--out=")) {
      outDir = a.slice("--out=".length);
      continue;
    }
    if (a.startsWith("-")) {
      process.stderr.write(`zapgen: unknown flag ${a}\n${USAGE}\n`);
      return 2;
    }
    inputs.push(a);
  }

  if (inputs.length !== 1) {
    process.stderr.write(USAGE + "\n");
    return 2;
  }

  const input = inputs[0];
  let src: string;
  try {
    src = readFileSync(input, "utf8");
  } catch (err) {
    process.stderr.write(`zapgen: ${(err as Error).message}\n`);
    return 1;
  }

  let outName: string;
  let body: string;
  try {
    const file = parse(input, src);
    [outName, body] = emitTS(file);
  } catch (err) {
    process.stderr.write(`zapgen: ${(err as Error).message}\n`);
    return 1;
  }

  const dir = outDir !== "" ? outDir : dirname(input);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, outName), body);
  } catch (err) {
    process.stderr.write(`zapgen: ${(err as Error).message}\n`);
    return 1;
  }

  process.stdout.write(`zapgen: wrote ${join(dir, outName)}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
