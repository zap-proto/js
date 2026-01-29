/**
 * ZAP Protocol - Binary wire format using Cap'n Proto
 *
 * Handles serialization/deserialization of ZAP messages.
 * Uses binary format by default for zero-copy performance.
 * Falls back to JSON for compatibility when needed.
 */

import type {
  ZapRequest,
  ZapResponse,
  Handshake,
  HandshakeResponse,
} from './types.js';

/** Protocol magic bytes for ZAP binary messages */
export const ZAP_MAGIC = new Uint8Array([0x5A, 0x41, 0x50, 0x01]); // "ZAP" + version 1

/** Message type identifiers */
export enum MessageType {
  Handshake = 0x01,
  HandshakeResponse = 0x02,
  Request = 0x10,
  Response = 0x11,
  Stream = 0x20,
  Ping = 0xFE,
  Pong = 0xFF,
}

/**
 * ZAP Protocol codec
 *
 * Handles encoding/decoding of ZAP messages in both binary and JSON formats.
 * Binary mode uses a simple length-prefixed format with Cap'n Proto payloads.
 */
export class Protocol {
  private binary: boolean;

  constructor(binary = true) {
    this.binary = binary;
  }

  /**
   * Encode a message for transmission
   */
  encode(type: MessageType, data: unknown): ArrayBuffer | string {
    if (this.binary) {
      return this.encodeBinary(type, data);
    }
    return this.encodeJson(type, data);
  }

  /**
   * Decode a received message
   */
  decode(data: ArrayBuffer | string): { type: MessageType; payload: unknown } {
    if (typeof data === 'string') {
      return this.decodeJson(data);
    }
    return this.decodeBinary(data);
  }

  /**
   * Encode as binary (length-prefixed JSON for now, Cap'n Proto later)
   *
   * Format:
   * - 4 bytes: ZAP magic
   * - 1 byte: message type
   * - 4 bytes: payload length (big-endian)
   * - N bytes: payload (JSON or Cap'n Proto)
   */
  private encodeBinary(type: MessageType, data: unknown): ArrayBuffer {
    const json = JSON.stringify(data);
    const payload = new TextEncoder().encode(json);

    const buffer = new ArrayBuffer(9 + payload.length);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Magic
    bytes.set(ZAP_MAGIC, 0);

    // Type
    view.setUint8(4, type);

    // Length (big-endian)
    view.setUint32(5, payload.length, false);

    // Payload
    bytes.set(payload, 9);

    return buffer;
  }

  /**
   * Decode binary message
   */
  private decodeBinary(data: ArrayBuffer): { type: MessageType; payload: unknown } {
    const view = new DataView(data);
    const bytes = new Uint8Array(data);

    // Verify magic
    if (
      bytes[0] !== ZAP_MAGIC[0] ||
      bytes[1] !== ZAP_MAGIC[1] ||
      bytes[2] !== ZAP_MAGIC[2] ||
      bytes[3] !== ZAP_MAGIC[3]
    ) {
      throw new Error('Invalid ZAP message: bad magic');
    }

    // Type
    const type = view.getUint8(4) as MessageType;

    // Length
    const length = view.getUint32(5, false);

    // Payload
    const payloadBytes = bytes.slice(9, 9 + length);
    const json = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(json);

    return { type, payload };
  }

  /**
   * Encode as JSON (fallback mode)
   */
  private encodeJson(type: MessageType, data: unknown): string {
    return JSON.stringify({
      _zap: { type, version: 1 },
      ...data as object,
    });
  }

  /**
   * Decode JSON message
   */
  private decodeJson(data: string): { type: MessageType; payload: unknown } {
    const parsed = JSON.parse(data);
    const { _zap, ...payload } = parsed;
    return { type: _zap?.type ?? MessageType.Request, payload };
  }

  // Convenience methods

  encodeHandshake(handshake: Handshake): ArrayBuffer | string {
    return this.encode(MessageType.Handshake, handshake);
  }

  encodeHandshakeResponse(response: HandshakeResponse): ArrayBuffer | string {
    return this.encode(MessageType.HandshakeResponse, response);
  }

  encodeRequest(request: ZapRequest): ArrayBuffer | string {
    return this.encode(MessageType.Request, request);
  }

  encodeResponse(response: ZapResponse): ArrayBuffer | string {
    return this.encode(MessageType.Response, response);
  }

  encodePing(): ArrayBuffer | string {
    return this.encode(MessageType.Ping, { ts: Date.now() });
  }

  encodePong(ts: number): ArrayBuffer | string {
    return this.encode(MessageType.Pong, { ts });
  }
}

/** Generate a unique request ID */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Generate a unique client ID */
export function generateClientId(): string {
  return `zap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Default protocol instance */
export const defaultProtocol = new Protocol(true);
