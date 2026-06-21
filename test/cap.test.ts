// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * cap.test.ts — the TypeScript cap runtime test suite, mirroring
 * github.com/zap-proto/go/cap (cap_test.go + spec_test.go) test-for-test:
 * issue round-trip, Verify accept/expired/revoked/unknown-issuer/tampered,
 * Attenuate intersect/holder-gate/expiry-clamp, VerifyChain happy/revoked/
 * broken/op-not-permitted/empty-root, revocation, every CaveatKind, the
 * delegation gate (mint-time + verify-time defense in depth), the SPEC §3
 * canonical-bytes shape, fail-closed scheme dispatch, and the v1.1 wire shape.
 */

import { describe, it, expect } from "vitest";
import {
  Cap,
  CapError,
  Ed25519Signer,
  Scheme,
  schemeKnown,
  ALG_TAG_OFFSET,
  SIG_SIZE,
  CapKind,
  CaveatKind,
  Perm,
  Verifier,
  issue,
  attenuate,
  revoke,
  verifyRevocation,
  encodeRevocation,
  decodeRevocation,
  hash32,
  type Caveat,
  type Signer,
  type Issuance,
} from "@zap-proto/zap/cap";

// ---------------------------------------------------------------------------
// Helpers (mirroring the Go test helpers).
// ---------------------------------------------------------------------------

function u64bytes(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
  return out;
}
function u32pair(a: number, b: number): Uint8Array {
  const out = new Uint8Array(8);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, a, true);
  dv.setUint32(4, b, true);
  return out;
}
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/** issuerKeyFn builds a Verifier.issuerKey lookup over known signers. */
function issuerKeyFn(...signers: Ed25519Signer[]) {
  const m = new Map<string, Uint8Array>();
  for (const s of signers) m.set(bytesToHex(s.public()), s.publicKey());
  return (h: Uint8Array): Uint8Array | null => m.get(bytesToHex(h)) ?? null;
}

/** fieldAbsOff returns the absolute byte offset of a cap field in the buffer. */
function fieldAbsOff(raw: Uint8Array, fieldOff: number): number {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return dv.getUint32(8, true) + fieldOff;
}
const OFF_PERMISSIONS = 100;
const OFF_PARENT = 108;
const OFF_SIG = 164;

function sigAbsOff(raw: Uint8Array): number {
  return fieldAbsOff(raw, OFF_SIG);
}

// ---------------------------------------------------------------------------
// Issue round-trip.
// ---------------------------------------------------------------------------

describe("cap: Issue round-trip", () => {
  it("issues a cap and reads every field back (TestIssueRoundTrip)", () => {
    const signer = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    const holder = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      target[i] = i;
      holder[i] = 255 - i;
    }
    const in_: Issuance = {
      kind: CapKind.IAMSession,
      target,
      holder,
      permissions: 0xdeadbeefcafebaben,
      issuedAt: 1700000000n,
      expiresAt: 2000000000n,
      caveats: [
        { kind: CaveatKind.MaxAmount, value: u64bytes(1_000_000n) },
        { kind: CaveatKind.RateLimit, value: u32pair(60, 10) },
        { kind: CaveatKind.IPCIDR, value: new TextEncoder().encode("10.0.0.0/8") },
      ],
    };
    const c = issue(in_, signer);

    expect(c.kind()).toBe(CapKind.IAMSession);
    expect(bytesEqual(c.target(), target)).toBe(true);
    expect(bytesEqual(c.holder(), holder)).toBe(true);
    expect(bytesEqual(c.issuer(), signer.public())).toBe(true);
    expect(c.permissions()).toBe(0xdeadbeefcafebaben);
    expect(c.issuedAt()).toBe(1700000000n);
    expect(c.expiresAt()).toBe(2000000000n);
    expect(c.numCaveats()).toBe(3);

    const all = c.caveats();
    expect(all[0].kind).toBe(CaveatKind.MaxAmount);
    expect(bytesEqual(all[0].value, u64bytes(1_000_000n))).toBe(true);
    expect(all[1].kind).toBe(CaveatKind.RateLimit);
    expect(bytesEqual(all[1].value, u32pair(60, 10))).toBe(true);
    expect(all[2].kind).toBe(CaveatKind.IPCIDR);
    expect(new TextDecoder().decode(all[2].value)).toBe("10.0.0.0/8");

    // raw() round-trips through wrap.
    const rewrapped = Cap.wrap(c.raw());
    expect(rewrapped.kind()).toBe(c.kind());
  });
});

