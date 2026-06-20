// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  newCapability,
  Capability,
  newCaveat,
  type CapabilityInput,
} from "./gen/capabilities_zap.js";
import {
  newUiCustomizationConfig,
  UiCustomizationConfig,
} from "./gen/ui-customization_zap.js";
import {
  buildRequest,
  parseRequest,
  buildResponse,
  parseResponse,
  Method,
  Status,
  encodeUtf8,
  decodeUtf8,
  StructView,
  ListView,
  HEADER_SIZE,
} from "@zap-proto/zap";

// Hex of a deterministic Capability produced by the Go runtime
// (github.com/zap-proto/go/cap NewCapabilityView) for the inputs in
// fixtureCapabilityInput(). The TS builder must emit byte-identical output —
// this is the cross-runtime wire-compatibility anchor. Regenerate via the Go
// fixture program in the report if capabilities.zap changes.
const GO_CAPABILITY_FULL = readFileSync(
  fileURLToPath(new URL("./capability.go-fixture.hex", import.meta.url)),
  "utf8",
).trim();

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function fill32(v: number): Uint8Array {
  return new Uint8Array(32).fill(v);
}

/** The exact inputs the Go fixture (/tmp/zapfix) used. */
function fixtureCapabilityInput(): CapabilityInput {
  const sig = new Uint8Array(3408);
  for (let i = 0; i < sig.length; i++) sig[i] = i % 251;
  const cav0 = newCaveat({ kind: 9, value: encodeUtf8("nonce-abc") });
  const cav1 = newCaveat({ kind: 1, value: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) });
  return {
    kind: 0x01,
    target: fill32(0x11),
    holder: fill32(0x22),
    issuer: fill32(0x33),
    permissions: 0xcafebabedeadbeefn,
    parent: fill32(0x00),
    issuedAt: 1700000000n,
    expiresAt: 1800000000n,
    caveats: [cav0, cav1],
    sig,
  };
}

describe("@zap-proto/zap wire format", () => {
  it("builds a Capability byte-identical to the Go runtime fixture", () => {
    const bytes = newCapability(fixtureCapabilityInput());
    expect(bytesToHex(bytes)).toBe(GO_CAPABILITY_FULL);
  });

  it("round-trips a Capability through Builder -> View (fixture)", () => {
    const bytes = newCapability(fixtureCapabilityInput());
    const view = Capability.wrap(bytes);
    expect(view.kind).toBe(0x01);
    expect(view.permissions).toBe(0xcafebabedeadbeefn);
    expect(view.issuedAt).toBe(1700000000n);
    expect(view.expiresAt).toBe(1800000000n);
    expect(Array.from(view.target)).toEqual(Array.from(fill32(0x11)));
    expect(Array.from(view.holder)).toEqual(Array.from(fill32(0x22)));
    expect(Array.from(view.issuer)).toEqual(Array.from(fill32(0x33)));
    // sig: first/last bytes spot-check the 3408-byte inline footer.
    expect(view.sig.byteLength).toBe(3408);
    expect(view.sig[0]).toBe(0);
    expect(view.sig[250]).toBe(250);
    expect(view.sig[251]).toBe(0);
    // caveats list: 2 variable-length elements.
    const cav = view.caveats;
    expect(cav.length).toBe(2);
  });

  it("round-trips 1000 random Capability structs, all fields preserved", () => {
    let seed = 0x12345678;
    const rand = (): number => {
      // xorshift32 — deterministic, no deps.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const randBytes = (n: number): Uint8Array => {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = rand() & 0xff;
      return b;
    };
    const randU64 = (): bigint =>
      (BigInt(rand()) << 32n) | BigInt(rand());

    for (let iter = 0; iter < 1000; iter++) {
      const sig = randBytes(3408);
      const target = randBytes(32);
      const holder = randBytes(32);
      const issuer = randBytes(32);
      const parent = randBytes(32);
      const kind = rand() & 0xff;
      const permissions = randU64();
      const issuedAt = randU64();
      const expiresAt = randU64();
      const ncav = rand() % 4;
      const caveatInputs: { kind: number; value: Uint8Array }[] = [];
      for (let c = 0; c < ncav; c++) {
        caveatInputs.push({ kind: rand() & 0xffff, value: randBytes(rand() % 17) });
      }
      const caveats = caveatInputs.map((ci) => newCaveat(ci));

      const bytes = newCapability({
        kind,
        target,
        holder,
        issuer,
        permissions,
        parent,
        issuedAt,
        expiresAt,
        caveats,
        sig,
      });
      const v = Capability.wrap(bytes);
      expect(v.kind).toBe(kind);
      expect(v.permissions).toBe(permissions);
      expect(v.issuedAt).toBe(issuedAt);
      expect(v.expiresAt).toBe(expiresAt);
      expect(bytesToHex(v.target)).toBe(bytesToHex(target));
      expect(bytesToHex(v.holder)).toBe(bytesToHex(holder));
      expect(bytesToHex(v.issuer)).toBe(bytesToHex(issuer));
      expect(bytesToHex(v.parent)).toBe(bytesToHex(parent));
      expect(bytesToHex(v.sig)).toBe(bytesToHex(sig));
      expect(v.caveats.length).toBe(ncav);
      for (let c = 0; c < ncav; c++) {
        const sub = v.caveats.objectAt(c);
        // Caveat fixed section: Kind u32 @0, Value bytes @4.
        const subView = sub as unknown as { data: Uint8Array; offset: number };
        const dv = new DataView(subView.data.buffer, subView.data.byteOffset, subView.data.byteLength);
        expect(dv.getUint32(subView.offset, true)).toBe(caveatInputs[c].kind);
      }
    }
  });

  it("round-trips a UiCustomizationConfig (text + list<text>)", () => {
    const bytes = newUiCustomizationConfig({
      present: true,
      hostname: "ui.example.test",
      documentationHref: "https://docs.example",
      supportHref: "",
      feedbackHref: "",
      logoLightModeHref: "",
      logoDarkModeHref: "",
      defaultModelAdapter: "openai",
      defaultBaseUrlOpenAI: "",
      defaultBaseUrlAnthropic: "",
      defaultBaseUrlAzure: "",
      visibleModules: ["chat", "evals", "tracing"].map((s) => encodeUtf8(s)),
    });
    const v = UiCustomizationConfig.wrap(bytes);
    expect(v.present).toBe(true);
    expect(v.hostname).toBe("ui.example.test");
    expect(v.documentationHref).toBe("https://docs.example");
    expect(v.defaultModelAdapter).toBe("openai");
    expect(v.supportHref).toBe("");
    expect(v.visibleModules.toStringArray()).toEqual(["chat", "evals", "tracing"]);
  });

  it("round-trips the request envelope (byte-compatible with server/wire.go)", () => {
    const cap = newCapability(fixtureCapabilityInput());
    const payload = encodeUtf8("params");
    const env = buildRequest({
      method: Method.Get,
      promiseID: 7,
      target: 0,
      cap,
      payload,
    });
    const call = parseRequest(env);
    expect(call.method).toBe(Method.Get);
    expect(call.promiseID).toBe(7);
    expect(call.target).toBe(0);
    expect(bytesToHex(call.cap)).toBe(bytesToHex(cap));
    expect(decodeUtf8(call.payload)).toBe("params");
    // msgType is encoded in header flags >> 8 = 200.
    const dv = new DataView(env.buffer, env.byteOffset, env.byteLength);
    expect(dv.getUint16(6, true) >> 8).toBe(200);
  });

  it("round-trips the response envelope", () => {
    const body = encodeUtf8('{"ok":true}');
    const env = buildResponse(Status.OK, 9, body);
    const resp = parseResponse(env);
    expect(resp.status).toBe(Status.OK);
    expect(resp.promiseID).toBe(9);
    expect(decodeUtf8(resp.body)).toBe('{"ok":true}');
  });
});

