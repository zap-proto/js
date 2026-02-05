import { describe, it, expect } from 'vitest';
import {
  Protocol,
  MessageType,
  ZAP_MAGIC,
  generateId,
  generateClientId,
  defaultProtocol,
} from '../src/protocol.js';
import type { ZapRequest, Handshake } from '../src/types.js';

describe('ZAP_MAGIC', () => {
  it('should be 4 bytes', () => {
    expect(ZAP_MAGIC.length).toBe(4);
  });

  it('should start with ZAP', () => {
    expect(String.fromCharCode(ZAP_MAGIC[0]!, ZAP_MAGIC[1]!, ZAP_MAGIC[2]!)).toBe('ZAP');
  });

  it('should have version 1', () => {
    expect(ZAP_MAGIC[3]).toBe(1);
  });
});

describe('MessageType', () => {
  it('should have correct values', () => {
    expect(MessageType.Handshake).toBe(0x01);
    expect(MessageType.HandshakeResponse).toBe(0x02);
    expect(MessageType.Request).toBe(0x10);
    expect(MessageType.Response).toBe(0x11);
    expect(MessageType.Stream).toBe(0x20);
    expect(MessageType.Ping).toBe(0xFE);
    expect(MessageType.Pong).toBe(0xFF);
  });
});

describe('Protocol', () => {
  describe('binary mode', () => {
    const protocol = new Protocol(true);

    it('should encode and decode request', () => {
      const request: ZapRequest = {
        id: 'test-123',
        method: 'tools/list',
      };

      const encoded = protocol.encode(MessageType.Request, request);
      expect(encoded).toBeInstanceOf(ArrayBuffer);

      const decoded = protocol.decode(encoded);
      expect(decoded.type).toBe(MessageType.Request);
      expect(decoded.payload).toEqual(request);
    });

    it('should encode and decode handshake', () => {
      const handshake: Handshake = {
        version: '1.0.0',
        clientType: 1,
        clientId: 'test-client',
        capabilities: ['tools', 'browser'],
      };

      const encoded = protocol.encodeHandshake(handshake);
      expect(encoded).toBeInstanceOf(ArrayBuffer);

      const decoded = protocol.decode(encoded);
      expect(decoded.type).toBe(MessageType.Handshake);
      expect(decoded.payload).toEqual(handshake);
    });

    it('should verify magic bytes', () => {
      const badData = new ArrayBuffer(20);
      const view = new Uint8Array(badData);
      view[0] = 0x00; // Bad magic

      expect(() => protocol.decode(badData)).toThrow('Invalid ZAP message');
    });

    it('should encode ping/pong', () => {
      const ping = protocol.encodePing();
      const decoded = protocol.decode(ping);
      expect(decoded.type).toBe(MessageType.Ping);

      const pong = protocol.encodePong(12345);
      const decodedPong = protocol.decode(pong);
      expect(decodedPong.type).toBe(MessageType.Pong);
      expect((decodedPong.payload as { ts: number }).ts).toBe(12345);
    });
  });

  describe('JSON mode', () => {
    const protocol = new Protocol(false);

    it('should encode and decode as JSON string', () => {
      const request: ZapRequest = {
        id: 'test-456',
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'test' } },
      };

      const encoded = protocol.encode(MessageType.Request, request);
      expect(typeof encoded).toBe('string');

      const decoded = protocol.decode(encoded as string);
      expect(decoded.type).toBe(MessageType.Request);
    });

    it('should include _zap metadata in JSON', () => {
      const encoded = protocol.encodeRequest({ id: 'x', method: 'test' }) as string;
      const parsed = JSON.parse(encoded);
      expect(parsed._zap).toBeDefined();
      expect(parsed._zap.type).toBe(MessageType.Request);
      expect(parsed._zap.version).toBe(1);
    });
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should contain timestamp and random part', () => {
    const id = generateId();
    expect(id).toContain('-');
    const parts = id.split('-');
    expect(parts.length).toBe(2);
  });
});

describe('generateClientId', () => {
  it('should generate unique client IDs', () => {
    const id1 = generateClientId();
    const id2 = generateClientId();
    expect(id1).not.toBe(id2);
  });

  it('should start with zap- prefix', () => {
    const id = generateClientId();
    expect(id.startsWith('zap-')).toBe(true);
  });
});

describe('defaultProtocol', () => {
  it('should be in binary mode', () => {
    const encoded = defaultProtocol.encode(MessageType.Ping, { ts: 1 });
    expect(encoded).toBeInstanceOf(ArrayBuffer);
  });
});