// ---------------------------------------------------------------------------
// Verify: accept fresh, reject expired/revoked/unknown-issuer/tampered.
// ---------------------------------------------------------------------------

describe("cap: Verify", () => {
  it("accepts a freshly minted cap (TestVerifyAcceptsFresh)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue(
      { kind: CapKind.KMSAccess, permissions: 0xffn, expiresAt: 2000000000n },
      signer,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(c, 1700000000n)).toBeNull();
  });

  it("refuses an unknown caveat kind (fail-closed, SPEC §2.3)", () => {
    // Was a cross-language divergence: Go/Python accepted, Rust rejected. Now
    // all four fail-closed — a caveat is a restriction that cannot be ignored.
    const signer = Ed25519Signer.generate();
    const c = issue(
      {
        kind: CapKind.KMSAccess,
        permissions: 0xffn,
        expiresAt: 2000000000n,
        caveats: [{ kind: 0x42424242, value: new TextEncoder().encode("must-not-be-ignored") }],
      },
      signer,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(c, 1700000000n)?.code).toBe("unknown_caveat");
    expect(v.verifyChain(c, [], 0x01n, c.target(), c.holder(), 1700000000n)?.code).toBe(
      "unknown_caveat",
    );
  });

  it("rejects an expired cap (TestVerifyRejectsExpired)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue(
      { kind: CapKind.KMSAccess, permissions: 0xffn, expiresAt: 1700000000n },
      signer,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(c, 1700000001n)?.code).toBe("expired");
  });

  it("rejects a revoked cap (TestVerifyRejectsRevoked)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n }, signer);
    const id = c.id();
    const v = new Verifier({
      issuerKey: issuerKeyFn(signer),
      isRevoked: (x) => bytesEqual(x, id),
    });
    expect(v.verify(c, 1n)?.code).toBe("revoked");
  });

  it("rejects an unknown issuer (TestVerifyRejectsUnknownIssuer)", () => {
    const signer = Ed25519Signer.generate();
    const other = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n }, signer);
    const v = new Verifier({ issuerKey: issuerKeyFn(other) });
    expect(v.verify(c, 1n)?.code).toBe("issuer_unknown");
  });

  it("rejects a tampered buffer (TestVerifyRejectsTamperedBuffer)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n }, signer);
    const tampered = c.raw().slice();
    tampered[fieldAbsOff(tampered, OFF_PERMISSIONS)] ^= 0x01;
    const tc = Cap.wrap(tampered);
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(tc, 1n)?.code).toBe("sig_mismatch");
  });
});

// ---------------------------------------------------------------------------
// Attenuate.
// ---------------------------------------------------------------------------