// Concrete probe exposing the protected pointer resolvers so adversarial
// buffers exercise the exact code path the generated object/list getters use.
class Probe extends StructView {
  obj(fieldOffset: number): StructView {
    return this.object(fieldOffset);
  }
  lst(fieldOffset: number): ListView {
    return this.list(fieldOffset);
  }
}

// These pin the cross-wire invariant: the TS reader must accept/reject every
// input the Go reader does. Each scenario is a confirmed PoC from the red-team
// audit — before the HEADER_SIZE floor + length clamp landed, object()/list()
// followed a crafted backward pointer INTO the 16-byte header, and list()
// reported a 0xFFFFFFFF wire word verbatim (a 4G-iteration DoS).
describe("@zap-proto/zap reader hardening (Go reject-parity)", () => {
  // [16B header][struct root @ HEADER_SIZE] in a 32-byte buffer.
  function craft(): { data: Uint8Array; dv: DataView; root: number } {
    const data = new Uint8Array(HEADER_SIZE + 16);
    data.set([0x5a, 0x41, 0x50, 0x00]); // 'ZAP\0' — plausible header to alias
    return {
      data,
      dv: new DataView(data.buffer, data.byteOffset, data.byteLength),
      root: HEADER_SIZE,
    };
  }

  it("object(): rejects a backward pointer into the wire header", () => {
    const { data, dv, root } = craft();
    dv.setInt32(root, 8 - root, true); // absOffset = 8, inside the header
    expect(new Probe(data, root).obj(0).isNull()).toBe(true);
  });

  it("object(): still resolves a valid forward pointer", () => {
    const { data, dv, root } = craft();
    dv.setInt32(root, 24 - root, true); // absOffset = 24 (>= HEADER_SIZE)
    const v = new Probe(data, root).obj(0);
    expect(v.isNull()).toBe(false);
    expect(v.offset).toBe(24);
  });

  it("list(): rejects a backward pointer into the header", () => {
    const { data, dv, root } = craft();
    dv.setInt32(root, 8 - root, true); // absOffset = 8
    dv.setUint32(root + 4, 1, true); // length 1
    expect(new Probe(data, root).lst(0).len()).toBe(0);
  });

  it("list(): clamps an out-of-range length (0xFFFFFFFF DoS word)", () => {
    const { data, dv, root } = craft();
    dv.setInt32(root, 24 - root, true); // valid forward pointer
    dv.setUint32(root + 4, 0xffffffff, true); // length > byteLength
    expect(new Probe(data, root).lst(0).len()).toBe(0);
  });

  it("list(): still resolves a valid forward list", () => {
    const { data, dv, root } = craft();
    dv.setInt32(root, 24 - root, true);
    dv.setUint32(root + 4, 1, true);
    expect(new Probe(data, root).lst(0).len()).toBe(1);
  });
});
