// PQ-RNS DID KAT — verifies our ComputeDID matches the canonical
// fixture published at zap-proto/rns/testdata/pqrns_kat.json.

import { describe, it, expect } from 'vitest'
import { sha3_256 } from '@noble/hashes/sha3'
import { base32nopad } from '@scure/base'
import katJson from './pqrns_kat.json'

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function computeDID(kemPk: Uint8Array, sigPk: Uint8Array): string {
  const buf = new Uint8Array(kemPk.length + sigPk.length)
  buf.set(kemPk, 0)
  buf.set(sigPk, kemPk.length)
  const h = sha3_256(buf)
  return 'did:zap:' + base32nopad.encode(h).toLowerCase()
}

describe('PQ-RNS DID KAT', () => {
  it('reproduces canonical DID from fixed inputs', () => {
    const { inputs, outputs } = katJson.did_canonical
    const kemPk = hexToBytes(inputs.kem_pubkey_hex)
    const sigPk = hexToBytes(inputs.sig_pubkey_hex)

    expect(kemPk.length).toBe(1216)
    expect(sigPk.length).toBe(1984)

    const did = computeDID(kemPk, sigPk)
    expect(did).toBe(outputs.did)
  })
})
