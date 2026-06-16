# Echo service fixture — exercises the interface/method grammar (FIX 4).
#
# Two structs carry the request/response payloads; the interface declares one
# method whose ordinal auto-assigns to 1. zapgen must emit EchoClient,
# EchoServer, and the EchoMethod ordinal table from this — alongside the
# unchanged struct View/Builder emission.

package echo

struct EchoReq {
  Msg text @0
}

struct EchoResp {
  Msg text @0
}

interface Echo {
  echo(req: EchoReq) returns (resp: EchoResp)
}
