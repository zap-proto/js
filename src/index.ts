// @zap-proto/zap — the ZAP foundation layer.
//
// The default entry is the full runtime: the Cap'n-Proto codec plus the
// Level-4 RPC primitives. Generated schema bindings import this namespace
// (`import * as $ from "@zap-proto/zap"`) and bind both codec and RPC types
// against it, so `.` must carry both.
//
// Focused entries are available for consumers that want a single slice:
//
//   import { Message, Struct } from "@zap-proto/zap";        // full runtime
//   import { Conn, Client } from "@zap-proto/zap/rpc";       // RPC only
//   import { dump } from "@zap-proto/zap/debug";             // debug
//   capnpc-ts / capnpc-js / capnpc-dts                       // compiler (bin)

export * from "./codec";
export * from "./rpc";
