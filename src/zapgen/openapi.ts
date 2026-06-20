// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * openapi.ts — the OpenAPI 3.1 code target for the TS-native zapgen.
 *
 * Each declared `interface` codegens one OpenAPI 3.1 document. Every method
 * becomes one POST operation whose request/response bodies are the JSON Schema
 * of its input/output structs; every struct referenced (transitively) lands in
 * `components.schemas`. This is a pure, in-house JSON Schema emitter — no
 * external OpenAPI library — so the only output is plain JSON.
 *
 * ADDITIVE: this module does not touch the struct wire model or the TS emitter.
 * It reads the same `File` AST that `emitTS` reads.
 *
 * The generated paths MUST match what `@zap-proto/web/server`'s `httpServe`
 * mounts: POST `/<service-name-kebab>/<method-name-kebab>`.
 */

import { TypeKind } from "./schema.js";
import type { File, Struct, Type, Interface, Method } from "./schema.js";

/**
 * kebab converts an identifier to kebab-case. It splits on camelCase humps,
 * underscores, and dots (`Echo.Req` → `echo-req`), lowercases, and collapses
 * runs of separators. Mirrors the kebab used by httpServe so paths line up.
 */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2") // camelCase hump
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2") // ACRONYMWord → ACRONYM-Word
    .replace(/[._\s]+/g, "-") // dots / underscores / spaces
    .replace(/-+/g, "-") // collapse runs
    .replace(/^-|-$/g, "") // trim
    .toLowerCase();
}

/** A JSON Schema fragment. Loosely typed — it is serialized straight to JSON. */
export type JsonSchema = Record<string, unknown>;

/** typeSchema maps one ZAP field type to its JSON Schema fragment. */
function typeSchema(t: Type): JsonSchema {
  switch (t.kind) {
    case TypeKind.Bool:
      return { type: "boolean" };
    case TypeKind.U8:
      return { type: "integer", format: "uint8", minimum: 0, maximum: 255 };
    case TypeKind.U16:
      return { type: "integer", format: "uint16", minimum: 0, maximum: 65535 };
    case TypeKind.U32:
      return { type: "integer", format: "uint32", minimum: 0, maximum: 4294967295 };
    case TypeKind.I8:
      return { type: "integer", format: "int8", minimum: -128, maximum: 127 };
    case TypeKind.I16:
      return { type: "integer", format: "int16", minimum: -32768, maximum: 32767 };
    case TypeKind.I32:
      return { type: "integer", format: "int32" };
    case TypeKind.U64:
      // OpenAPI/JSON cannot safely carry 64-bit ints — string-encode them.
      return { type: "string", format: "int64" };
    case TypeKind.I64:
      return { type: "string", format: "int64" };
    case TypeKind.F32:
      return { type: "number", format: "float" };
    case TypeKind.F64:
      return { type: "number", format: "double" };
    case TypeKind.Text:
      return { type: "string" };
    case TypeKind.Bytes:
      return { type: "string", format: "byte" };
    case TypeKind.BytesFixed: {
      // base64 of N bytes is ceil(N/3)*4 chars; for the spec's fixed-width
      // hint we use the canonical 4*ceil(N/3) length both sides.
      const n = t.fixedSize ?? 0;
      const b64Len = Math.ceil(n / 3) * 4;
      return { type: "string", format: "byte", minLength: b64Len, maxLength: b64Len };
    }
    case TypeKind.List:
      return { type: "array", items: typeSchema(t.listElem!) };
    case TypeKind.Struct:
      return { $ref: `#/components/schemas/${t.structName}` };
    default:
      return {};
  }
}

/** structSchema builds the JSON Schema object for one struct. */
function structSchema(s: Struct): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const f of s.fields) {
    // ZAP structs have no optional marker in the wire model; every declared
    // field is present. (Optional/nullable is reserved for a future grammar
    // extension — the type mapping below honors it if a field carries it.)
    //
    // Property names use the same camelLower transform the TS emitter applies
    // to getters/builder inputs, so the JSON-over-HTTP body shape matches the
    // generated TS bindings exactly (one canonical naming across both targets).
    const propName = lowerFirst(f.name);
    properties[propName] = typeSchema(f.type);
    required.push(propName);
  }
  const schema: JsonSchema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  schema.additionalProperties = false;
  return schema;
}

/**
 * referencedStructs walks an interface's methods and returns the transitive set
 * of struct names reachable from its request/response params (so `components`
 * carries exactly what the operations $ref, including nested structs and list
 * element structs).
 */
function referencedStructs(iface: Interface, byName: Map<string, Struct>): Set<string> {
  const seen = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) return;
    const s = byName.get(name);
    if (!s) return; // dangling ref — emit nothing rather than throw.
    seen.add(name);
    for (const f of s.fields) collectTypeStructs(f.type, visit);
  };
  for (const m of iface.methods) {
    if (m.request) visit(m.request.structName);
    if (m.response) visit(m.response.structName);
  }
  return seen;
}

