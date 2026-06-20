#!/usr/bin/env node
// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * zapgen — read a `.zap` schema file and emit TypeScript views, builders, and
 * RPC client/server skeletons over the @zap-proto/zap runtime, and/or an
 * OpenAPI 3.1 document per interface.
 *
 * Usage:
 *   zapgen schema.zap                       # emit <schema>_zap.ts (ts target)
 *   zapgen -out ./gen schema.zap            # emit into the given directory
 *   zapgen --emit=openapi schema.zap        # emit <schema>.openapi.json only
 *   zapgen --emit=ts,openapi schema.zap     # emit both targets
 *   zapgen --help
 *
 * The emitted TS file imports from "@zap-proto/zap" and is byte-compatible with
 * the Go runtime (github.com/zap-proto/go) over the wire. The emitted OpenAPI
 * doc describes the same service over HTTP (POST /<service>/<method>), matching
 * what @zap-proto/web/server's httpServe mounts.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "../zapgen/parser.js";
import { emitTS } from "../zapgen/emit.js";
import { emitOpenAPI, parseAnnotations } from "../zapgen/openapi.js";

const USAGE = `usage: zapgen [-out OUTDIR] [--emit=TARGETS] SCHEMA.zap

Reads a .zap schema and emits, per the --emit targets:
  ts       one <SCHEMA>_zap.ts: a zero-copy View + builder per struct, and a
           typed Client + abstract Server + method-ordinal table per interface.
  openapi  one <SCHEMA>.openapi.json OpenAPI 3.1 document per interface: each
           method becomes a POST /<service>/<method> operation whose bodies are
           the JSON Schema of the request/response structs.

Options:
  -out, --out DIR    output directory (default: the input file's directory)
  --emit=TARGETS     comma-separated targets: ts, openapi (default: ts)
  -h,   --help       show this help and exit

Schema syntax:
  package myservice

  # @openapi:version 1.2.0
  # @openapi:server  https://api.example.com/v1

  type id32 = bytes_fixed[32]

  struct Echo.Req  { Text text @0 }
  struct Echo.Resp { Text text @0 }

  interface Echo {
    echo(req: Echo.Req) returns (resp: Echo.Resp)
    ping() returns ()
  }

Method ordinals are auto-assigned 1, 2, 3, ... in declaration order (stable
wire compatibility — appending a method never renumbers existing ones).`;

const EMIT_TARGETS = new Set(["ts", "openapi"]);

/** parseEmit splits a --emit value into a validated, de-duplicated target list. */
function parseEmit(value: string): string[] | Error {
  const targets = value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  if (targets.length === 0) return new Error("--emit requires at least one target");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of targets) {
    if (!EMIT_TARGETS.has(t)) {
      return new Error(
        `unknown --emit target ${JSON.stringify(t)} (want ts and/or openapi)`,
      );
    }
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function main(argv: string[]): number {
  let outDir = "";
  let emit: string[] = ["ts"];
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
    if (a === "--emit") {
      const v = argv[++i];
      if (v === undefined) {
        process.stderr.write("zapgen: --emit requires a value (ts,openapi)\n");
        return 2;
      }
      const parsed = parseEmit(v);
      if (parsed instanceof Error) {
        process.stderr.write(`zapgen: ${parsed.message}\n`);
        return 2;
      }
      emit = parsed;
      continue;
    }
    if (a.startsWith("--emit=")) {
      const parsed = parseEmit(a.slice("--emit=".length));
      if (parsed instanceof Error) {
        process.stderr.write(`zapgen: ${parsed.message}\n`);
        return 2;
      }
      emit = parsed;
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

  // outputs: [filename, body] pairs, accumulated across the selected targets.
  const outputs: Array<[string, string]> = [];
  try {
    const file = parse(input, src);
    if (emit.includes("ts")) {
      outputs.push(emitTS(file));
    }
    if (emit.includes("openapi")) {
      if (file.interfaces.length === 0) {
        throw new Error("--emit=openapi requires at least one interface");
      }
      const ann = parseAnnotations(src);
      for (const pair of emitOpenAPI(file, ann)) outputs.push(pair);
    }
  } catch (err) {
    process.stderr.write(`zapgen: ${(err as Error).message}\n`);
    return 1;
  }

  const dir = outDir !== "" ? outDir : dirname(input);
  try {
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of outputs) writeFileSync(join(dir, name), body);
  } catch (err) {
    process.stderr.write(`zapgen: ${(err as Error).message}\n`);
    return 1;
  }

  for (const [name] of outputs) {
    process.stdout.write(`zapgen: wrote ${join(dir, name)}\n`);
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
