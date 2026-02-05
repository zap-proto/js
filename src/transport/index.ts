/**
 * ZAP Transport Layer
 *
 * Provides transport abstractions for ZAP protocol communication.
 * Supports TCP, WebSocket, Unix sockets, Stdio, and HTTP/SSE.
 */

import { TransportError } from '../error.js';

/** Maximum message size (16 MB) */
export const MAX_MESSAGE_SIZE = 16 * 1024 * 1024;

/** Frame header size (4 bytes for length) */
export const FRAME_HEADER_SIZE = 4;

/**
 * Transport interface for ZAP connections
 */
export interface Transport {
  /** Send a framed message */
  send(data: Uint8Array | string): Promise<void>;

  /** Receive a framed message */
  recv(): Promise<Uint8Array>;

  /** Close the transport */
  close(): Promise<void>;

  /** Check if transport is connected */
  isConnected(): boolean;

  /** Get local address if available */
  localAddr(): string | null;

  /** Get peer address if available */
  peerAddr(): string | null;
}

/**
 * Transport events
 */
export interface TransportEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
  message: (data: Uint8Array) => void;
}

/**
 * TCP Transport for Node.js
 *
 * Provides length-prefixed framing over TCP sockets.
 */
export class TcpTransport implements Transport {
  private socket: import('net').Socket | null = null;
  private _localAddr: string | null = null;
  private _peerAddr: string | null = null;
  private recvBuffer: Uint8Array = new Uint8Array(0);
  private pendingRecv: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;

  private constructor() {}

  /**
   * Connect to a TCP address
   */
  static async connect(host: string, port: number): Promise<TcpTransport> {
    const net = await import('net');

    return new Promise((resolve, reject) => {
      const transport = new TcpTransport();
      const socket = net.createConnection({ host, port }, () => {
        transport.socket = socket;
        transport._localAddr = `${socket.localAddress}:${socket.localPort}`;
        transport._peerAddr = `${host}:${port}`;

        socket.setNoDelay(true);

        socket.on('data', (chunk: Buffer) => {
          transport.handleData(new Uint8Array(chunk));
        });

        socket.on('error', (err) => {
          if (transport.pendingRecv) {
            transport.pendingRecv.reject(new TransportError(err.message));
            transport.pendingRecv = null;
          }
        });

        socket.on('close', () => {
          if (transport.pendingRecv) {
            transport.pendingRecv.reject(new TransportError('connection closed'));
            transport.pendingRecv = null;
          }
        });

        resolve(transport);
      });

      socket.on('error', (err) => {
        reject(new TransportError(`TCP connect failed: ${err.message}`));
      });
    });
  }

  /**
   * Create from existing socket (for server-side connections)
   */
  static fromSocket(socket: import('net').Socket): TcpTransport {
    const transport = new TcpTransport();
    transport.socket = socket;
    transport._localAddr = `${socket.localAddress}:${socket.localPort}`;
    transport._peerAddr = `${socket.remoteAddress}:${socket.remotePort}`;

    socket.setNoDelay(true);

    socket.on('data', (chunk: Buffer) => {
      transport.handleData(new Uint8Array(chunk));
    });

    socket.on('error', (err) => {
      if (transport.pendingRecv) {
        transport.pendingRecv.reject(new TransportError(err.message));
        transport.pendingRecv = null;
      }
    });

    socket.on('close', () => {
      if (transport.pendingRecv) {
        transport.pendingRecv.reject(new TransportError('connection closed'));
        transport.pendingRecv = null;
      }
    });

    return transport;
  }

  private handleData(chunk: Uint8Array): void {
    // Append to buffer
    const newBuffer = new Uint8Array(this.recvBuffer.length + chunk.length);
    newBuffer.set(this.recvBuffer);
    newBuffer.set(chunk, this.recvBuffer.length);
    this.recvBuffer = newBuffer;

    this.tryDeliverMessage();
  }

