/**
 * ZAP Server - Accept direct browser extension connections
 *
 * Lightweight server for MCP servers to expose tools to browser extensions.
 * Can handle multiple concurrent browser connections from different browsers.
 */

import { Protocol, MessageType, generateClientId } from './protocol.js';
import { ZapError } from './error.js';
import { ClientType } from './types.js';
import type {
  ZapRequest,
  ZapResponse,
  ZapServerOptions,
  Tool,
  BrowserParams,
  Handshake,
  HandshakeResponse,
  ZapEventHandler,
  ToolHandler,
  BrowserHandler,
  ExtensionInfo,
} from './types.js';

const DEFAULT_PORT = 9999;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_MAX_CONNECTIONS = 1000;
const DEFAULT_REQUEST_TIMEOUT = 30000;

interface ConnectedClient {
  id: string;
  type: ClientType;
  capabilities: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws: any;
  lastActive: number;
  browser: string | undefined;
  version: string | undefined;
}

/**
 * ZAP Server for MCP servers
 *
 * @example
 * ```typescript
 * const server = new ZapServer({ port: 9999 });
 *
 * // Register tools
 * server.tool('search', async (params) => {
 *   return { success: true, content: [{ type: 'text', text: 'results' }] };
 * });
 *
 * // Handle browser actions from extension
 * server.onBrowser(async (params) => {
 *   // Handle browser control requests
 * });
 *
 * await server.start();
 * ```
 */
export class ZapServer {
  private protocol: Protocol;
  private options: Required<ZapServerOptions>;
  private clients = new Map<string, ConnectedClient>();
  private eventHandlers = new Map<string, Set<ZapEventHandler>>();
  private toolHandlers = new Map<string, ToolHandler>();
  private browserHandler: BrowserHandler | null = null;
  private tools = new Map<string, Tool>();
  private wss: any = null; // WebSocket.Server type
  private serverId: string;

  constructor(options: ZapServerOptions = {}) {
    this.serverId = generateClientId();
    this.options = {
      port: options.port ?? DEFAULT_PORT,
      host: options.host ?? DEFAULT_HOST,
      name: options.name ?? 'hanzo-mcp',
      maxConnections: options.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
      binary: options.binary ?? true,
      requestTimeout: options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
    };
    this.protocol = new Protocol(this.options.binary);
  }

  /** Get server ID */
  get id(): string {
    return this.serverId;
  }

  /** Get number of connected clients */
  get connectionCount(): number {
    return this.clients.size;
  }

  /** Get list of connected extensions */
  get extensions(): ExtensionInfo[] {
    return Array.from(this.clients.values())
      .filter((c) => c.type === ClientType.BrowserExtension)
      .map((c) => ({
        id: c.id,
        browser: c.browser ?? 'unknown',
        version: c.version ?? '0.0.0',
        capabilities: c.capabilities,
        connected: true,
        lastActive: c.lastActive,
      }));
  }

