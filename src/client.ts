/**
 * ZAP Client - Direct browser extension <> MCP server communication
 *
 * Lightweight client for connecting to MCP servers via ZAP protocol.
 * Works in browser extensions, Node.js, and web workers.
 *
 * Memory efficient - designed to be spawned in every agentic loop.
 */

import { Protocol, MessageType, generateId, generateClientId } from './protocol.js';
import { ZapError, ConnectionError, TimeoutError } from './error.js';
import {
  ClientType,
} from './types.js';
import type {
  ZapRequest,
  ZapResponse,
  ZapClientOptions,
  Tool,
  ToolResult,
  Resource,
  ResourceContent,
  BrowserParams,
  BrowserResult,
  Handshake,
  HandshakeResponse,
  ConnectionState,
  ZapEventHandler,
} from './types.js';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RECONNECT_INTERVAL = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

/**
 * ZAP Client for connecting to MCP servers
 *
 * @example
 * ```typescript
 * const client = new ZapClient();
 * await client.connect('ws://localhost:9999');
 *
 * // Call a tool
 * const result = await client.callTool('search', { query: 'hello' });
 *
 * // Control browser
 * const screenshot = await client.browser({ action: BrowserAction.Screenshot });
 *
 * // Disconnect
 * await client.close();
 * ```
 */
export class ZapClient {
  private ws: WebSocket | null = null;
  private protocol: Protocol;
  private options: Required<ZapClientOptions>;
  private state: ConnectionState = 'disconnected';
  private serverInfo: HandshakeResponse | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private eventHandlers = new Map<string, Set<ZapEventHandler>>();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private url: string | null = null;

  constructor(options: ZapClientOptions = {}) {
    this.options = {
      clientId: options.clientId ?? generateClientId(),
      clientType: options.clientType ?? ClientType.McpClient,
      capabilities: options.capabilities ?? ['tools', 'browser', 'mcp'],
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      binary: options.binary ?? true,
    };
    this.protocol = new Protocol(this.options.binary);
  }

