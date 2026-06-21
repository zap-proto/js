// Copyright (C) 2025, Lux Industries Inc. All rights reserved.
// See the file LICENSE for licensing terms.

/**
 * cap.ts — the ZAP capability runtime for TypeScript.
 *
 * A Capability is a signed, attenuable token of authority. It grants a holder
 * permission to perform a bitmask of operations on a target, with optional
 * caveats. Caps form a chain: a parent's holder can issue an attenuated child
 * cap whose permissions are a subset of the parent's. {@link verifyChain} walks
 * the chain back to a root, checking each signature, the intersection of
 * permissions, expiry, revocation, and the delegation gate.
 *
 * This is the byte-for-byte TypeScript peer of github.com/zap-proto/go/cap. The
 * canonical signed bytes, the CapID hash construction, the delegation gate, the
 * monotonic permission narrowing, and the FAIL-CLOSED scheme dispatch are all
 * identical to the Go runtime — a Go-signed cap verifies here and a TS-signed
 * cap verifies in Go (proven by test/cap_go_kat.hex). See zap-spec/SPEC.md
 * §2.3/§3/§4 and capabilities_kinds.md.
 *
 * Signature scope (SPEC §3): the signed bytes are the canonical concatenation
 * Capability[0..164) || canonical(Caveats) — the fixed header up to and
 * including the Caveats list pointer, followed by each Caveat encoded as
 * Kind:u32-LE || len(Value):u32-LE || Value in list order. This EXCLUDES the
 * Sig field and the ZAP heap-area indirection bytes, and is recomputed
 * identically by signer and verifier, so heap layout cannot be tampered with
 * without breaking the signature and the signed bytes are identical across
 * every language runtime.
 *
 * Crypto: the default signer/verifier use node:crypto for synchronous Ed25519
 * (RFC 8032) and SHA-256 — zero npm dependencies, stdlib only, matching the Go
 * runtime's synchronous API exactly. Ed25519 is mandatory-to-implement;
 * ML-DSA-65 / hybrid / secp256k1 are FAIL-CLOSED unless a SchemeVerify hook is
 * wired (the JS runtime ships no PQ primitive — it never fabricates a verify
 * and never returns true on an unverified signature).
 *
 * This module reaches node:crypto and therefore lives behind the
 * `@zap-proto/zap/cap` sub-path; it is NOT pulled into the universal
 * (browser-safe) `@zap-proto/zap` root, mirroring how the node:net transport
 * lives behind `@zap-proto/zap/cap`'s sibling `@zap-proto/zap/node`.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";

import {
  Builder,
  ListView,
  Message,
  StructView,
} from "./index.js";

// ---------------------------------------------------------------------------
// Wire constants (capabilities.zap v1.1).
// ---------------------------------------------------------------------------

/**
 * SIG_SIZE is the fixed signature footer width in bytes. Sized at v1.1 to hold
 * any of: secp256k1 ECDSA (65 B), Ed25519 (64 B), ML-DSA-65 (3309 B, FIPS 204
 * §5.2 Level-3), or hybrid Ed25519+ML-DSA-65. 3408 is the smallest 16-byte
 * aligned size fitting ML-DSA-65 with headroom. Schemes shorter than SIG_SIZE
 * are zero-padded on the right; verifiers identify the scheme via the algorithm
 * tag in the final byte (Sig[SIG_SIZE-1]) and decode the leading bytes.
 */
export const SIG_SIZE = 3408;

/**
 * ALG_TAG_OFFSET is the offset of the algorithm-tag byte within the SIG_SIZE
 * footer. The byte at [SIG_SIZE-1] identifies which signature primitive a
 * verifier MUST use; it is part of the signed payload, so a tag flip changes
 * the signature and is caught by verifier mismatch.
 */
export const ALG_TAG_OFFSET = SIG_SIZE - 1;

// Capability fixed-section field offsets (generated from capabilities.zap).
const CAP_OFF = {
  Kind: 0,
  Target: 4,
  Holder: 36,
  Issuer: 68,
  Permissions: 100,
  Parent: 108,
  IssuedAt: 140,
  ExpiresAt: 148,
  Caveats: 156,
  Sig: 164,
} as const;
const CAP_SIZE = 3572;

// signedHeaderLen is the length of the fixed-header prefix the signature
// covers: Capability bytes [0..164), i.e. Kind through the Caveats list
// pointer, NOT including Sig. Equal to CAP_OFF.Sig.
const SIGNED_HEADER_LEN = CAP_OFF.Sig;

const CAVEAT_OFF = { Kind: 0, Value: 4 } as const;
const CAVEAT_SIZE = 12;

const REVOCATION_OFF = { CapID: 0, RevokedAt: 32, RevokerSig: 40 } as const;
const REVOCATION_SIZE = 3448;

const ZERO32 = new Uint8Array(32);

// ---------------------------------------------------------------------------
// Enums (capabilities_kinds.md — part of the wire contract).
// ---------------------------------------------------------------------------

/**
 * Scheme is the wire-level signature algorithm tag, written at
 * Sig[ALG_TAG_OFFSET]. Verifiers fail-closed on Reserved (0x00) and on values
 * not enumerated here. Numeric values MUST match capabilities_kinds.md.
 */
