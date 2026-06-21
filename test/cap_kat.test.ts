// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * cap_kat.test.ts — cross-language Known-Answer Test (interop proof).
 *
 * test/cap_go_kat.hex is produced by a Go program (github.com/zap-proto/go/cap)
 * that issues+signs a Capability over a FIXED Ed25519 seed (32×0x42) and FIXED
 * inputs, then prints the canonical bytes, the CapID, the signature, and the
 * full wire bytes as hex. This test proves the TypeScript cap runtime is
 * byte-for-byte interoperable with the Go runtime:
 *
 *   1. The Go-signed cap parses in JS and every field round-trips.
 *   2. JS canonicalBytes(cap) is byte-identical to Go's signed scope.
 *   3. JS capId(cap) = SHA-256(canonical || sig) is byte-identical to Go's.
 *   4. The Go-produced Ed25519 signature VERIFIES in JS under the known pubkey.
 *   5. A one-bit tamper of the signed header makes JS verification FAIL.
 *   6. Re-issuing the SAME inputs with the SAME seed in JS reproduces Go's exact
 *      CapID and wire bytes — the TS signer is deterministic and Go-compatible.
 *
 * If capabilities.zap or the canonical-bytes rule changes, regenerate the hex
 * via the Go fixture program documented in the cap port report.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  Cap,
  Ed25519Signer,
  Scheme,
  ALG_TAG_OFFSET,
  CapKind,
  CaveatKind,
  Perm,
  Verifier,
  issue,
  hash32,
  type Issuance,
} from "@zap-proto/zap/cap";

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

// Parse the KEY=hex manifest the Go program emits.
const KAT: Record<string, string> = {};
for (const line of readFileSync(
  fileURLToPath(new URL("./cap_go_kat.hex", import.meta.url)),
  "utf8",
)
  .trim()
  .split("\n")) {
  const eq = line.indexOf("=");
  if (eq > 0) KAT[line.slice(0, eq)] = line.slice(eq + 1).trim();
}

// The exact inputs the Go fixture used. Must match cmd KAT in the report.
function u64le(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
}
function u32pair(a: number, c: number): Uint8Array {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, a, true);
  dv.setUint32(4, c, true);
  return b;
}
function fixtureIssuance(): Issuance {
  const target = new Uint8Array(32);
  const holder = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    target[i] = i; // 0x00..0x1f
    holder[i] = 0xff - i; // 0xff..0xe0
  }
  return {
    kind: CapKind.IAMSession,
    target,
    holder,
    permissions: Perm.Attenuate | 0x0fn,
    issuedAt: 1700000000n,
    expiresAt: 1900000000n,
    caveats: [
      { kind: CaveatKind.MaxAmount, value: u64le(1_000_000n) },
      { kind: CaveatKind.RateLimit, value: u32pair(60, 10) },
      { kind: CaveatKind.IPCIDR, value: new TextEncoder().encode("10.0.0.0/8") },
    ],
  };
}

describe("cap cross-language KAT (Go ⇄ JS interop)", () => {
  const goCapBytes = hexToBytes(KAT.cap);
  const goCanonical = KAT.canonical;
  const goCapId = KAT.capid;
  const goPubkey = hexToBytes(KAT.pubkey);
  const goIssuer = KAT.issuer;

  it("decodes the Go-signed cap and round-trips every field", () => {
    const c = Cap.wrap(goCapBytes);
    expect(c.kind()).toBe(CapKind.IAMSession);
    expect(c.permissions()).toBe(Perm.Attenuate | 0x0fn);
    expect(c.issuedAt()).toBe(1700000000n);
    expect(c.expiresAt()).toBe(1900000000n);
    expect(c.numCaveats()).toBe(3);
    // Issuer field == SHA-256(pubkey) == Go's issuer hash.
    expect(bytesToHex(c.issuer())).toBe(goIssuer);
    expect(bytesToHex(hash32(goPubkey))).toBe(goIssuer);
    // Algorithm tag is Ed25519.
    expect(c.signature()[ALG_TAG_OFFSET]).toBe(Scheme.Ed25519);
  });

  it("computes canonicalBytes byte-identical to Go", () => {
    const c = Cap.wrap(goCapBytes);
    expect(bytesToHex(c.canonicalBytes())).toBe(goCanonical);
  });

  it("computes capId = SHA-256(canonical || sig) byte-identical to Go", () => {
    const c = Cap.wrap(goCapBytes);
    expect(bytesToHex(c.id())).toBe(goCapId);
  });

  it("VERIFIES the Go-produced Ed25519 signature in JS (→ true)", () => {
    const c = Cap.wrap(goCapBytes);
    const v = new Verifier({
      issuerKey: (h) => (bytesToHex(h) === goIssuer ? goPubkey : null),
    });
    // null return == accepted.
    expect(v.verify(c, 1700000001n)).toBeNull();
  });

  it("REJECTS the Go cap after a one-bit header tamper (→ false)", () => {
    // Flip a bit in the Permissions field (inside the signed [0..164) header).
    const tampered = goCapBytes.slice();
    const dv = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const rootOff = dv.getUint32(8, true);
    // Permissions is at rootOff + 100.
    tampered[rootOff + 100] ^= 0x01;
    const c = Cap.wrap(tampered);
    const v = new Verifier({
      issuerKey: (h) => (bytesToHex(h) === goIssuer ? goPubkey : null),
    });
    const e = v.verify(c, 1700000001n);
    expect(e?.code).toBe("sig_mismatch");
  });

  it("re-issuing the same inputs+seed in JS reproduces Go's exact CapID and wire bytes", () => {
    const seed = hexToBytes(KAT.seed);
    const signer = Ed25519Signer.fromSeed(seed);
    // The JS signer's public-key hash must equal Go's issuer.
    expect(bytesToHex(signer.public())).toBe(goIssuer);
    expect(bytesToHex(signer.publicKey())).toBe(KAT.pubkey);

    const c = issue(fixtureIssuance(), signer);
    // Ed25519 is deterministic (RFC 8032), so the signature, CapID, and the
    // ENTIRE wire buffer are reproducible across Go and JS.
    expect(bytesToHex(c.canonicalBytes())).toBe(goCanonical);
    expect(bytesToHex(c.id())).toBe(goCapId);
    expect(bytesToHex(c.signature())).toBe(KAT.sig);
    expect(bytesToHex(c.raw())).toBe(KAT.cap);
  });
});