describe("cap: Attenuate", () => {
  it("intersects permissions and links parent (TestAttenuateIntersectsPermissions)", () => {
    const root = Ed25519Signer.generate();
    const child = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    target[0] = 0xab;

    const parent = issue(
      {
        kind: CapKind.ATSOrder,
        target,
        holder: root.public(),
        permissions: Perm.Attenuate | 0b11110000n,
        expiresAt: 2000000000n,
      },
      root,
    );
    const leaf = attenuate(
      parent,
      child.public(),
      0b10100110n,
      [{ kind: CaveatKind.MaxAmount, value: u64bytes(100n) }],
      0n,
      root,
    );

    expect(leaf.permissions()).toBe(0b11110000n & 0b10100110n);
    expect(bytesEqual(leaf.parent(), parent.id())).toBe(true);
    expect(bytesEqual(leaf.issuer(), root.public())).toBe(true);
    expect(bytesEqual(leaf.target(), target)).toBe(true);
    expect(leaf.expiresAt()).toBe(parent.expiresAt());
  });

  it("requires the parent's holder key to sign (TestAttenuateRequiresParentHolderKey)", () => {
    const root = Ed25519Signer.generate();
    const imposter = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const parent = issue(
      { kind: CapKind.IAMSession, permissions: 0xffn, holder: root.public(), expiresAt: 2000000000n },
      root,
    );
    expect(() => attenuate(parent, holder.public(), 0xffn, undefined, 0n, imposter)).toThrow(
      CapError,
    );
    try {
      attenuate(parent, holder.public(), 0xffn, undefined, 0n, imposter);
    } catch (e) {
      expect((e as CapError).code).toBe("chain_broken");
    }
  });

  it("clamps child expiry to the parent's (TestAttenuateCapsExpiryDownward)", () => {
    const root = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const parent = issue(
      { kind: CapKind.IAMSession, permissions: Perm.Attenuate | 0xffn, holder: root.public(), expiresAt: 1000n },
      root,
    );
    const leaf = attenuate(parent, holder.public(), Perm.Attenuate | 0xffn, undefined, 9999n, root);
    expect(leaf.expiresAt()).toBe(1000n);
  });

  it("refuses to mint without PermAttenuate (TestAttenuateRefusesWithoutPermAttenuate)", () => {
    const root = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const parent = issue(
      { kind: CapKind.IAMSession, holder: root.public(), permissions: 0xffn, expiresAt: 2000000000n },
      root,
    );
    try {
      attenuate(parent, holder.public(), 0x0fn, undefined, 0n, root);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CapError).code).toBe("not_delegable");
    }
  });

  it("permits attenuation for a Delegate-kind parent (TestAttenuateAllowedForDelegateKind)", () => {
    const root = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const parent = issue(
      { kind: CapKind.Delegate, holder: root.public(), permissions: 0xffn, expiresAt: 2000000000n },
      root,
    );
    // No PermAttenuate, but Kind == Delegate → allowed.
    const leaf = attenuate(parent, holder.public(), 0x0fn, undefined, 0n, root);
    expect(leaf.kind()).toBe(CapKind.Delegate);
  });
});

// ---------------------------------------------------------------------------
// VerifyChain.
// ---------------------------------------------------------------------------