  /** Get current connection state */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /** Get client ID */
  get clientId(): string {
    return this.options.clientId;
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Get server info from handshake */
  get server(): HandshakeResponse | null {
    return this.serverInfo;
  }

  /**
   * Connect to a ZAP server
   */
  async connect(url: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      throw new ConnectionError('Already connected or connecting');
    }

    this.url = url;
    this.state = 'connecting';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.state = 'disconnected';
        reject(new TimeoutError('Connection timeout'));
      }, this.options.timeout);

      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          // Send handshake
          const handshake: Handshake = {
            version: '1.0.0',
            clientType: this.options.clientType,
            clientId: this.options.clientId,
            capabilities: this.options.capabilities,
          };
          this.send(this.protocol.encodeHandshake(handshake));
        };

        this.ws.onmessage = (event) => {
          const { type, payload } = this.protocol.decode(event.data);

          if (type === MessageType.HandshakeResponse) {
            clearTimeout(timeout);
            const response = payload as HandshakeResponse;

            if (response.accepted) {
              this.serverInfo = response;
              this.state = 'connected';
              this.reconnectAttempts = 0;
              this.emit('connect', response);
              resolve();
            } else {
              this.state = 'disconnected';
              reject(new ConnectionError(response.error ?? 'Connection rejected'));
            }
          } else if (type === MessageType.Response) {
            this.handleResponse(payload as ZapResponse);
          } else if (type === MessageType.Pong) {
            // Pong received
          } else if (type === MessageType.Stream) {
            this.emit('stream', payload);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          this.emit('error', error);
          if (this.state === 'connecting') {
            this.state = 'disconnected';
            reject(new ConnectionError('WebSocket error'));
          }
        };

        this.ws.onclose = () => {
          const wasConnected = this.state === 'connected';
          this.state = 'disconnected';
          this.emit('disconnect', { wasConnected });

          // Auto-reconnect if enabled
          if (wasConnected && this.options.autoReconnect && this.url) {
            this.scheduleReconnect();
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        this.state = 'disconnected';
        reject(new ConnectionError(`Failed to connect: ${error}`));
      }
    });
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new ConnectionError('Connection closed'));
      this.pendingRequests.delete(id);
    }

    this.state = 'disconnected';
  }

  /**
   * Send a raw request
   */
  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected');
    }

    const id = generateId();
    const request: ZapRequest = { id, method, params: params as any };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`Request timeout: ${method}`));
      }, this.options.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.send(this.protocol.encodeRequest(request));
    });
  }

  // ============================================================================
  // MCP Tool Methods
  // ============================================================================

  /** List available tools */
  async listTools(): Promise<Tool[]> {
    const result = await this.request<{ tools: Tool[] }>('tools/list');
    return result.tools ?? [];
  }

  /** Call a tool */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    return this.request<ToolResult>('tools/call', { name, arguments: args });
  }

  /** List available resources */
  async listResources(): Promise<Resource[]> {
    const result = await this.request<{ resources: Resource[] }>('resources/list');
    return result.resources ?? [];
  }

  /** Read a resource */
  async readResource(uri: string): Promise<ResourceContent> {
    return this.request<ResourceContent>('resources/read', { uri });
  }

  // ============================================================================
  // Browser Control Methods
  // ============================================================================

  /** Execute a browser action */
  async browser(params: BrowserParams): Promise<BrowserResult> {
    return this.request<BrowserResult>('browser', params);
  }

  /** Navigate to URL */
  async navigate(url: string, tabId?: number): Promise<BrowserResult> {
    const params: BrowserParams = { action: 1, url }; // BrowserAction.Navigate
    if (tabId !== undefined) params.tabId = tabId;
    return this.browser(params);
  }

  /** Click an element */
  async click(selector: string, tabId?: number): Promise<BrowserResult> {
    const params: BrowserParams = { action: 10, selector }; // BrowserAction.Click
    if (tabId !== undefined) params.tabId = tabId;
    return this.browser(params);
  }

  /** Fill an input */
  async fill(selector: string, value: string, tabId?: number): Promise<BrowserResult> {
    const params: BrowserParams = { action: 12, selector, value }; // BrowserAction.Fill
    if (tabId !== undefined) params.tabId = tabId;
    return this.browser(params);
  }

  /** Evaluate JavaScript */
  async evaluate(code: string, tabId?: number): Promise<BrowserResult> {
    const params: BrowserParams = { action: 20, code }; // BrowserAction.Evaluate
    if (tabId !== undefined) params.tabId = tabId;
    return this.browser(params);
  }

  /** Take screenshot */
  async screenshot(fullPage = false, tabId?: number): Promise<BrowserResult> {
    const params: BrowserParams = { action: 40, fullPage }; // BrowserAction.Screenshot
    if (tabId !== undefined) params.tabId = tabId;
    return this.browser(params);
  }

  /** Get tabs */
  async getTabs(): Promise<BrowserResult> {
    return this.browser({ action: 50 }); // BrowserAction.GetTabs
  }

  // ============================================================================
  // Event Methods
  // ============================================================================

  /** Subscribe to an event */
  on(event: string, handler: ZapEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /** Unsubscribe from an event */
  off(event: string, handler: ZapEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private send(data: ArrayBuffer | string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private handleResponse(response: ZapResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new ZapError(response.error.message, response.error.code));
    } else {
      pending.resolve(response.result);
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

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('error', new ConnectionError('Max reconnect attempts reached'));
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimeout = setTimeout(async () => {
      if (this.url) {
        try {
          await this.connect(this.url);
          this.emit('reconnect', { attempts: this.reconnectAttempts });
        } catch {
          // Will retry via onclose handler
        }
      }
    }, delay);
  }
}

// Legacy export for backwards compatibility
export { ZapClient as Client };