export const Scheme = {
  Reserved: 0x00,
  Secp256k1: 0x01,
  Ed25519: 0x02,
  MLDSA65: 0x03,
  Hybrid: 0x04,
} as const;
export type SchemeValue = (typeof Scheme)[keyof typeof Scheme];

/**
 * schemeKnown reports whether s is one of the registered signature schemes a
 * verifier may accept. Per SPEC §2.3 step 3c the valid set is exactly
 * {0x01,0x02,0x03,0x04}; Reserved (0x00) and any unassigned tag are NOT known,
 * so verifiers fail-closed on them.
 */
export function schemeKnown(s: number): boolean {
  return (
    s === Scheme.Secp256k1 ||
    s === Scheme.Ed25519 ||
    s === Scheme.MLDSA65 ||
    s === Scheme.Hybrid
  );
}

/** CapKind enumerates the kinds of authority a capability can confer. */
export const CapKind = {
  Reserved: 0x00,
  IAMSession: 0x01,
  IAMAPIKey: 0x02,
  KMSAccess: 0x10,
  KMSSign: 0x11,
  MPCSign: 0x20,
  ATSOrder: 0x30,
  BridgeXfer: 0x40,
  Stake: 0x50,
  Delegate: 0xff,
} as const;

/** CaveatKind enumerates the kinds of caveat that can be attached. */
export const CaveatKind = {
  ExpiresAt: 0x00,
  MaxAmount: 0x01,
  DestChain: 0x02,
  RateLimit: 0x03,
  IPCIDR: 0x04,
  AssetID: 0x05,
  OpAllow: 0x06,
  MaxDepth: 0x07,
  Audience: 0x08,
  NonceHash: 0x09,
} as const;

/**
 * Permission bits for Capability.Permissions (u64). Per capabilities_kinds.md,
 * each CapKind owns the bottom 32 bits (per-kind meaning), and the top 32 bits
 * are cross-cutting. Only the cross-cutting bits are normative wire-wide and
 * defined here; the per-kind low bits are owned by each consumer. These are
 * bigint because Permissions is a u64.
 */
export const Perm = {
  /** Attenuate (1<<32) — holder may mint child caps with subset perms. */
  Attenuate: 1n << 32n,
  /** Audit (1<<33) — holder may read the audit trail for Target. */
  Audit: 1n << 33n,
  /** Root (1<<63) — root-of-trust marker, set on root caps only. */
  Root: 1n << 63n,
} as const;

// ---------------------------------------------------------------------------
// Errors — one class, string codes mirroring the Go error sentinels so callers
// can branch (err.code) and tests assert the exact failure mode like Go's
// errors.Is.
// ---------------------------------------------------------------------------

export type CapErrorCode =
  | "too_short"
  | "bad_magic"
  | "bad_caveats"
  | "sig_mismatch"
  | "expired"
  | "revoked"
  | "chain_broken"
  | "perms_exceed_parent"
  | "not_delegable"
  | "op_not_permitted"
  | "target_mismatch"
  | "holder_mismatch"
  | "issuer_unknown"
  | "caveat_violation"
  | "unhandled_scheme"
  | "missing_signer";

const ERR_MESSAGES: Record<CapErrorCode, string> = {
  too_short: "cap: buffer too short",
  bad_magic: "cap: bad magic",
  bad_caveats: "cap: caveat block malformed",
  sig_mismatch: "cap: signature does not verify",
  expired: "cap: expired",
  revoked: "cap: revoked",
  chain_broken: "cap: chain link broken",
  perms_exceed_parent: "cap: permissions exceed parent",
  not_delegable: "cap: parent does not permit attenuation",
  op_not_permitted: "cap: op not in permission mask",
  target_mismatch: "cap: target does not match",
  holder_mismatch: "cap: holder does not match",
  issuer_unknown: "cap: issuer key unknown",
  caveat_violation: "cap: caveat violated",
  unhandled_scheme: "cap: signature scheme not handled",
  missing_signer: "cap: signer required",
};

/** CapError carries a {@link CapErrorCode} so callers branch on `err.code`. */
export class CapError extends Error {
  readonly code: CapErrorCode;
  constructor(code: CapErrorCode) {
    super(ERR_MESSAGES[code]);
    this.name = "CapError";
    this.code = code;
  }
}

function err(code: CapErrorCode): CapError {
  return new CapError(code);
}

// ---------------------------------------------------------------------------
// Caveat (idiomatic struct) + canonical encoding.
// ---------------------------------------------------------------------------

/**
 * Caveat is one constraint attached to a capability. Value bytes alias the
 * underlying ZAP buffer when produced by a {@link Cap}; callers must not mutate
 * Value in-place. Caveat literals passed into {@link issue}/{@link attenuate}
 * are copied during build.
 */