describe("cap: VerifyChain", () => {
  it("walks a happy 3-link chain (TestVerifyChainHappyPath)", () => {
    const root = Ed25519Signer.generate();
    const mid = Ed25519Signer.generate();
    const leaf = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    target[31] = 0xee;

    const rootCap = issue(
      {
        kind: CapKind.MPCSign,
        target,
        holder: root.public(),
        permissions: Perm.Attenuate | 0xffn,
        expiresAt: 2000000000n,
      },
      root,
    );
    const midCap = attenuate(rootCap, mid.public(), Perm.Attenuate | 0x0fn, undefined, 0n, root);
    const leafCap = attenuate(midCap, leaf.public(), 0x07n, undefined, 0n, mid);

    const v = new Verifier({ issuerKey: issuerKeyFn(root, mid, leaf) });
    const e = v.verifyChain(leafCap, [midCap, rootCap], 0x04n, target, leaf.public(), 1700000000n);
    expect(e).toBeNull();
  });

  it("rejects a revoked parent (TestVerifyChainRejectsRevokedParent)", () => {
    const root = Ed25519Signer.generate();
    const mid = Ed25519Signer.generate();
    const leaf = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    target[0] = 0x01;

    const rootCap = issue(
      { holder: root.public(), target, permissions: Perm.Attenuate | 0xffn, expiresAt: 2000000000n, kind: CapKind.IAMSession },
      root,
    );
    const midCap = attenuate(rootCap, mid.public(), Perm.Attenuate | 0x0fn, undefined, 0n, root);
    const leafCap = attenuate(midCap, leaf.public(), 0x07n, undefined, 0n, mid);

    const revoked = midCap.id();
    const v = new Verifier({
      issuerKey: issuerKeyFn(root, mid, leaf),
      isRevoked: (id) => bytesEqual(id, revoked),
    });
    const e = v.verifyChain(leafCap, [midCap, rootCap], 0x04n, target, leaf.public(), 1700000000n);
    expect(e?.code).toBe("revoked");
  });

  it("rejects a broken link (TestVerifyChainRejectsBrokenLink)", () => {
    const root = Ed25519Signer.generate();
    const mid = Ed25519Signer.generate();
    const leaf = Ed25519Signer.generate();
    const other = Ed25519Signer.generate();
    const target = new Uint8Array(32);

    const rootCap = issue(
      { holder: root.public(), target, permissions: Perm.Attenuate | 0xffn, expiresAt: 2000000000n, kind: CapKind.IAMSession },
      root,
    );
    const midCap = attenuate(rootCap, mid.public(), Perm.Attenuate | 0x0fn, undefined, 0n, root);
    const leafCap = attenuate(midCap, leaf.public(), 0x07n, undefined, 0n, mid);
    const bogus = issue(
      { holder: other.public(), target, permissions: Perm.Attenuate | 0xffn, expiresAt: 2000000000n, kind: CapKind.IAMSession },
      other,
    );

    const v = new Verifier({ issuerKey: issuerKeyFn(root, mid, leaf, other) });
    const e = v.verifyChain(leafCap, [bogus, rootCap], 0x04n, target, leaf.public(), 1700000000n);
    expect(e?.code).toBe("chain_broken");
  });

  it("rejects op not in permission mask (TestVerifyChainRejectsOpNotPermitted)", () => {
    const root = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    const c = issue(
      { holder: holder.public(), target, permissions: 0b0010n, expiresAt: 2000000000n, kind: CapKind.IAMSession },
      root,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(root, holder) });
    const e = v.verifyChain(c, [], 0b0100n, target, holder.public(), 1n);
    expect(e?.code).toBe("op_not_permitted");
  });

  it("requires a root for an empty chain (TestVerifyChainEmptyChainRequiresRoot)", () => {
    const root = Ed25519Signer.generate();
    const holder = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    const c = issue(
      { holder: holder.public(), target, permissions: 0xffn, expiresAt: 2000000000n, kind: CapKind.IAMSession },
      root,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(root, holder) });
    expect(v.verifyChain(c, [], 0x01n, target, holder.public(), 1n)).toBeNull();

    // Pretend it has a parent; empty chain should now fail (sig breaks first —
    // both are "reject", confirming we never silently accept).
    const tampered = c.raw().slice();
    tampered[fieldAbsOff(tampered, OFF_PARENT)] = 0x99;
    const bad = Cap.wrap(tampered);
    expect(v.verifyChain(bad, [], 0x01n, target, holder.public(), 1n)).not.toBeNull();
  });

  it("rejects an undelegated parent at verify time (TestVerifyChainRejectsUndelegatedParent)", () => {
    const root = Ed25519Signer.generate();
    const mid = Ed25519Signer.generate();
    const target = new Uint8Array(32);
    target[0] = 0x7e;

    // Root WITHOUT PermAttenuate. Mint mid by issuing directly (bypassing the
    // Attenuate mint-time gate) with a correct chain shape.
    const rootCap = issue(
      { kind: CapKind.IAMSession, holder: root.public(), target, permissions: 0x0fn, expiresAt: 2000000000n },
      root,
    );
    const midCap = issue(
      {
        kind: CapKind.IAMSession,
        holder: mid.public(),
        target,
        permissions: 0x07n,
        parent: rootCap.id(),
        expiresAt: 2000000000n,
      },
      root,
    );
    const v = new Verifier({ issuerKey: issuerKeyFn(root, mid) });
    const e = v.verifyChain(midCap, [rootCap], 0x01n, target, mid.public(), 1700000000n);
    expect(e?.code).toBe("not_delegable");
  });
});