  /**
   * Start the server
   *
   * Requires WebSocket server - in Node.js use the 'ws' package
   */
  async start(): Promise<void> {
    // Dynamic import for Node.js WebSocket
    let WebSocketServer: any;
    try {
      const ws = await import('ws');
      WebSocketServer = ws.WebSocketServer;
    } catch {
      throw new Error('WebSocket server requires "ws" package: npm install ws');
    }

    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          host: this.options.host,
          port: this.options.port,
        });

        this.wss.on('connection', (ws: any) => {
          this.handleConnection(ws);
        });

        this.wss.on('error', (error: Error) => {
          this.emit('error', error);
          reject(error);
        });

        this.wss.on('listening', () => {
          console.log(`ZAP Server listening on ws://${this.options.host}:${this.options.port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.wss) {
      // Close all connections
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.clients.clear();

      // Close server
      await new Promise<void>((resolve) => {
        this.wss.close(() => resolve());
      });
      this.wss = null;
    }
  }

  /**
   * Register a tool
   */
  tool(name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler): void;
  tool(name: string, handler: ToolHandler): void;
  tool(
    name: string,
    descriptionOrHandler: string | ToolHandler,
    schema?: Record<string, unknown>,
    handler?: ToolHandler
  ): void {
    if (typeof descriptionOrHandler === 'function') {
      this.tools.set(name, { name, description: '', schema: {} });
      this.toolHandlers.set(name, descriptionOrHandler);
    } else {
      this.tools.set(name, { name, description: descriptionOrHandler, schema: schema ?? {} });
      this.toolHandlers.set(name, handler!);
    }
  }

  /**
   * Set browser action handler
   */
  onBrowser(handler: BrowserHandler): void {
    this.browserHandler = handler;
  }

  /**
   * Subscribe to server events
   */
  on(event: string, handler: ZapEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from server events
   */
  off(event: string, handler: ZapEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Broadcast to all connected extensions
   */
  broadcast(data: unknown): void {
    const message = this.protocol.encode(MessageType.Stream, data);
    for (const client of this.clients.values()) {
      if (client.type === ClientType.BrowserExtension) {
        try {
          client.ws.send(message);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /**
   * Send to a specific client
   */
  send(clientId: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const message = this.protocol.encode(MessageType.Stream, data);
      client.ws.send(message);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleConnection(ws: any): void {
    let clientId: string | null = null;

    ws.on('message', async (data: ArrayBuffer | string) => {
      try {
        const { type, payload } = this.protocol.decode(
          data instanceof Buffer ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data
        );

        if (type === MessageType.Handshake) {
          clientId = await this.handleHandshake(ws, payload as Handshake);
        } else if (type === MessageType.Request && clientId) {
          await this.handleRequest(clientId, payload as ZapRequest);
        } else if (type === MessageType.Ping) {
          const pong = this.protocol.encodePong((payload as any).ts);
          ws.send(pong);
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    ws.on('close', () => {
      if (clientId) {
        const client = this.clients.get(clientId);
        if (client) {
          this.emit('extension:disconnect', {
            clientId,
            browser: client.browser,
            version: client.version,
          });
        }
        this.clients.delete(clientId);
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  private async handleHandshake(ws: any, handshake: Handshake): Promise<string> {
    // Check max connections
    if (this.clients.size >= this.options.maxConnections) {
      const response: HandshakeResponse = {
        accepted: false,
        clientId: handshake.clientId,
        serverVersion: '1.0.0',
        capabilities: [],
        error: 'Max connections reached',
      };
      ws.send(this.protocol.encodeHandshakeResponse(response));
      ws.close();
      return '';
    }

    const clientId = handshake.clientId || generateClientId();

    const client: ConnectedClient = {
      id: clientId,
      type: handshake.clientType,
      capabilities: handshake.capabilities,
      ws,
      lastActive: Date.now(),
      browser: handshake.metadata?.['browser'],
      version: handshake.metadata?.['version'],
    };

    this.clients.set(clientId, client);

    const response: HandshakeResponse = {
      accepted: true,
      clientId,
      serverVersion: '1.0.0',
      capabilities: ['tools', 'browser', 'mcp'],
    };

    ws.send(this.protocol.encodeHandshakeResponse(response));

    if (handshake.clientType === ClientType.BrowserExtension) {
      this.emit('extension:connect', {
        id: clientId,
        browser: client.browser,
        version: client.version,
        capabilities: client.capabilities,
      });
    }

    return clientId;
  }

  private async handleRequest(clientId: string, request: ZapRequest): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActive = Date.now();

    let response: ZapResponse;

    try {
      const result = await this.processRequest(request);
      if (result !== undefined) {
        response = { id: request.id, result: result as NonNullable<ZapResponse['result']> };
      } else {
        response = { id: request.id };
      }
    } catch (error) {
      const zapError = error instanceof ZapError ? error : null;
      const code = zapError?.code;
      response = {
        id: request.id,
        error: {
          code: typeof code === 'number' ? code : -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      };
    }

    try {
      client.ws.send(this.protocol.encodeResponse(response));
    } catch {
      // Client disconnected
    }
  }

  private async processRequest(request: ZapRequest): Promise<unknown> {
    const { method, params } = request;

    switch (method) {
      case 'tools/list':
        return { tools: Array.from(this.tools.values()) };

      case 'tools/call': {
        const toolParams = params as { name: string; arguments: Record<string, unknown> };
        const handler = this.toolHandlers.get(toolParams.name);
        if (!handler) {
          throw new ZapError(`Tool not found: ${toolParams.name}`, -32601);
        }
        return handler(toolParams.arguments);
      }

      case 'browser': {
        if (!this.browserHandler) {
          throw new ZapError('Browser handler not configured', -32601);
        }
        return this.browserHandler(params as BrowserParams);
      }

      case 'ping':
        return { pong: true, ts: Date.now() };

      default:
        throw new ZapError(`Unknown method: ${method}`, -32601);
    }
  }

  private emit(event: string, data: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (e) {
        console.error('Event handler error:', e);
      }
    });
  }
}

// Legacy export
export { ZapServer as Server };