export interface Caveat {
  kind: number;
  value: Uint8Array;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Codec views/builders (generated from capabilities.zap; vendored into the cap
// module exactly as the Go runtime vendors capabilities_zap.go into package
// cap). Built on the runtime's Builder / StructView / Message / ListView.
// ---------------------------------------------------------------------------

/** capRootOff reads the absolute root-object offset from the ZAP header [8:12). */
function capRootOff(raw: Uint8Array): number {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  return dv.getUint32(8, true);
}

/** A read-only StructView over a Caveat sub-message. */
class CaveatViewT extends StructView {
  kind(): number {
    return this.u32(CAVEAT_OFF.Kind);
  }
  value(): Uint8Array {
    return this.bytes(CAVEAT_OFF.Value);
  }
}

/** Build a ZAP-encoded Caveat sub-message (matches Go NewCaveatView). */
function newCaveatBytes(kind: number, value: Uint8Array): Uint8Array {
  const b = new Builder(256);
  const ob = b.startObject(CAVEAT_SIZE);
  ob.setU32(CAVEAT_OFF.Kind, kind);
  ob.setBytes(CAVEAT_OFF.Value, value);
  ob.finishAsRoot();
  return b.finish();
}

/** Build a ZAP-encoded Capability message (matches Go NewCapabilityView). */
function newCapabilityBytes(in_: {
  kind: number;
  target: Uint8Array;
  holder: Uint8Array;
  issuer: Uint8Array;
  permissions: bigint;
  parent: Uint8Array;
  issuedAt: bigint;
  expiresAt: bigint;
  caveats: Uint8Array[];
  sig: Uint8Array;
}): Uint8Array {
  const b = new Builder(256);
  const ob = b.startObject(CAP_SIZE);
  ob.setU32(CAP_OFF.Kind, in_.kind);
  ob.setBytesFixed(CAP_OFF.Target, in_.target);
  ob.setBytesFixed(CAP_OFF.Holder, in_.holder);
  ob.setBytesFixed(CAP_OFF.Issuer, in_.issuer);
  ob.setU64(CAP_OFF.Permissions, in_.permissions);
  ob.setBytesFixed(CAP_OFF.Parent, in_.parent);
  ob.setU64(CAP_OFF.IssuedAt, in_.issuedAt);
  ob.setU64(CAP_OFF.ExpiresAt, in_.expiresAt);
  const lb = b.startList();
  for (const elem of in_.caveats) lb.addObjectBytes(elem);
  ob.setList(CAP_OFF.Caveats, lb.finishOffset(), in_.caveats.length);
  ob.setBytesFixed(CAP_OFF.Sig, in_.sig);
  ob.finishAsRoot();
  return b.finish();
}

// ---------------------------------------------------------------------------
// Cap — a zero-copy view over a capability buffer. Constructed by wrap().
// ---------------------------------------------------------------------------

/**
 * Cap is a zero-copy view over a capability buffer. All accessors read directly
 * from the raw bytes without allocating; Value slices returned from caveats()
 * alias the underlying buffer (do not mutate). Constructed by {@link wrap}.
 */
export class Cap extends StructView {
  /**
   * wrap parses a capability buffer and returns a typed zero-copy view.
   * Validates ZAP framing (magic, version, size) plus capability-specific
   * structural checks (sig field within bounds, caveat framing). Cryptographic
   * verification lives in {@link Verifier}. Throws {@link CapError} on bad
   * framing — the analogue of Go's Wrap returning an error.
   */
  static wrap(b: Uint8Array): Cap {
    if (b.byteLength < 16) throw err("too_short");
    let msg: Message;
    try {
      msg = Message.parse(b);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("magic")) throw err("bad_magic");
      throw err("too_short");
    }
    const root = msg.root();
    const c = new Cap(root.data, root.offset);
    // Sanity-check that the sig field is within bounds.
    if (root.offset + CAP_OFF.Sig + SIG_SIZE > b.byteLength) throw err("too_short");
    // Walk caveats once to catch bad framing up front.
    const list = c.caveatsList();
    for (let i = 0; i < list.len(); i++) {
      if (list.objectAt(i).isNull()) throw err("bad_caveats");
    }
    return c;
  }

  /** raw returns the underlying wire buffer without copying. */
  raw(): Uint8Array {
    return this.data.subarray(0);
  }

  kind(): number {
    return this.u32(CAP_OFF.Kind);
  }
  target(): Uint8Array {
    return this.bytesFixed(CAP_OFF.Target, 32);
  }
  holder(): Uint8Array {
    return this.bytesFixed(CAP_OFF.Holder, 32);
  }
  issuer(): Uint8Array {
    return this.bytesFixed(CAP_OFF.Issuer, 32);
  }
  permissions(): bigint {
    return this.u64(CAP_OFF.Permissions);
  }
  parent(): Uint8Array {
    return this.bytesFixed(CAP_OFF.Parent, 32);
  }
  issuedAt(): bigint {
    return this.u64(CAP_OFF.IssuedAt);
  }
  expiresAt(): bigint {
    return this.u64(CAP_OFF.ExpiresAt);
  }
  signature(): Uint8Array {
    return this.bytesFixed(CAP_OFF.Sig, SIG_SIZE);
  }

  /** The raw caveats ListView (variable-element list of Caveat sub-messages). */
  private caveatsList(): ListView {
    return this.list(CAP_OFF.Caveats);
  }

  /**
   * caveatFramingOk walks the caveat list once and reports whether every element
   * parses as a ZAP sub-message. The verifier re-checks this defensively even
   * though wrap() also validates it (matching Go's Verify re-walk).
   */
  caveatFramingOk(): boolean {
    const list = this.caveatsList();
    for (let i = 0; i < list.len(); i++) {
      if (list.objectAt(i).isNull()) return false;
    }
    return true;
  }

  /** numCaveats returns the number of caveats attached to this cap. */
  numCaveats(): number {
    return this.caveatsList().len();
  }

  /**
   * caveats returns the slice of caveats decoded in one walk. Values alias the
   * buffer; do not mutate.
   */
  caveats(): Caveat[] {
    const list = this.caveatsList();
    const n = list.len();
    const out: Caveat[] = [];
    for (let i = 0; i < n; i++) {
      const sub = list.objectAt(i);
      if (sub.isNull()) return out;
      const cv = new CaveatViewT(sub.data, sub.offset);
      out.push({ kind: cv.kind(), value: cv.value() });
    }
    return out;
  }

  /**
   * canonicalBytes returns the exact bytes a Capability's signature is computed
   * over, per SPEC §3: Capability[0..164) || for each Caveat in list order
   * (Kind:u32-LE || len(Value):u32-LE || Value). The fixed-header prefix is read
   * verbatim from the wire buffer; the caveat section is RECOMPUTED from the
   * decoded caveats (not copied from the ZAP heap), excluding heap-area pointer
   * indirection so a tamperer cannot perturb the signature by rewriting heap
   * layout, and making the signed bytes identical across language runtimes.
   * Does NOT include Sig.
   */
  canonicalBytes(): Uint8Array {
    const hdrOff = capRootOff(this.data);
    const caveats = this.caveats();
    let caveatLen = 0;
    for (const cv of caveats) caveatLen += 8 + cv.value.byteLength;
    const out = new Uint8Array(SIGNED_HEADER_LEN + caveatLen);
    // Fixed header [0..164).
    out.set(this.data.subarray(hdrOff, hdrOff + SIGNED_HEADER_LEN), 0);
    // Canonical caveat encoding, in list order.
    let p = SIGNED_HEADER_LEN;
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (const cv of caveats) {
      dv.setUint32(p, cv.kind, true);
      dv.setUint32(p + 4, cv.value.byteLength, true);
      out.set(cv.value, p + 8);
      p += 8 + cv.value.byteLength;
    }
    return out;
  }

  /**
   * id returns the canonical 32-byte identifier of this cap. Per SPEC §4 the
   * CapID is SHA-256(canonicalBytes || Sig) — the exact bytes signed at issue
   * time plus the signature footer. Revocation records key on id, and the chain
   * walk matches each child's parent to its parent's id, so this construction is
   * what binds the chain.
   */
  id(): Uint8Array {
    const canon = this.canonicalBytes();
    const sig = this.signature();
    const buf = new Uint8Array(canon.byteLength + sig.byteLength);
    buf.set(canon, 0);
    buf.set(sig, canon.byteLength);
    return hash32(buf);
  }
}

/**
 * hash32 is the package's canonical 32-byte hash function. SHA-256 is the
 * spec-mandated CapID hash (SPEC §4): in every target language's stdlib, so
 * cross-language CapIDs are trivially reproducible. Synchronous via
 * node:crypto, matching the Go runtime's crypto/sha256.
 */
export function hash32(b: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(b).digest());
}