// ---------------------------------------------------------------------------
// Revocation.
// ---------------------------------------------------------------------------

describe("cap: Revocation", () => {
  it("revokes and verifies (TestRevokeAndVerify)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const r = revoke(c, 1234567890n, signer);
    expect(bytesEqual(r.capID, c.id())).toBe(true);
    expect(r.revokedAt).toBe(1234567890n);
    expect(verifyRevocation(r, signer.publicKey())).toBeNull();
  });

  it("requires the issuer key to revoke (TestRevokeRequiresIssuerKey)", () => {
    const signer = Ed25519Signer.generate();
    const imposter = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    try {
      revoke(c, 1n, imposter);
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CapError).code).toBe("chain_broken");
    }
  });

  it("rejects a tampered revocation (TestVerifyRevocationRejectsTampered)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const r = revoke(c, 100n, signer);
    r.revokedAt = 200n; // tamper
    expect(verifyRevocation(r, signer.publicKey())).not.toBeNull();
  });

  it("round-trips a Revocation through encode/decode", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const r = revoke(c, 100n, signer);
    const dec = decodeRevocation(encodeRevocation(r));
    expect(bytesEqual(dec.capID, r.capID)).toBe(true);
    expect(dec.revokedAt).toBe(100n);
    expect(bytesEqual(dec.revokerSig, r.revokerSig)).toBe(true);
    // The decoded revocation still verifies.
    expect(verifyRevocation(dec, signer.publicKey())).toBeNull();
  });

  it("dispatches revocation on the scheme tag, fail-closed (TestVerifyRevocationSchemeAware + FailsClosed)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const r = revoke(c, 100n, signer);
    // Bootstrap ed25519 path accepted.
    expect(verifyRevocation(r, signer.publicKey())).toBeNull();

    // A non-ed25519 tag routes to the hook.
    const rPQ = { ...r, revokerSig: r.revokerSig.slice() };
    rPQ.revokerSig[ALG_TAG_OFFSET] = Scheme.MLDSA65;
    let sawScheme = 0;
    const v = new Verifier({
      schemeVerify: (s) => {
        sawScheme = s;
        if (s === Scheme.MLDSA65) return null; // pretend the PQ signature verifies
        return new CapError("unhandled_scheme");
      },
    });
    expect(v.verifyRevocation(rPQ, signer.publicKey())).toBeNull();
    expect(sawScheme).toBe(Scheme.MLDSA65);

    // Reserved / unknown tags fail closed.
    for (const tag of [0x00, 0x7f, 0xff]) {
      const bad = { ...r, revokerSig: r.revokerSig.slice() };
      bad.revokerSig[ALG_TAG_OFFSET] = tag;
      expect(verifyRevocation(bad, signer.publicKey())?.code).toBe("unhandled_scheme");
    }
  });
});

// ---------------------------------------------------------------------------
// Caveat encoding for every kind.
// ---------------------------------------------------------------------------

