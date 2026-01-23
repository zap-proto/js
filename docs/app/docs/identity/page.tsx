import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Identity & DIDs',
  description: 'W3C Decentralized Identifiers (DIDs) for ZAP node identity',
}

export default function IdentityPage() {
  return (
    <>
      <h1>Identity &amp; DIDs</h1>
      <p>
        ZAP implements W3C Decentralized Identifiers (DIDs) for node authentication
        and identity management. This enables secure, verifiable agent communication.
      </p>

      <h2>Import</h2>
      <pre><code>{`import {
  // DID types
  Did,
  DidMethod,
  DidDocument,
  VerificationMethod,
  VerificationMethodType,
  Service,
  ServiceType,
  ServiceEndpoint,

  // DID functions
  parseDid,
  didUri,
  createDidFromKey,
  createDidFromWeb,
  extractKeyMaterial,
  generateDocument,

  // Node identity
  NodeIdentity,
  generateIdentity,
  createNodeIdentity,

  // Stake registry
  StakeRegistry,
  InMemoryStakeRegistry,

  // Signer interface
  Signer,

  // Constants
  MLDSA_PUBLIC_KEY_SIZE,

  // Error
  IdentityError
} from '@zap-protocol/zap'`}</code></pre>

      <h2>Supported DID Methods</h2>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Format</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>did:lux</code></td>
            <td><code>did:lux:z6Mk...</code></td>
            <td>Lux blockchain-anchored DIDs</td>
          </tr>
          <tr>
            <td><code>did:key</code></td>
            <td><code>did:key:z6Mk...</code></td>
            <td>Self-certifying DIDs from keys</td>
          </tr>
          <tr>
            <td><code>did:web</code></td>
            <td><code>did:web:example.com</code></td>
            <td>DNS-based DIDs</td>
          </tr>
        </tbody>
      </table>

      <h2>DID Interface</h2>
      <pre><code>{`interface Did {
  method: DidMethod
  id: string
}

enum DidMethod {
  Lux = 'lux',
  Key = 'key',
  Web = 'web'
}`}</code></pre>

      <h2>Parsing DIDs</h2>
      <pre><code>{`import { parseDid, didUri, DidMethod } from '@zap-protocol/zap'

// Parse a DID string
const did = parseDid('did:lux:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')
console.log(did.method)  // DidMethod.Lux
console.log(did.id)      // "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"

// Convert back to URI
const uri = didUri(did)
console.log(uri)  // "did:lux:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"`}</code></pre>

      <h2>Creating DIDs</h2>

      <h3>From Public Key</h3>
      <p>
        Create a DID from an ML-DSA-65 public key (1952 bytes):
      </p>
      <pre><code>{`import { createDidFromKey, DidMethod, MLDSA_PUBLIC_KEY_SIZE } from '@zap-protocol/zap'

// Assuming you have an ML-DSA-65 public key
const publicKey: Uint8Array = getPublicKey()  // 1952 bytes
console.log(publicKey.length === MLDSA_PUBLIC_KEY_SIZE)  // true

// Create did:key
const keyDid = createDidFromKey(publicKey)
console.log(didUri(keyDid))  // "did:key:z6Mk..."

// Create did:lux
const luxDid = createDidFromKey(publicKey, DidMethod.Lux)
console.log(didUri(luxDid))  // "did:lux:z6Mk..."`}</code></pre>

      <h3>From Domain (did:web)</h3>
      <pre><code>{`import { createDidFromWeb, didUri } from '@zap-protocol/zap'

// Simple domain
const did1 = createDidFromWeb('example.com')
console.log(didUri(did1))  // "did:web:example.com"

// With path
const did2 = createDidFromWeb('example.com', 'users/alice')
console.log(didUri(did2))  // "did:web:example.com:users:alice"`}</code></pre>

      <h2>DID Documents</h2>
      <p>
        Generate a W3C DID Document for verification:
      </p>
      <pre><code>{`import { parseDid, generateDocument } from '@zap-protocol/zap'

const did = parseDid('did:lux:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')
const doc = generateDocument(did)

console.log(JSON.stringify(doc, null, 2))
// {
//   "@context": [
//     "https://www.w3.org/ns/did/v1",
//     "https://w3id.org/security/suites/jws-2020/v1"
//   ],
//   "id": "did:lux:z6Mk...",
//   "verificationMethod": [...],
//   "authentication": [...],
//   "assertionMethod": [...],
//   "capabilityInvocation": [...],
//   "service": [...]
// }`}</code></pre>

      <h2>Node Identity</h2>
      <p>
        The <code>NodeIdentity</code> class combines a DID with cryptographic operations:
      </p>
      <pre><code>{`import { NodeIdentity, generateIdentity, createNodeIdentity } from '@zap-protocol/zap'

// Create identity from signer (has signing capability)
const identity = generateIdentity(signer)
console.log(identity.uri())      // "did:lux:z6Mk..."
console.log(identity.canSign())  // true

// Sign a message
const message = new TextEncoder().encode('Hello, ZAP!')
const signature = await identity.sign(message)

// Verify signature
const valid = await identity.verify(message, signature)
console.log(valid)  // true

// Get DID document
const doc = identity.document()`}</code></pre>

      <h3>Verification-Only Identity</h3>
      <pre><code>{`import { createNodeIdentity, parseDid } from '@zap-protocol/zap'

// Create identity without signing capability
const did = parseDid('did:lux:z6Mk...')
const identity = createNodeIdentity(did, publicKeyBytes)

console.log(identity.canSign())  // false`}</code></pre>

      <h2>Signer Interface</h2>
      <p>
        Implement the <code>Signer</code> interface for cryptographic operations:
      </p>
      <pre><code>{`interface Signer {
  sign(message: Uint8Array): Promise<Uint8Array>
  verify(message: Uint8Array, signature: Uint8Array): Promise<boolean>
  publicKey: Uint8Array
}`}</code></pre>

      <p><strong>Example implementation:</strong></p>
      <pre><code>{`import { Signer, MLDSA_PUBLIC_KEY_SIZE } from '@zap-protocol/zap'

class MlDsaSigner implements Signer {
  readonly publicKey: Uint8Array
  private privateKey: Uint8Array

  constructor(publicKey: Uint8Array, privateKey: Uint8Array) {
    if (publicKey.length !== MLDSA_PUBLIC_KEY_SIZE) {
      throw new Error('Invalid public key size')
    }
    this.publicKey = publicKey
    this.privateKey = privateKey
  }

  async sign(message: Uint8Array): Promise<Uint8Array> {
    // Use ML-DSA-65 signing implementation
    return mlDsaSign(this.privateKey, message)
  }

  async verify(message: Uint8Array, signature: Uint8Array): Promise<boolean> {
    // Use ML-DSA-65 verification implementation
    return mlDsaVerify(this.publicKey, message, signature)
  }
}`}</code></pre>

      <h2>Stake Registry</h2>
      <p>
        Track stake amounts for stake-weighted consensus:
      </p>
      <pre><code>{`import { InMemoryStakeRegistry, parseDid, didUri } from '@zap-protocol/zap'

const registry = new InMemoryStakeRegistry()

const did1 = parseDid('did:lux:z6Mk...')
const did2 = parseDid('did:lux:z6Mn...')

// Set stakes
await registry.setStake(did1, BigInt(1000))
await registry.setStake(did2, BigInt(500))

// Query stakes
const stake1 = await registry.getStake(did1)
console.log(stake1)  // 1000n

const total = await registry.totalStake()
console.log(total)  // 1500n

const weight = await registry.stakeWeight(did1)
console.log(weight)  // 0.666...

const sufficient = await registry.hasSufficientStake(did1, BigInt(500))
console.log(sufficient)  // true`}</code></pre>

      <h3>StakeRegistry Interface</h3>
      <pre><code>{`interface StakeRegistry {
  getStake(did: Did): Promise<bigint>
  setStake(did: Did, amount: bigint): Promise<void>
  totalStake(): Promise<bigint>
  hasSufficientStake(did: Did, minimum: bigint): Promise<boolean>
  stakeWeight(did: Did): Promise<number>
}`}</code></pre>

      <h2>Identity with Stake</h2>
      <pre><code>{`const identity = generateIdentity(signer)
  .withStake(BigInt(1000))
  .withRegistry('lux:mainnet')

console.log(identity.stake)          // 1000n
console.log(identity.stakeRegistry)  // "lux:mainnet"`}</code></pre>

      <h2>Verification Methods</h2>
      <pre><code>{`enum VerificationMethodType {
  JsonWebKey2020 = 'JsonWebKey2020',
  Multikey = 'Multikey',
  MlDsa65VerificationKey2024 = 'MlDsa65VerificationKey2024'
}

interface VerificationMethod {
  id: string
  type: VerificationMethodType
  controller: string
  publicKeyMultibase?: string
  publicKeyJwk?: Record<string, unknown>
  blockchainAccountId?: string
}`}</code></pre>

      <h2>Service Types</h2>
      <pre><code>{`enum ServiceType {
  ZapAgent = 'ZapAgent',
  DIDCommMessaging = 'DIDCommMessaging',
  LinkedDomains = 'LinkedDomains',
  CredentialRegistry = 'CredentialRegistry'
}

interface Service {
  id: string
  type: ServiceType
  serviceEndpoint: string | ServiceEndpoint
}

interface ServiceEndpoint {
  uri: string
  accept?: string[]
  routingKeys?: string[]
}`}</code></pre>

      <h2>Error Handling</h2>
      <pre><code>{`import { parseDid, createDidFromKey, IdentityError } from '@zap-protocol/zap'

try {
  const did = parseDid('invalid-did')
} catch (error) {
  if (error instanceof IdentityError) {
    console.error('Identity error:', error.message)
  }
}

try {
  const shortKey = new Uint8Array(100)  // Wrong size
  const did = createDidFromKey(shortKey)
} catch (error) {
  if (error instanceof IdentityError) {
    console.error('Key error:', error.message)
    // "invalid ML-DSA public key size: expected 1952, got 100"
  }
}`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/types/">TypeScript Types</a> - All type definitions</li>
        <li><a href="/docs/errors/">Error Handling</a> - IdentityError reference</li>
        <li><a href="https://www.w3.org/TR/did-core/" target="_blank" rel="noopener noreferrer">W3C DID Core Specification</a></li>
      </ul>
    </>
  )
}