// ---------------------------------------------------------------------------
// Signer — abstracts the issuer's signing key. The default Ed25519 signer uses
// node:crypto (synchronous, RFC 8032). Production PQ deployments plug an
// ML-DSA-65 Signer via a consumer's auth layer.
// ---------------------------------------------------------------------------

/**
 * Signer abstracts the issuer's signing key. The v1.1 footer (SIG_SIZE bytes)
 * holds any supported primitive; implementations write their scheme tag at
 * sig[ALG_TAG_OFFSET] before signing so verifiers can dispatch on it.
 */
export interface Signer {
  /**
   * sign returns a fixed-size (SIG_SIZE) signature over payload. The signature
   * MUST verify under public() on the verifier side. The final byte
   * (sig[ALG_TAG_OFFSET]) MUST carry the algorithm tag. Synchronous to match
   * the Go runtime and keep the cap lifecycle non-async.
   */
  sign(payload: Uint8Array): Uint8Array;

  /**
   * public returns the canonical 32-byte hash of the signer's public key. This
   * must match the cap's Issuer field for {@link Verifier.verify} to accept the
   * signature.
   */
  public(): Uint8Array;
}

// Fixed ASN.1 wrappers for raw Ed25519 keys (RFC 8410). node:crypto imports
// only DER PKCS8 / SPKI for Ed25519, so we frame the raw 32-byte seed/pubkey
// with these constant prefixes — deterministic, zero-dependency.
const ED25519_PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04,
  0x22, 0x04, 0x20,
]);
const ED25519_SPKI_PREFIX = Uint8Array.from([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

function ed25519Pkcs8(seed: Uint8Array): Buffer {
  if (seed.byteLength !== 32) throw new Error("cap: ed25519 seed must be 32 bytes");
  const out = Buffer.allocUnsafe(ED25519_PKCS8_PREFIX.length + 32);
  out.set(ED25519_PKCS8_PREFIX, 0);
  out.set(seed, ED25519_PKCS8_PREFIX.length);
  return out;
}

function ed25519Spki(pub: Uint8Array): Buffer {
  if (pub.byteLength !== 32) throw new Error("cap: ed25519 pubkey must be 32 bytes");
  const out = Buffer.allocUnsafe(ED25519_SPKI_PREFIX.length + 32);
  out.set(ED25519_SPKI_PREFIX, 0);
  out.set(pub, ED25519_SPKI_PREFIX.length);
  return out;
}

/**
 * Ed25519Signer is a Signer backed by an Ed25519 key (node:crypto, RFC 8032).
 * Ed25519's native signature is 64 bytes; it is placed at the leading bytes of
 * the SIG_SIZE footer, the remaining bytes zero-padded, and the algorithm tag
 * (Scheme.Ed25519 = 0x02) written at sig[ALG_TAG_OFFSET]. The matching verifier
 * reads the leading 64 bytes back out and ignores the pad and tag byte.
 */
export class Ed25519Signer implements Signer {
  private readonly seed: Buffer;
  private readonly rawPub: Uint8Array;
  private readonly pubHash: Uint8Array;

  private constructor(seed: Uint8Array, rawPub: Uint8Array) {
    this.seed = ed25519Pkcs8(seed);
    this.rawPub = rawPub;
    this.pubHash = hash32(rawPub);
  }

  /** rawPubFromSeed derives the raw 32-byte Ed25519 public key from a seed. */
  private static rawPubFromSeed(seed: Uint8Array): Uint8Array {
    const priv = createPrivateKey({ key: ed25519Pkcs8(seed), format: "der", type: "pkcs8" });
    const spki = createPublicKey(priv).export({ format: "der", type: "spki" }) as Buffer;
    return new Uint8Array(spki.subarray(spki.byteLength - 32));
  }

  /** fromSeed builds a signer from a fixed 32-byte Ed25519 seed (deterministic). */
  static fromSeed(seed: Uint8Array): Ed25519Signer {
    return new Ed25519Signer(seed, Ed25519Signer.rawPubFromSeed(seed));
  }

  /** generate creates a fresh random keypair from a CSPRNG 32-byte seed. */
  static generate(): Ed25519Signer {
    return Ed25519Signer.fromSeed(new Uint8Array(randomBytes(32)));
  }

  sign(payload: Uint8Array): Uint8Array {
    const priv = createPrivateKey({ key: this.seed, format: "der", type: "pkcs8" });
    const sig = nodeSign(null, payload, priv);
    if (sig.byteLength !== 64) throw new Error("cap: ed25519 sign produced wrong size");
    const out = new Uint8Array(SIG_SIZE);
    out.set(sig, 0);
    out[ALG_TAG_OFFSET] = Scheme.Ed25519;
    return out;
  }

  public(): Uint8Array {
    return this.pubHash;
  }

  /** publicKey returns the raw 32-byte Ed25519 public key (for IssuerKey wiring). */
  publicKey(): Uint8Array {
    return this.rawPub;
  }
}

/**
 * verifyEd25519 checks a padded Ed25519 signature against a raw 32-byte pubkey.
 * The signature occupies sig[0..64); the bytes between it and sig[ALG_TAG_OFFSET]
 * are zero pad ignored by this verifier. Returns a CapError on mismatch (never
 * throws on a bad signature — fail-closed by returning the error).
 */
function verifyEd25519(pub: Uint8Array, payload: Uint8Array, sig: Uint8Array): CapError | null {
  if (pub.byteLength !== 32) return err("sig_mismatch");
  let key;
  try {
    key = createPublicKey({ key: ed25519Spki(pub), format: "der", type: "spki" });
  } catch {
    return err("sig_mismatch");
  }
  const ok = nodeVerify(null, payload, key, sig.subarray(0, 64));
  return ok ? null : err("sig_mismatch");
}

// ---------------------------------------------------------------------------
// Issue / Attenuate.
// ---------------------------------------------------------------------------

/** Issuance describes the request to mint a new root capability. */
export interface Issuance {
  kind: number;
  target?: Uint8Array;
  holder?: Uint8Array;
  permissions: bigint;
  parent?: Uint8Array; // zero/absent = root
  issuedAt?: bigint; // absent/0 = now
  expiresAt?: bigint; // absent/0 = no expiry
  caveats?: Caveat[];
}

function nowUnix(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function as32(b: Uint8Array | undefined): Uint8Array {
  if (b === undefined) return ZERO32;
  if (b.byteLength !== 32) throw new Error("cap: id field must be 32 bytes");
  return b;
}

/**
 * buildCapBytes serializes a capability into canonical ZAP wire format and
 * signs it. The signed payload is SPEC §3 canonical bytes, computed via
 * Cap.canonicalBytes so signer and verifier share one definition. After signing,
 * the SIG_SIZE signature is patched into the Sig field in-place.
 */
function buildCapBytes(in_: {
  kind: number;
  target: Uint8Array;
  holder: Uint8Array;
  issuer: Uint8Array;
  permissions: bigint;
  parent: Uint8Array;
  issuedAt: bigint;
  expiresAt: bigint;
  caveats: Caveat[];
}, signer: Signer): Uint8Array {
  const caveatBufs = in_.caveats.map((cv) => newCaveatBytes(cv.kind, cv.value));
  // First pass: build with Sig = zero. The Sig field is NOT in the signing
  // scope, so the zero placeholder does not affect the signature.
  const raw = newCapabilityBytes({
    kind: in_.kind,
    target: in_.target,
    holder: in_.holder,
    issuer: in_.issuer,
    permissions: in_.permissions,
    parent: in_.parent,
    issuedAt: in_.issuedAt,
    expiresAt: in_.expiresAt,
    caveats: caveatBufs,
    sig: new Uint8Array(SIG_SIZE),
  });
  // Compute canonical signing bytes via the same code path the verifier uses.
  const c = Cap.wrap(raw);
  const sig = signer.sign(c.canonicalBytes());
  if (sig.byteLength !== SIG_SIZE) throw new Error("cap: signer returned wrong sig size");
  // Patch the sig field in-place at rootOff + CAP_OFF.Sig.
  const sigOff = capRootOff(raw) + CAP_OFF.Sig;
  raw.set(sig, sigOff);
  return raw;
}

/**
 * issue mints a new root capability signed by signer. The signer's public()
 * becomes the cap's Issuer field. Parent stays as supplied (zero for a true
 * root; non-zero for re-issuing under an existing parent at the cost of the
 * caller asserting the chain). To derive a child cap, use {@link attenuate}.
 */
export function issue(in_: Issuance, signer: Signer): Cap {
  if (!signer) throw err("missing_signer");
  const issuer = signer.public();
  const raw = buildCapBytes(
    {
      kind: in_.kind,
      target: as32(in_.target),
      holder: as32(in_.holder),
      issuer,
      permissions: in_.permissions,
      parent: as32(in_.parent),
      issuedAt: in_.issuedAt && in_.issuedAt !== 0n ? in_.issuedAt : nowUnix(),
      expiresAt: in_.expiresAt ?? 0n,
      caveats: in_.caveats ?? [],
    },
    signer,
  );
  return Cap.wrap(raw);
}

/**
 * attenuate derives a child cap from parent by intersecting permissions and
 * adding caveats. The child's Issuer = parent's Holder; signer MUST hold the
 * parent's holder key (the basis for chain validation: each link is signed by
 * the previous holder's key).
 *
 * SPEC §7: refuses at mint time to build a cap that would fail its own verifier.
 * The delegation gate (SPEC §2.3 step 3d) requires the parent to carry
 * Perm.Attenuate or be a CapKind.Delegate cap. The child target equals the
 * parent's (attenuation never broadens scope). permissions is intersected with
 * the parent's. caveats are appended. expiresAt of 0 inherits the parent's;
 * non-zero overrides downward (the child cannot outlive the parent).
 */
export function attenuate(
  parent: Cap,
  holder: Uint8Array,
  permissions: bigint,
  caveats: Caveat[] | undefined,
  expiresAt: bigint,
  signer: Signer,
): Cap {
  if (!signer) throw err("missing_signer");
  if (!bytesEqual(signer.public(), parent.holder())) {
    // The signer must be the parent's holder; only the holder can delegate
    // authority downward.
    throw err("chain_broken");
  }
  const parentPerms = parent.permissions();
  if ((parentPerms & Perm.Attenuate) === 0n && parent.kind() !== CapKind.Delegate) {
    throw err("not_delegable");
  }
  const parentExpiry = parent.expiresAt();
  let exp = expiresAt;
  if (exp === 0n) {
    exp = parentExpiry;
  } else if (parentExpiry !== 0n && exp > parentExpiry) {
    exp = parentExpiry;
  }
  const raw = buildCapBytes(
    {
      kind: parent.kind(),
      target: parent.target(),
      holder: as32(holder),
      issuer: signer.public(),
      permissions: permissions & parentPerms,
      parent: parent.id(),
      issuedAt: nowUnix(),
      expiresAt: exp,
      caveats: caveats ?? [],
    },
    signer,
  );
  return Cap.wrap(raw);
}

// ---------------------------------------------------------------------------
// Verifier — Verify / VerifyChain with FAIL-CLOSED scheme dispatch.
// ---------------------------------------------------------------------------

/**
 * SchemeVerify dispatches on a known algorithm tag to validate a signature under
 * the right primitive. Return null on success, or a {@link CapError} to reject.
 * Return a CapError with code "unhandled_scheme" to DECLINE a tag — for
 * Scheme.Ed25519 the dispatcher then falls back to its built-in bootstrap
 * verifier; for any other tag a decline is terminal (fail-closed). This is how
 * consumers plug ML-DSA-65 / hybrid / secp256k1.
 */
export type SchemeVerify = (
  scheme: number,
  pub: Uint8Array,
  payload: Uint8Array,
  sig: Uint8Array,
) => CapError | null;

/** IssuerKey resolves an issuer's 32-byte hash to its raw public key bytes. */
export type IssuerKey = (issuerHash: Uint8Array) => Uint8Array | null;

/** IsRevoked is a side-channel lookup against the revocation list. */
export type IsRevoked = (capID: Uint8Array) => boolean;

/**
 * Verifier holds the policy dependencies cap validation needs. Construct with an
 * options object; all fields are optional but {@link Verifier.verify} returns
 * "issuer_unknown" if issuerKey is absent (a verifier with no key registry can
 * never accept a signature).
 *
 * - isRevoked: return true to reject the cap regardless of signature/expiry.
 *   Absent = nothing revoked.
 * - issuerKey: resolve an issuer hash to raw pubkey bytes; return null for
 *   unknown issuers.
 * - schemeVerify: a hook to add ML-DSA-65 / hybrid / secp256k1. Absent =
 *   Ed25519-only: a Scheme.Ed25519 tag uses the built-in bootstrap verifier and
 *   every other tag (including Reserved / unknown) is refused fail-closed.
 */
export interface VerifierOptions {
  isRevoked?: IsRevoked;
  issuerKey?: IssuerKey;
  schemeVerify?: SchemeVerify;
}

export class Verifier {
  private readonly isRevoked?: IsRevoked;
  private readonly issuerKey?: IssuerKey;
  private readonly schemeVerify?: SchemeVerify;

  constructor(opts: VerifierOptions = {}) {
    if (opts.isRevoked) this.isRevoked = opts.isRevoked;
    if (opts.issuerKey) this.issuerKey = opts.issuerKey;
    if (opts.schemeVerify) this.schemeVerify = opts.schemeVerify;
  }

  /**
   * verifySig is the verifier-side dispatcher. It reads the algorithm tag at
   * sig[ALG_TAG_OFFSET] and routes to the right primitive, FAIL-CLOSED per SPEC
   * §2.3 step 3c: refuse any cap whose tag is unimplemented, and refuse Reserved
   * (0x00). Dispatch order: (1) unknown/reserved → unhandled_scheme, no
   * fallback; (2) a wired hook gets first refusal on a known tag (returning
   * anything but unhandled_scheme is final); (3) Scheme.Ed25519 falls back to
   * the built-in bootstrap verifier; any other known-but-unhooked scheme returns
   * unhandled_scheme — never silently downgraded.
   */
  private verifySig(pub: Uint8Array, payload: Uint8Array, sig: Uint8Array): CapError | null {
    const scheme = sig[ALG_TAG_OFFSET];
    if (!schemeKnown(scheme)) return err("unhandled_scheme");
    if (this.schemeVerify) {
      const e = this.schemeVerify(scheme, pub, payload, sig);
      if (!(e instanceof CapError) || e.code !== "unhandled_scheme") return e;
    }
    if (scheme === Scheme.Ed25519) return verifyEd25519(pub, payload, sig);
    return err("unhandled_scheme");
  }

  /**
   * verify validates a single cap independent of chain context: signature is
   * valid for the cap's Issuer (signed payload = canonicalBytes), not expired at
   * now (unix seconds), not revoked, caveat list parses cleanly. Returns null if
   * acceptable, else a {@link CapError}. Does NOT walk the parent chain — use
   * {@link verifyChain}.
   */
  verify(c: Cap, now: bigint): CapError | null {
    // Walk the caveat list once to catch bad framing.
    if (!c.caveatFramingOk()) return err("bad_caveats");
    // Expiry check. 0 means "never expires".
    const exp = c.expiresAt();
    if (exp !== 0n && now > exp) return err("expired");
    // Revocation check.
    const id = c.id();
    if (this.isRevoked && this.isRevoked(id)) return err("revoked");
    // Signature check.
    if (!this.issuerKey) return err("issuer_unknown");
    const pub = this.issuerKey(c.issuer());
    if (!pub || pub.byteLength === 0) return err("issuer_unknown");
    return this.verifySig(pub, c.canonicalBytes(), c.signature());
  }

  /**
   * verifyChain validates a cap proof end-to-end (SPEC §2.3). Pass chain as
   * parents nearest-to-leaf first: chain[0] is the leaf's parent, chain[len-1]
   * is the root. An empty chain means leaf is itself a root. Returns null on
   * success, else the first {@link CapError} encountered.
   *
   * Checks: leaf not expired/revoked, valid signature; leaf grants op (bit set),
   * target, holder; each parent ID links to the next cap; every link verifies;
   * every link's permissions are a superset of the child's; the child's issuer
   * equals the parent's holder; the delegation gate holds at each parent; target
   * is invariant; the root link has Parent == zero.
   */
  verifyChain(
    leaf: Cap,
    chain: Cap[],
    op: bigint,
    target: Uint8Array,
    holder: Uint8Array,
    now: bigint,
  ): CapError | null {
    const e = this.verify(leaf, now);
    if (e) return e;
    if (!bytesEqual(leaf.target(), target)) return err("target_mismatch");
    if (!bytesEqual(leaf.holder(), holder)) return err("holder_mismatch");
    if ((leaf.permissions() & op) === 0n) return err("op_not_permitted");

    let prev = leaf;
    for (let i = 0; i < chain.length; i++) {
      const link = chain[i];
      // The current cap's Parent must equal this link's ID.
      if (!bytesEqual(prev.parent(), link.id())) return err("chain_broken");
      // This link must be valid on its own merits.
      const le = this.verify(link, now);
      if (le) return le;
      // Authority must monotonically widen toward the root: the child's
      // permissions are a subset of the parent's; the child's issuer equals the
      // parent's holder.
      const childPerms = prev.permissions();
      if ((childPerms & link.permissions()) !== childPerms) return err("perms_exceed_parent");
      if (!bytesEqual(prev.issuer(), link.holder())) return err("chain_broken");
      // Delegation gate (SPEC §2.3 step 3d): parent must carry Perm.Attenuate OR
      // be a CapKind.Delegate cap.
      if ((link.permissions() & Perm.Attenuate) === 0n && link.kind() !== CapKind.Delegate) {
        return err("not_delegable");
      }
      // Target must remain identical as authority is attenuated.
      if (!bytesEqual(link.target(), target)) return err("target_mismatch");
      // The last link must be a root (Parent zero).
      if (i === chain.length - 1) {
        if (!bytesEqual(link.parent(), ZERO32)) return err("chain_broken");
      }
      prev = link;
    }
    // If chain is empty, leaf must itself be a root.
    if (chain.length === 0) {
      if (!bytesEqual(leaf.parent(), ZERO32)) return err("chain_broken");
    }
    return null;
  }

  /**
   * verifyRevocation checks that r is a valid revocation under issuerPub,
   * dispatching on the algorithm tag in r.revokerSig[ALG_TAG_OFFSET] exactly as
   * cap signatures do. Fail-closed (SPEC §2.3 step 3c): a tag the verifier does
   * not implement, or Reserved (0x00), is rejected. Wire a schemeVerify hook to
   * accept ML-DSA-65 / hybrid / secp256k1 revocations.
   */
  verifyRevocation(r: Revocation, issuerPub: Uint8Array): CapError | null {
    if (!issuerPub || issuerPub.byteLength === 0) return err("issuer_unknown");
    return this.verifySig(issuerPub, revocationPayload(r.capID, r.revokedAt), r.revokerSig);
  }
}

// ---------------------------------------------------------------------------
// Revocation.
// ---------------------------------------------------------------------------

/**
 * Revocation is the on-the-wire record stating that a particular cap is no
 * longer valid. The signature is over a 40-byte canonical payload:
 * CapID(32) || RevokedAt(u64 LE). Listing a CapID kills that cap AND every
 * descendant. Only the original Issuer may revoke.
 */
export interface Revocation {
  capID: Uint8Array;
  revokedAt: bigint;
  revokerSig: Uint8Array;
}

/** revocationPayload serializes the bytes that get signed (CapID || RevokedAt). */
function revocationPayload(capID: Uint8Array, revokedAt: bigint): Uint8Array {
  const out = new Uint8Array(40);
  out.set(capID, 0);
  new DataView(out.buffer).setBigUint64(32, revokedAt, true);
  return out;
}

/**
 * revoke produces a Revocation record signed by signer. The signer MUST be the
 * cap's original issuer — only the issuer can revoke. Throws "chain_broken" if
 * the signer is not the issuer, matching the Go runtime.
 */
export function revoke(c: Cap, now: bigint, signer: Signer): Revocation {
  if (!signer) throw err("missing_signer");
  if (!bytesEqual(signer.public(), c.issuer())) throw err("chain_broken");
  const id = c.id();
  const sig = signer.sign(revocationPayload(id, now));
  return { capID: id, revokedAt: now, revokerSig: sig };
}

/**
 * verifyRevocation checks that r is a valid revocation under issuerPub using the
 * bootstrap scheme dispatch (Ed25519 mandatory-to-implement, fail-closed on
 * unknown/reserved tags). For ML-DSA-65 / hybrid / secp256k1, use
 * {@link Verifier.verifyRevocation} with a schemeVerify hook wired.
 */
export function verifyRevocation(r: Revocation, issuerPub: Uint8Array): CapError | null {
  return new Verifier().verifyRevocation(r, issuerPub);
}

/** encodeRevocation marshals a Revocation into canonical ZAP wire bytes. */
export function encodeRevocation(r: Revocation): Uint8Array {
  const b = new Builder(256);
  const ob = b.startObject(REVOCATION_SIZE);
  ob.setBytesFixed(REVOCATION_OFF.CapID, r.capID);
  ob.setU64(REVOCATION_OFF.RevokedAt, r.revokedAt);
  ob.setBytesFixed(REVOCATION_OFF.RevokerSig, r.revokerSig);
  ob.finishAsRoot();
  return b.finish();
}

/** A read-only StructView over a Revocation message. */
class RevocationViewT extends StructView {
  capID(): Uint8Array {
    return this.bytesFixed(REVOCATION_OFF.CapID, 32);
  }
  revokedAt(): bigint {
    return this.u64(REVOCATION_OFF.RevokedAt);
  }
  revokerSig(): Uint8Array {
    return this.bytesFixed(REVOCATION_OFF.RevokerSig, SIG_SIZE);
  }
}

/** decodeRevocation parses a ZAP-framed Revocation buffer back into the struct. */
export function decodeRevocation(b: Uint8Array): Revocation {
  let msg: Message;
  try {
    msg = Message.parse(b);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("magic")) throw err("bad_magic");
    throw err("too_short");
  }
  const root = msg.root();
  const v = new RevocationViewT(root.data, root.offset);
  return { capID: v.capID(), revokedAt: v.revokedAt(), revokerSig: v.revokerSig() };
}