describe("cap: Caveat encoding", () => {
  it("encodes and reads back every CaveatKind (TestCaveatEncodingAllKinds)", () => {
    const signer = Ed25519Signer.generate();
    const chainID = new Uint8Array(32);
    const assetID = new Uint8Array(32);
    const audience = new Uint8Array(32);
    const nonce = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      chainID[i] = i;
      assetID[i] = 0xa0 + (i & 0x0f);
      audience[i] = 0xc0 + (i & 0x0f);
      nonce[i] = 0xe0 + (i & 0x0f);
    }
    const cases: Caveat[] = [
      { kind: CaveatKind.ExpiresAt, value: u64bytes(2000000000n) },
      { kind: CaveatKind.MaxAmount, value: u64bytes(42n) },
      { kind: CaveatKind.DestChain, value: chainID },
      { kind: CaveatKind.RateLimit, value: u32pair(120, 30) },
      { kind: CaveatKind.IPCIDR, value: new TextEncoder().encode("192.168.0.0/16") },
      { kind: CaveatKind.AssetID, value: assetID },
      { kind: CaveatKind.OpAllow, value: u64bytes(0xf0f0f0f0n) },
      { kind: CaveatKind.MaxDepth, value: Uint8Array.of(0x05) },
      { kind: CaveatKind.Audience, value: audience },
      { kind: CaveatKind.NonceHash, value: nonce },
    ];
    const c = issue(
      { kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n, caveats: cases },
      signer,
    );
    expect(c.numCaveats()).toBe(cases.length);
    const got = c.caveats();
    for (let i = 0; i < cases.length; i++) {
      expect(got[i].kind).toBe(cases[i].kind);
      expect(bytesEqual(got[i].value, cases[i].value)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SPEC §3 canonical bytes.
// ---------------------------------------------------------------------------

describe("cap: canonical bytes (SPEC §3)", () => {
  it("pins the exact signed-bytes layout (TestCanonicalBytesShape)", () => {
    const signer = Ed25519Signer.generate();
    const caveats: Caveat[] = [
      { kind: CaveatKind.MaxAmount, value: u64bytes(7n) },
      { kind: CaveatKind.IPCIDR, value: new TextEncoder().encode("10.0.0.0/8") },
    ];
    const c = issue(
      { kind: CapKind.KMSAccess, permissions: 0xffn, expiresAt: 2000000000n, caveats },
      signer,
    );
    const got = c.canonicalBytes();

    // Reconstruct independently: header [0..164) + per-caveat (Kind LE || len LE || Value).
    const raw = c.raw();
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const rootOff = dv.getUint32(8, true);
    const SIGNED_HEADER_LEN = 164;
    let wantLen = SIGNED_HEADER_LEN;
    for (const cv of caveats) wantLen += 8 + cv.value.byteLength;
    const want = new Uint8Array(wantLen);
    want.set(raw.subarray(rootOff, rootOff + SIGNED_HEADER_LEN), 0);
    let p = SIGNED_HEADER_LEN;
    const wdv = new DataView(want.buffer);
    for (const cv of caveats) {
      wdv.setUint32(p, cv.kind, true);
      wdv.setUint32(p + 4, cv.value.byteLength, true);
      want.set(cv.value, p + 8);
      p += 8 + cv.value.byteLength;
    }
    expect(bytesToHex(got)).toBe(bytesToHex(want));
    expect(got.byteLength).toBe(SIGNED_HEADER_LEN + (8 + 8) + (8 + "10.0.0.0/8".length));
    // Must NOT include the Sig footer.
    expect(got.byteLength).toBeLessThan(SIGNED_HEADER_LEN + SIG_SIZE);
  });

  it("excludes the Sig field from the signed scope (TestSignatureExcludesSigField)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.KMSAccess, permissions: 0xffn, expiresAt: 2000000000n }, signer);
    const before = c.canonicalBytes().slice();

    // Scribble a zero-pad byte inside the Sig footer (after the 64-byte sig,
    // before the tag).
    const raw = c.raw().slice();
    raw[sigAbsOff(raw) + 100] ^= 0xff;
    const c2 = Cap.wrap(raw);
    expect(bytesToHex(c2.canonicalBytes())).toBe(bytesToHex(before));
    // And it still verifies (the scribble was outside the signed scope and the tag).
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(c2, 1n)).toBeNull();
  });

  it("detects a header tamper (TestVerifyDetectsHeaderTamper)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.KMSAccess, permissions: 0xffn, expiresAt: 2000000000n }, signer);
    const raw = c.raw().slice();
    raw[fieldAbsOff(raw, OFF_PERMISSIONS)] ^= 0x01;
    const tc = Cap.wrap(raw);
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(tc, 1n)?.code).toBe("sig_mismatch");
  });
});

// ---------------------------------------------------------------------------
// Fail-closed scheme dispatch (SPEC §2.3 step 3c).
// ---------------------------------------------------------------------------

describe("cap: fail-closed scheme dispatch", () => {
  it("refuses caps with reserved/unknown scheme tags (TestVerifyFailsClosedOnUnknownScheme)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    for (const tag of [0x00, 0x7f, 0xff]) {
      const raw = c.raw().slice();
      raw[sigAbsOff(raw) + ALG_TAG_OFFSET] = tag;
      const bad = Cap.wrap(raw);
      expect(v.verify(bad, 1n)?.code).toBe("unhandled_scheme");
    }
  });

  it("pins exactly which scheme tags are known (TestSchemeKnownSet)", () => {
    const known = new Set([Scheme.Secp256k1, Scheme.Ed25519, Scheme.MLDSA65, Scheme.Hybrid]);
    for (let s = 0; s <= 0xff; s++) {
      expect(schemeKnown(s)).toBe(known.has(s as never));
    }
    expect(schemeKnown(Scheme.Reserved)).toBe(false);
  });

  it("never downgrades a hooked-but-declined PQ scheme to ed25519", () => {
    // A cap tagged ML-DSA-65 whose hook DECLINES must be refused, not verified
    // under ed25519 (no silent downgrade).
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const raw = c.raw().slice();
    raw[sigAbsOff(raw) + ALG_TAG_OFFSET] = Scheme.MLDSA65;
    const bad = Cap.wrap(raw);
    const v = new Verifier({
      issuerKey: issuerKeyFn(signer),
      schemeVerify: () => new CapError("unhandled_scheme"), // declines everything
    });
    expect(v.verify(bad, 1n)?.code).toBe("unhandled_scheme");
  });

  it("a custom scheme hook can accept a known non-ed25519 scheme", () => {
    // Prove the hook is honored: tag the cap secp256k1 and let the hook accept.
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const raw = c.raw().slice();
    raw[sigAbsOff(raw) + ALG_TAG_OFFSET] = Scheme.Secp256k1;
    const bad = Cap.wrap(raw);
    let saw = -1;
    const v = new Verifier({
      issuerKey: issuerKeyFn(signer),
      schemeVerify: (s) => {
        saw = s;
        return s === Scheme.Secp256k1 ? null : new CapError("unhandled_scheme");
      },
    });
    expect(v.verify(bad, 1n)).toBeNull();
    expect(saw).toBe(Scheme.Secp256k1);
  });

  it("a missing JS PQ primitive is fail-closed by default (no fabricated verify)", () => {
    // The default Verifier (no schemeVerify hook) implements ONLY ed25519; an
    // ML-DSA-65 cap is rejected rather than fabricated as valid. This is the
    // JS-runtime "scheme unavailable" guarantee the report documents.
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 1n, expiresAt: 2000000000n }, signer);
    const raw = c.raw().slice();
    raw[sigAbsOff(raw) + ALG_TAG_OFFSET] = Scheme.MLDSA65;
    const bad = Cap.wrap(raw);
    const v = new Verifier({ issuerKey: issuerKeyFn(signer) });
    expect(v.verify(bad, 1n)?.code).toBe("unhandled_scheme");
  });
});

