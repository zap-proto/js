import { describe, it, expect } from 'vitest';
import {
  MLKEM_PUBLIC_KEY_SIZE,
  MLKEM_CIPHERTEXT_SIZE,
  MLKEM_SHARED_SECRET_SIZE,
  MLDSA_PUBLIC_KEY_SIZE,
  MLDSA_SIGNATURE_SIZE,
  X25519_PUBLIC_KEY_SIZE,
  HYBRID_SHARED_SECRET_SIZE,
  CryptoError,
  isWebCryptoAvailable,
  isPQAvailable,
  PQKeyExchange,
  PQSignature,
} from '../src/crypto.js';

describe('Constants', () => {
  it('should have correct ML-KEM sizes', () => {
    expect(MLKEM_PUBLIC_KEY_SIZE).toBe(1184);
    expect(MLKEM_CIPHERTEXT_SIZE).toBe(1088);
    expect(MLKEM_SHARED_SECRET_SIZE).toBe(32);
  });

  it('should have correct ML-DSA sizes', () => {
    expect(MLDSA_PUBLIC_KEY_SIZE).toBe(1952);
    expect(MLDSA_SIGNATURE_SIZE).toBe(3293);
  });

  it('should have correct X25519 and hybrid sizes', () => {
    expect(X25519_PUBLIC_KEY_SIZE).toBe(32);
    expect(HYBRID_SHARED_SECRET_SIZE).toBe(32);
  });
});

describe('CryptoError', () => {
  it('should create a CryptoError', () => {
    const error = new CryptoError('test error');
    expect(error.message).toBe('test error');
    expect(error.name).toBe('CryptoError');
  });

  it('should be instanceof Error', () => {
    const error = new CryptoError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isWebCryptoAvailable', () => {
  it('should return boolean', () => {
    const result = isWebCryptoAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('should be true in Node.js 18+', () => {
    // Node.js 18+ has Web Crypto API
    expect(isWebCryptoAvailable()).toBe(true);
  });
});

describe('isPQAvailable', () => {
  it('should return boolean', () => {
    const result = isPQAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('should return false (PQ crypto not implemented)', () => {
    // PQ crypto requires liboqs-node which is not installed
    expect(isPQAvailable()).toBe(false);
  });
});

describe('PQKeyExchange', () => {
  it('should throw when generating without PQ support', async () => {
    await expect(PQKeyExchange.generate()).rejects.toThrow('PQ crypto not available');
  });

  it('should create from public key', () => {
    const publicKey = new Uint8Array(MLKEM_PUBLIC_KEY_SIZE);
    const kex = PQKeyExchange.fromPublicKey(publicKey);
    expect(kex.publicKey).toEqual(publicKey);
  });

  it('should throw on invalid public key size', () => {
    const shortKey = new Uint8Array(16);
    expect(() => PQKeyExchange.fromPublicKey(shortKey)).toThrow('Invalid ML-KEM public key size');
  });

  it('should throw when encapsulating without PQ support', async () => {
    const publicKey = new Uint8Array(MLKEM_PUBLIC_KEY_SIZE);
    const kex = PQKeyExchange.fromPublicKey(publicKey);
    const recipientPk = new Uint8Array(MLKEM_PUBLIC_KEY_SIZE);

    await expect(kex.encapsulate(recipientPk)).rejects.toThrow('PQ crypto not available');
  });

  it('should throw when decapsulating without PQ support', async () => {
    const publicKey = new Uint8Array(MLKEM_PUBLIC_KEY_SIZE);
    const kex = PQKeyExchange.fromPublicKey(publicKey);
    const ciphertext = new Uint8Array(MLKEM_CIPHERTEXT_SIZE);

    // Will throw because no secret key available (fromPublicKey creates verify-only)
    await expect(kex.decapsulate(ciphertext)).rejects.toThrow('PQ crypto not available');
  });
});

describe('PQSignature', () => {
  it('should throw when generating without PQ support', async () => {
    await expect(PQSignature.generate()).rejects.toThrow('PQ crypto not available');
  });

  it('should create from public key', () => {
    const publicKey = new Uint8Array(MLDSA_PUBLIC_KEY_SIZE);
    const sig = PQSignature.fromPublicKey(publicKey);
    expect(sig.publicKey).toEqual(publicKey);
  });

  it('should throw on invalid public key size', () => {
    const shortKey = new Uint8Array(16);
    expect(() => PQSignature.fromPublicKey(shortKey)).toThrow('Invalid ML-DSA public key size');
  });

  it('should throw when verifying without PQ support', async () => {
    const publicKey = new Uint8Array(MLDSA_PUBLIC_KEY_SIZE);
    const sig = PQSignature.fromPublicKey(publicKey);
    const message = new Uint8Array([1, 2, 3]);
    const signature = new Uint8Array(MLDSA_SIGNATURE_SIZE);

    await expect(sig.verify(message, signature)).rejects.toThrow('PQ crypto not available');
  });

  it('should throw on sign without secret key', async () => {
    const publicKey = new Uint8Array(MLDSA_PUBLIC_KEY_SIZE);
    const sig = PQSignature.fromPublicKey(publicKey);
    const message = new Uint8Array([1, 2, 3]);

    // PQ check happens first
    await expect(sig.sign(message)).rejects.toThrow('PQ crypto not available');
  });
});
