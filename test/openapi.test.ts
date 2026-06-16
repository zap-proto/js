// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { describe, it, expect } from "vitest";
import { parse } from "../src/zapgen/parser.js";
import {
  emitOpenAPI,
  parseAnnotations,
  kebab,
} from "../src/zapgen/openapi.js";

const docSrc = `package docs

# @openapi:version 2.3.0
# @openapi:server https://api.example.com/v1
# @openapi:server https://staging.example.com/v1

struct CreateDocumentReq {
  Title   text          @0
  Body    bytes         @8
  Tags    list<text>    @16
  Size    u64           @24
  Ratio   f64           @32
  Active  bool          @40
  Hash    bytes_fixed[32] @41
}

struct CreateDocumentResp {
  Id      u32           @0
}

interface DocumentService {
  createDocument(req: CreateDocumentReq) returns (resp: CreateDocumentResp)
  deleteDocument(req: CreateDocumentResp)
  ping() returns ()
}`;

describe("zapgen OpenAPI emission", () => {
  const file = parse("docs.zap", docSrc);
  const ann = parseAnnotations(docSrc);
  const [[name, json]] = emitOpenAPI(file, ann);
  const doc = JSON.parse(json);

  it("names the output <schema>.openapi.json", () => {
    expect(name).toBe("docs.openapi.json");
  });

  it("declares OpenAPI 3.1.0", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("uses the interface name as info.title", () => {
    expect(doc.info.title).toBe("DocumentService");
  });

  it("reads info.version from the @openapi:version annotation", () => {
    expect(doc.info.version).toBe("2.3.0");
  });

  it("reads servers[] from @openapi:server annotations in order", () => {
    expect(doc.servers).toEqual([
      { url: "https://api.example.com/v1" },
      { url: "https://staging.example.com/v1" },
    ]);
  });

  it("kebabs service + method into the POST path", () => {
    expect(doc.paths["/document-service/create-document"]).toBeDefined();
    expect(doc.paths["/document-service/delete-document"]).toBeDefined();
    expect(doc.paths["/document-service/ping"]).toBeDefined();
  });

  it("assigns operationId <service>.<method>", () => {
    const op = doc.paths["/document-service/create-document"].post;
    expect(op.operationId).toBe("documentService.createDocument");
  });

  it("wires requestBody + 200 response to the struct schemas", () => {
    const op = doc.paths["/document-service/create-document"].post;
    expect(op.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/CreateDocumentReq",
    });
    expect(op.responses["200"].content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/CreateDocumentResp",
    });
  });

  it("omits the response body for a void method", () => {
    const op = doc.paths["/document-service/ping"].post;
    expect(op.responses["200"].content).toBeUndefined();
    expect(op.requestBody).toBeUndefined();
  });

  it("includes standard 4xx/5xx error responses", () => {
    const op = doc.paths["/document-service/create-document"].post;
    for (const code of ["400", "401", "403", "404", "500"]) {
      expect(op.responses[code]).toBeDefined();
    }
  });

  it("maps every ZAP type to the spec'd JSON Schema (camelLower props)", () => {
    const s = doc.components.schemas.CreateDocumentReq.properties;
    expect(s.title).toEqual({ type: "string" });
    expect(s.body).toEqual({ type: "string", format: "byte" });
    expect(s.tags).toEqual({ type: "array", items: { type: "string" } });
    expect(s.size).toEqual({ type: "string", format: "int64" });
    expect(s.ratio).toEqual({ type: "number", format: "double" });
    expect(s.active).toEqual({ type: "boolean" });
    // base64 of 32 bytes = ceil(32/3)*4 = 44 chars.
    expect(s.hash).toEqual({
      type: "string",
      format: "byte",
      minLength: 44,
      maxLength: 44,
    });
  });

  it("marks struct fields required and forbids extra props", () => {
    const schema = doc.components.schemas.CreateDocumentResp;
    expect(schema.required).toEqual(["id"]);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("emitOpenAPI nested + list-of-struct refs", () => {
  const src = `package nest
struct Inner { V u32 @0 }
struct Outer { Inner Inner @0 Many list<Inner> @4 }
interface S {
  go(req: Outer) returns (resp: Inner)
}`;
  const file = parse("nest.zap", src);
  const [[, json]] = emitOpenAPI(file);
  const doc = JSON.parse(json);

  it("collects transitively-referenced structs into components", () => {
    expect(Object.keys(doc.components.schemas).sort()).toEqual([
      "Inner",
      "Outer",
    ]);
  });

  it("$refs nested struct and list element struct", () => {
    const props = doc.components.schemas.Outer.properties;
    expect(props.inner).toEqual({ $ref: "#/components/schemas/Inner" });
    expect(props.many).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/Inner" },
    });
  });
});

describe("emitOpenAPI multiple interfaces", () => {
  const src = `package multi
struct A { X u32 @0 }
interface First { f(a: A) returns (a: A) }
interface Second { g(a: A) returns (a: A) }`;
  const file = parse("multi.zap", src);
  const out = emitOpenAPI(file);

  it("emits one doc per interface with distinct filenames", () => {
    expect(out.map(([n]) => n).sort()).toEqual([
      "multi.first.openapi.json",
      "multi.second.openapi.json",
    ]);
  });
});

describe("kebab", () => {
  it("splits camelCase, dots, and underscores", () => {
    expect(kebab("DocumentService")).toBe("document-service");
    expect(kebab("createDocument")).toBe("create-document");
    expect(kebab("Echo.Req")).toBe("echo-req");
    expect(kebab("HTTPServer")).toBe("http-server");
  });
});

describe("parseAnnotations", () => {
  it("returns empty annotations when none present", () => {
    expect(parseAnnotations("package x\nstruct A { X u32 @0 }")).toEqual({});
  });
});