  private tryDeliverMessage(): void {
    if (!this.pendingRecv) return;
    if (this.recvBuffer.length < FRAME_HEADER_SIZE) return;

    // Read length prefix (big-endian)
    const view = new DataView(this.recvBuffer.buffer, this.recvBuffer.byteOffset);
    const len = view.getUint32(0, false);

    if (len > MAX_MESSAGE_SIZE) {
      this.pendingRecv.reject(new TransportError(`message too large: ${len}`));
      this.pendingRecv = null;
      return;
    }

    if (this.recvBuffer.length < FRAME_HEADER_SIZE + len) return;

    // Extract message
    const message = this.recvBuffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + len);
    this.recvBuffer = this.recvBuffer.slice(FRAME_HEADER_SIZE + len);

    const { resolve } = this.pendingRecv;
    this.pendingRecv = null;
    resolve(message);
  }

  async send(data: Uint8Array | string): Promise<void> {
    if (!this.socket) {
      throw new TransportError('connection closed');
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    if (bytes.length > MAX_MESSAGE_SIZE) {
      throw new TransportError(`message too large: ${bytes.length}`);
    }

    // Create framed message with length prefix
    const frame = new Uint8Array(FRAME_HEADER_SIZE + bytes.length);
    const view = new DataView(frame.buffer);
    view.setUint32(0, bytes.length, false);
    frame.set(bytes, FRAME_HEADER_SIZE);

    return new Promise((resolve, reject) => {
      this.socket!.write(frame, (err) => {
        if (err) {
          reject(new TransportError(`send failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async recv(): Promise<Uint8Array> {
    if (!this.socket) {
      throw new TransportError('connection closed');
    }

    // Check if we already have a complete message
    if (this.recvBuffer.length >= FRAME_HEADER_SIZE) {
      const view = new DataView(this.recvBuffer.buffer, this.recvBuffer.byteOffset);
      const len = view.getUint32(0, false);

      if (this.recvBuffer.length >= FRAME_HEADER_SIZE + len) {
        const message = this.recvBuffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + len);
        this.recvBuffer = this.recvBuffer.slice(FRAME_HEADER_SIZE + len);
        return message;
      }
    }

    return new Promise((resolve, reject) => {
      this.pendingRecv = { resolve, reject };
    });
  }

  async close(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  localAddr(): string | null {
    return this._localAddr;
  }

  peerAddr(): string | null {
    return this._peerAddr;
  }
}

/**
 * TCP Transport Listener for accepting connections
 */
export class TcpTransportListener {
  private server: import('net').Server;
  private _localAddr: string;

  private constructor(server: import('net').Server, localAddr: string) {
    this.server = server;
    this._localAddr = localAddr;
  }

  /**
   * Bind to a TCP address
   */
  static async bind(host: string, port: number): Promise<TcpTransportListener> {
    const net = await import('net');

    return new Promise((resolve, reject) => {
      const server = net.createServer();

      server.on('error', (err) => {
        reject(new TransportError(`bind failed: ${err.message}`));
      });

      server.listen(port, host, () => {
        const addr = server.address();
        const localAddr = typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`;
        resolve(new TcpTransportListener(server, localAddr));
      });
    });
  }

  /**
   * Accept a new connection
   */
  async accept(): Promise<TcpTransport> {
    return new Promise((resolve) => {
      const handler = (socket: import('net').Socket) => {
        this.server.off('connection', handler);
        resolve(TcpTransport.fromSocket(socket));
      };
      this.server.on('connection', handler);
    });
  }

  /**
   * Close the listener
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  get localAddr(): string {
    return this._localAddr;
  }
}

/**
 * Stdio Transport for subprocess MCP servers
 *
 * Communicates via stdin/stdout with length-prefixed framing.
 */
export class StdioTransport implements Transport {
  private child: import('child_process').ChildProcess | null = null;
  private _command: string;
  private recvBuffer: Uint8Array = new Uint8Array(0);
  private pendingRecv: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;

  private constructor(command: string) {
    this._command = command;
  }

  /**
   * Spawn a subprocess with the given command and arguments
   */
  static async spawn(command: string, args: string[] = []): Promise<StdioTransport> {
    const { spawn } = await import('child_process');

    const transport = new StdioTransport(command);

    transport.child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    if (!transport.child.stdin || !transport.child.stdout) {
      throw new TransportError('failed to capture stdio');
    }

    transport.child.stdout.on('data', (chunk: Buffer) => {
      transport.handleData(new Uint8Array(chunk));
    });

    transport.child.on('error', (err) => {
      if (transport.pendingRecv) {
        transport.pendingRecv.reject(new TransportError(err.message));
        transport.pendingRecv = null;
      }
    });

    transport.child.on('close', () => {
      if (transport.pendingRecv) {
        transport.pendingRecv.reject(new TransportError('process exited'));
        transport.pendingRecv = null;
      }
    });

    return transport;
  }

  private handleData(chunk: Uint8Array): void {
    const newBuffer = new Uint8Array(this.recvBuffer.length + chunk.length);
    newBuffer.set(this.recvBuffer);
    newBuffer.set(chunk, this.recvBuffer.length);
    this.recvBuffer = newBuffer;

    this.tryDeliverMessage();
  }

  private tryDeliverMessage(): void {
    if (!this.pendingRecv) return;
    if (this.recvBuffer.length < FRAME_HEADER_SIZE) return;

    const view = new DataView(this.recvBuffer.buffer, this.recvBuffer.byteOffset);
    const len = view.getUint32(0, false);

    if (len > MAX_MESSAGE_SIZE) {
      this.pendingRecv.reject(new TransportError(`message too large: ${len}`));
      this.pendingRecv = null;
      return;
    }

    if (this.recvBuffer.length < FRAME_HEADER_SIZE + len) return;

    const message = this.recvBuffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + len);
    this.recvBuffer = this.recvBuffer.slice(FRAME_HEADER_SIZE + len);

    const { resolve } = this.pendingRecv;
    this.pendingRecv = null;
    resolve(message);
  }

  async send(data: Uint8Array | string): Promise<void> {
    if (!this.child?.stdin) {
      throw new TransportError('stdin closed');
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    if (bytes.length > MAX_MESSAGE_SIZE) {
      throw new TransportError(`message too large: ${bytes.length}`);
    }

    const frame = new Uint8Array(FRAME_HEADER_SIZE + bytes.length);
    const view = new DataView(frame.buffer);
    view.setUint32(0, bytes.length, false);
    frame.set(bytes, FRAME_HEADER_SIZE);

    return new Promise((resolve, reject) => {
      this.child!.stdin!.write(frame, (err) => {
        if (err) {
          reject(new TransportError(`send failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async recv(): Promise<Uint8Array> {
    if (!this.child) {
      throw new TransportError('process not running');
    }

    if (this.recvBuffer.length >= FRAME_HEADER_SIZE) {
      const view = new DataView(this.recvBuffer.buffer, this.recvBuffer.byteOffset);
      const len = view.getUint32(0, false);

      if (this.recvBuffer.length >= FRAME_HEADER_SIZE + len) {
        const message = this.recvBuffer.slice(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + len);
        this.recvBuffer = this.recvBuffer.slice(FRAME_HEADER_SIZE + len);
        return message;
      }
    }

    return new Promise((resolve, reject) => {
      this.pendingRecv = { resolve, reject };
    });
  }

  async close(): Promise<void> {
    if (this.child) {
      this.child.stdin?.end();
      this.child.kill();
      this.child = null;
    }
  }

  isConnected(): boolean {
    return this.child !== null && !this.child.killed;
  }

  localAddr(): string | null {
    return `stdio://${this._command}`;
  }

  peerAddr(): string | null {
    return `stdio://${this._command}`;
  }
}

/**
 * WebSocket Transport (browser and Node.js)
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private _peerAddr: string;
  private recvQueue: Uint8Array[] = [];
  private pendingRecv: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;

  private constructor(ws: WebSocket, peerAddr: string) {
    this.ws = ws;
    this._peerAddr = peerAddr;
  }

  /**
   * Connect to a WebSocket URL
   */
  static async connect(url: string): Promise<WebSocketTransport> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';

      const transport = new WebSocketTransport(ws, url);

      ws.onopen = () => {
        resolve(transport);
      };

      ws.onerror = () => {
        reject(new TransportError('WebSocket connect failed'));
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        if (transport.pendingRecv) {
          const { resolve } = transport.pendingRecv;
          transport.pendingRecv = null;
          resolve(data);
        } else {
          transport.recvQueue.push(data);
        }
      };

      ws.onclose = () => {
        if (transport.pendingRecv) {
          transport.pendingRecv.reject(new TransportError('connection closed'));
          transport.pendingRecv = null;
        }
      };
    });
  }

  async send(data: Uint8Array | string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new TransportError('connection closed');
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    this.ws.send(bytes);
  }

  async recv(): Promise<Uint8Array> {
    if (this.recvQueue.length > 0) {
      return this.recvQueue.shift()!;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new TransportError('connection closed');
    }

    return new Promise((resolve, reject) => {
      this.pendingRecv = { resolve, reject };
    });
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  localAddr(): string | null {
    return null;
  }

  peerAddr(): string | null {
    return this._peerAddr;
  }
}

/**
 * HTTP/SSE Transport for remote MCP servers
 *
 * Uses HTTP POST for sending and Server-Sent Events for receiving.
 */
export class HttpSseTransport implements Transport {
  private baseUrl: string;
  private connected = true;
  private recvQueue: Uint8Array[] = [];
  private pendingRecv: {
    resolve: (data: Uint8Array) => void;
    reject: (err: Error) => void;
  } | null = null;
  private eventSource: EventSource | null = null;

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Connect to an HTTP/SSE endpoint
   */
  static async connect(baseUrl: string): Promise<HttpSseTransport> {
    const transport = new HttpSseTransport(baseUrl);

    // Start SSE listener
    if (typeof EventSource !== 'undefined') {
      transport.eventSource = new EventSource(`${transport.baseUrl}/sse`);

      transport.eventSource.onmessage = (event) => {
        const data = new TextEncoder().encode(event.data);
        if (transport.pendingRecv) {
          const { resolve } = transport.pendingRecv;
          transport.pendingRecv = null;
          resolve(data);
        } else {
          transport.recvQueue.push(data);
        }
      };

      transport.eventSource.onerror = () => {
        transport.connected = false;
        if (transport.pendingRecv) {
          transport.pendingRecv.reject(new TransportError('SSE connection failed'));
          transport.pendingRecv = null;
        }
      };
    }

    return transport;
  }

  async send(data: Uint8Array | string): Promise<void> {
    if (!this.connected) {
      throw new TransportError('not connected');
    }

    const body = typeof data === 'string' ? data : new TextDecoder().decode(data);

    const response = await fetch(`${this.baseUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!response.ok) {
      throw new TransportError(`HTTP error: ${response.status}`);
    }
  }

  async recv(): Promise<Uint8Array> {
    if (this.recvQueue.length > 0) {
      return this.recvQueue.shift()!;
    }

    if (!this.connected) {
      throw new TransportError('not connected');
    }

    return new Promise((resolve, reject) => {
      this.pendingRecv = { resolve, reject };
    });
  }

  async close(): Promise<void> {
    this.connected = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  localAddr(): string | null {
    return null;
  }

  peerAddr(): string | null {
    return this.baseUrl;
  }
}

/**
 * Create a transport from a URL
 *
 * Supported schemes:
 * - `zap://` or `tcp://` - TCP transport
 * - `ws://` or `wss://` - WebSocket transport
 * - `stdio://` - Stdio transport
 * - `http://` or `https://` - HTTP/SSE transport
 */
export async function connect(url: string): Promise<Transport> {
  const parsed = new URL(url);

  switch (parsed.protocol) {
    case 'zap:':
    case 'tcp:': {
      const host = parsed.hostname || 'localhost';
      const port = parseInt(parsed.port, 10) || 9999;
      return TcpTransport.connect(host, port);
    }

    case 'ws:':
    case 'wss:':
      return WebSocketTransport.connect(url);

    case 'stdio:': {
      const command = parsed.pathname.slice(1); // Remove leading /
      const args = parsed.searchParams.getAll('arg');
      return StdioTransport.spawn(command, args);
    }

    case 'http:':
    case 'https:':
      return HttpSseTransport.connect(url);

    default:
      throw new TransportError(`unsupported URL scheme: ${parsed.protocol}`);
  }
}