// ---------------------------------------------------------------------------
// v1.1 wire shape + framing.
// ---------------------------------------------------------------------------

describe("cap: v1.1 wire shape & framing", () => {
  it("freezes the v1.1 footer width (TestSigSize_V1_1)", () => {
    expect(SIG_SIZE).toBe(3408);
    expect(ALG_TAG_OFFSET).toBe(SIG_SIZE - 1);
  });

  it("the signer writes the Ed25519 alg tag (TestEd25519Signer_WritesAlgTag)", () => {
    const signer = Ed25519Signer.generate();
    const sig = signer.sign(new TextEncoder().encode("test payload"));
    expect(sig.byteLength).toBe(SIG_SIZE);
    expect(sig[ALG_TAG_OFFSET]).toBe(Scheme.Ed25519);
  });

  it("a minted cap persists the alg tag on the wire (TestIssueRoundTrip_AlgTagPersisted)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue({ kind: CapKind.IAMSession, permissions: 0xffn, expiresAt: 2000000000n }, signer);
    expect(c.signature()[ALG_TAG_OFFSET]).toBe(Scheme.Ed25519);
  });

  it("rejects a short buffer (TestWrapRejectsShortBuffer)", () => {
    try {
      Cap.wrap(new Uint8Array(10));
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CapError).code).toBe("too_short");
    }
  });

  it("rejects bad magic (TestWrapRejectsBadMagic)", () => {
    try {
      Cap.wrap(new Uint8Array(512));
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CapError).code).toBe("bad_magic");
    }
  });

  it("rejects a truncated buffer (TestWrapRejectsMismatchedCaveatLen)", () => {
    const signer = Ed25519Signer.generate();
    const c = issue(
      {
        kind: CapKind.IAMSession,
        permissions: 1n,
        expiresAt: 2000000000n,
        caveats: [{ kind: CaveatKind.MaxAmount, value: u64bytes(1n) }],
      },
      signer,
    );
    const truncated = c.raw().subarray(0, c.raw().byteLength - 1);
    expect(() => Cap.wrap(truncated)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// A custom (non-Ed25519Signer) Signer can be plugged — proves the interface
// boundary matches Go's, and that a fully custom scheme round-trips through
// issue → verifyChain when its verifier hook is wired.
// ---------------------------------------------------------------------------

describe("cap: custom Signer + SchemeVerify interop", () => {
  it("issues with a custom secp256k1-tagged signer and verifies via a hook", () => {
    // A toy deterministic "signer" that tags secp256k1 and whose hook accepts
    // iff the trailing payload-hash marker matches — proves the Signer/Verifier
    // seam is real and scheme-agnostic, exactly like the Go cap.Signer +
    // Verifier.SchemeVerify pair. (NOT a real secp256k1 impl — it exercises the
    // dispatch seam; the real PQ/secp primitives are wired by consumers.)
    const pub = new Uint8Array(32).fill(0x5c);
    const marker = (payload: Uint8Array): Uint8Array => hash32(payload).subarray(0, 16);
    const customSigner: Signer = {
      sign(payload) {
        const out = new Uint8Array(SIG_SIZE);
        out.set(marker(payload), 0);
        out[ALG_TAG_OFFSET] = Scheme.Secp256k1;
        return out;
      },
      public() {
        return hash32(pub);
      },
    };
    const target = new Uint8Array(32);
    const holder = new Uint8Array(32).fill(0x11);
    const c = issue(
      { kind: CapKind.KMSSign, target, holder, permissions: 0x7n, expiresAt: 2000000000n },
      customSigner,
    );
    expect(c.signature()[ALG_TAG_OFFSET]).toBe(Scheme.Secp256k1);

    const v = new Verifier({
      issuerKey: (h) => (bytesEqual(h, hash32(pub)) ? pub : null),
      schemeVerify: (s, _pub, payload, sig) => {
        if (s !== Scheme.Secp256k1) return new CapError("unhandled_scheme");
        return bytesEqual(sig.subarray(0, 16), marker(payload))
          ? null
          : new CapError("sig_mismatch");
      },
    });
    expect(v.verifyChain(c, [], 0x1n, target, holder, 1n)).toBeNull();

    // Tamper the payload (flip Permissions) → the marker no longer matches.
    const raw = c.raw().slice();
    raw[fieldAbsOff(raw, OFF_PERMISSIONS)] ^= 0x01;
    const bad = Cap.wrap(raw);
    expect(v.verify(bad, 1n)?.code).toBe("sig_mismatch");
  });
});