/** collectTypeStructs descends a type and calls visit() on each struct name. */
function collectTypeStructs(t: Type, visit: (name: string) => void): void {
  switch (t.kind) {
    case TypeKind.Struct:
      if (t.structName) visit(t.structName);
      break;
    case TypeKind.List:
      if (t.listElem) collectTypeStructs(t.listElem, visit);
      break;
    default:
      break;
  }
}

/** Standard error responses shared by every operation. */
const ERROR_RESPONSES: Record<string, JsonSchema> = {
  "400": { description: "Bad request — payload failed validation." },
  "401": { description: "Unauthorized — missing or invalid credentials." },
  "403": { description: "Forbidden — credentials lack the capability." },
  "404": { description: "Not found — unknown method." },
  "500": { description: "Internal server error." },
};

/** Annotations a schema may carry to override OpenAPI document metadata. */
export interface OpenApiAnnotations {
  /** info.version override (default "1.0.0"). */
  version?: string;
  /** servers[] urls. */
  servers?: string[];
}

/**
 * parseAnnotations reads OpenAPI metadata from comment directives in the raw
 * `.zap` source, WITHOUT touching the schema grammar (the parser already drops
 * `#` comments). Recognised directives, one per line:
 *
 *   # @openapi:version 2.3.0
 *   # @openapi:server https://api.example.com/v1
 *   # @openapi:server https://staging.example.com/v1
 *
 * Multiple `server` lines accumulate in declaration order. Unknown directives
 * are ignored so the format stays forward-compatible.
 */
export function parseAnnotations(src: string): OpenApiAnnotations {
  const ann: OpenApiAnnotations = {};
  const servers: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("#")) continue;
    const body = line.replace(/^#+\s*/, "");
    const m = /^@openapi:(\w+)\s+(.+?)\s*$/.exec(body);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "version") ann.version = value;
    else if (key === "server") servers.push(value);
  }
  if (servers.length > 0) ann.servers = servers;
  return ann;
}

/**
 * emitOpenAPI emits one OpenAPI 3.1 JSON document PER interface in the file.
 * Returns an array of [filename, json] pairs. A file with no interfaces yields
 * an empty array (the caller decides whether that is an error).
 *
 * Filenames: `<schema-base>.openapi.json` when there is exactly one interface;
 * `<schema-base>.<service-kebab>.openapi.json` when there are several, so the
 * outputs never collide.
 */
export function emitOpenAPI(
  f: File,
  ann: OpenApiAnnotations = {},
): Array<[string, string]> {
  let source = f.source;
  if (source === "") source = f.package + ".zap";
  let base = source;
  const dot = base.lastIndexOf(".");
  if (dot >= 0) base = base.slice(0, dot);

  const byName = new Map<string, Struct>();
  for (const s of f.structs) byName.set(s.name, s);

  const multi = f.interfaces.length > 1;
  const out: Array<[string, string]> = [];

  for (const iface of f.interfaces) {
    const doc = buildDocument(iface, byName, ann);
    const json = JSON.stringify(doc, null, 2) + "\n";
    const name = multi
      ? `${base}.${kebab(iface.name)}.openapi.json`
      : `${base}.openapi.json`;
    out.push([name, json]);
  }
  return out;
}

/** buildDocument assembles the OpenAPI 3.1 doc object for one interface. */
function buildDocument(
  iface: Interface,
  byName: Map<string, Struct>,
  ann: OpenApiAnnotations,
): Record<string, unknown> {
  const serviceKebab = kebab(iface.name);
  const serviceLower = lowerFirst(iface.name);

  const paths: Record<string, unknown> = {};
  for (const m of iface.methods) {
    const path = `/${serviceKebab}/${kebab(m.name)}`;
    paths[path] = { post: buildOperation(serviceLower, m) };
  }

  const schemas: Record<string, JsonSchema> = {};
  for (const name of [...referencedStructs(iface, byName)].sort()) {
    const s = byName.get(name);
    if (s) schemas[name] = structSchema(s);
  }

  const doc: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
      title: iface.name,
      version: ann.version ?? "1.0.0",
    },
  };
  if (ann.servers && ann.servers.length > 0) {
    doc.servers = ann.servers.map((url) => ({ url }));
  }
  doc.paths = paths;
  doc.components = { schemas };
  return doc;
}

/** buildOperation builds one POST operation object for a method. */
function buildOperation(
  serviceLower: string,
  m: Method,
): Record<string, unknown> {
  const op: Record<string, unknown> = {
    operationId: `${serviceLower}.${m.name}`,
    responses: {
      ...buildOkResponse(m),
      ...ERROR_RESPONSES,
    },
  };
  if (m.request) {
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${m.request.structName}` },
        },
      },
    };
  }
  return op;
}

/** buildOkResponse builds the 200 response for a method (with or without body). */
function buildOkResponse(m: Method): Record<string, unknown> {
  if (!m.response) {
    return { "200": { description: "OK — no response body." } };
  }
  return {
    "200": {
      description: "OK",
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${m.response.structName}` },
        },
      },
    },
  };
}

/** lowerFirst lowercases the first character (operationId service segment). */
function lowerFirst(s: string): string {
  if (s === "") return s;
  const c = s[0];
  return c >= "A" && c <= "Z" ? c.toLowerCase() + s.slice(1) : s;
}
