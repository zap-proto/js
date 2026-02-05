/**
 * ZAP Browser Extension Client
 *
 * Specialized client for browser extensions to connect directly to MCP servers.
 * Supports:
 * - Multiple MCP server connections
 * - Multi-browser (Chrome, Firefox, Safari, Edge)
 * - Lightweight design for minimal memory footprint
 * - Auto-discovery of MCP servers
 */

import { ZapClient } from '../client.js';
import { Protocol, generateClientId } from '../protocol.js';
import { ConnectionError, ZapError } from '../error.js';
import {
  ClientType,
} from '../types.js';
import type {
  ZapClientOptions,
  McpInfo,
  ToolInfo,
  Tool,
  ToolResult,
  BrowserAction,
  BrowserResult,
  ZapEventHandler,
} from '../types.js';

const DEFAULT_DISCOVERY_PORTS = [9999, 9998, 9997, 9996, 9995];
const DEFAULT_DISCOVERY_TIMEOUT = 2000;

interface McpConnection {
  client: ZapClient;
  info: McpInfo;
  connected: boolean;
}

/**
 * Browser Extension ZAP Client
 *
 * Manages multiple MCP connections from a browser extension.
 * Extension can be running in multiple browsers simultaneously.
 *
 * @example
 * ```typescript
 * // In browser extension background script
 * import { ExtensionClient } from '@hanzo/zap/browser';
 *
 * const client = new ExtensionClient({
 *   browser: 'chrome',
 *   version: '1.0.0',
 * });
 *
 * // Auto-discover MCP servers
 * const mcps = await client.discover();
 *
 * // Or connect to specific MCP
 * await client.connectMcp('ws://localhost:9999');
 *
 * // Call tool on any connected MCP
 * const result = await client.callTool('search', { query: 'hello' });
 *
 * // Or target specific MCP
 * const result2 = await client.callTool('search', { query: 'hello' }, 'mcp-123');
 * ```
 */
export class ExtensionClient {
  private extensionId: string;
  private _browser: string;
  private _version: string;
  private capabilities: string[];
  private mcpConnections = new Map<string, McpConnection>();
  private eventHandlers = new Map<string, Set<ZapEventHandler>>();
  private options: ZapClientOptions;

  constructor(options: ExtensionClientOptions = {}) {
    this.extensionId = options.extensionId ?? generateClientId();
    this._browser = options.browser ?? detectBrowser();
    this._version = options.version ?? '1.0.0';
    this.capabilities = options.capabilities ?? [
      'tabs',
      'navigate',
      'screenshot',
      'evaluate',
      'cookies',
      'storage',
    ];
    // Protocol instance not currently used but kept for future streaming support
    new Protocol(options.binary ?? true);
    this.options = {
      clientId: this.extensionId,
      clientType: ClientType.BrowserExtension,
      capabilities: this.capabilities,
      timeout: options.timeout ?? 30000,
      autoReconnect: options.autoReconnect ?? true,
      reconnectInterval: options.reconnectInterval ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      binary: options.binary ?? true,
    };
  }

  /** Get browser name */
  get browser(): string {
    return this._browser;
  }

  /** Get version */
  get version(): string {
    return this._version;
  }

  /** Get extension ID */
  get id(): string {
    return this.extensionId;
  }

  /** Get list of connected MCPs */
  get mcps(): McpInfo[] {
    return Array.from(this.mcpConnections.values())
      .filter((c) => c.connected)
      .map((c) => c.info);
  }

  /** Get number of connected MCPs */
  get connectionCount(): number {
    return Array.from(this.mcpConnections.values()).filter((c) => c.connected).length;
  }

  /**
   * Discover available MCP servers
   */
  async discover(ports = DEFAULT_DISCOVERY_PORTS, timeout = DEFAULT_DISCOVERY_TIMEOUT): Promise<McpInfo[]> {
    const discovered: McpInfo[] = [];

    await Promise.all(
      ports.map(async (port) => {
        try {
          const url = `ws://localhost:${port}`;
          const mcp = await this.probeServer(url, timeout);
          if (mcp) {
            discovered.push(mcp);
          }
        } catch {
          // Server not available on this port
        }
      })
    );

    return discovered;
  }

  /**
   * Connect to an MCP server
   */
  async connectMcp(url: string): Promise<McpInfo> {
    // Check if already connected
    const existing = Array.from(this.mcpConnections.values()).find(
      (c) => c.info.url === url && c.connected
    );
    if (existing) {
      return existing.info;
    }

    const client = new ZapClient({
      ...this.options,
      clientId: `${this.extensionId}:${Date.now()}`,
    });

    try {
      await client.connect(url);

      // Get tools
      const tools = await client.listTools();

      const info: McpInfo = {
        id: generateClientId(),
        name: `MCP@${url}`,
        url,
        connected: true,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: JSON.stringify(t.schema),
        })),
      };

      const connection: McpConnection = {
        client,
        info,
        connected: true,
      };

      this.mcpConnections.set(info.id, connection);

      // Handle disconnect
      client.on('disconnect', () => {
        connection.connected = false;
        connection.info.connected = false;
        this.emit('mcp:disconnect', info);
      });

      client.on('reconnect', () => {
        connection.connected = true;
        connection.info.connected = true;
        this.emit('mcp:reconnect', info);
      });

      this.emit('mcp:connect', info);

      return info;
    } catch (error) {
      throw new ConnectionError(`Failed to connect to MCP at ${url}: ${error}`);
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnectMcp(mcpId: string): Promise<void> {
    const connection = this.mcpConnections.get(mcpId);
    if (!connection) return;

    await connection.client.close();
    connection.connected = false;
    connection.info.connected = false;
    this.mcpConnections.delete(mcpId);

    this.emit('mcp:disconnect', connection.info);
  }

  /**
   * Disconnect from all MCPs
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.mcpConnections.keys()).map((id) => this.disconnectMcp(id))
    );
  }

  /**
   * Call a tool on connected MCPs
   *
   * @param name Tool name
   * @param args Tool arguments
   * @param mcpId Optional specific MCP to target
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    mcpId?: string
  ): Promise<ToolResult> {
    // If MCP specified, use that one
    if (mcpId) {
      const connection = this.mcpConnections.get(mcpId);
      if (!connection?.connected) {
        throw new ZapError(`MCP not connected: ${mcpId}`);
      }
      return connection.client.callTool(name, args);
    }

    // Otherwise, find an MCP that has the tool
    for (const connection of this.mcpConnections.values()) {
      if (!connection.connected) continue;

      const hasTool = connection.info.tools.some((t) => t.name === name);
      if (hasTool) {
        return connection.client.callTool(name, args);
      }
    }

    throw new ZapError(`Tool not found on any connected MCP: ${name}`);
  }

  /**
   * Get all available tools across connected MCPs
   */
  getTools(): ToolInfo[] {
    const tools = new Map<string, ToolInfo>();

    for (const connection of this.mcpConnections.values()) {
      if (!connection.connected) continue;

      for (const tool of connection.info.tools) {
        // Use first occurrence (avoid duplicates)
        if (!tools.has(tool.name)) {
          tools.set(tool.name, tool);
        }
      }
    }

    return Array.from(tools.values());
  }

  /**
   * Execute browser action and report to MCPs
   *
   * This is called by the extension when it performs browser actions,
   * allowing MCPs to track browser state.
   */
  async reportBrowserAction(action: BrowserAction, result: BrowserResult): Promise<void> {
    const message = {
      type: 'browser:action',
      extensionId: this.extensionId,
      browser: this.browser,
      action,
      result,
      timestamp: Date.now(),
    };

    // Broadcast to all connected MCPs
    for (const connection of this.mcpConnections.values()) {
      if (!connection.connected) continue;
      try {
        await connection.client.request('browser/event', message);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: ZapEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, handler: ZapEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async probeServer(url: string, timeout: number): Promise<McpInfo | null> {
    return new Promise((resolve) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, timeout);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        // Server responded, it's available
        resolve({
          id: url,
          name: `MCP@${url}`,
          url,
          connected: false, // Not connected yet, just discovered
          tools: [],
        });
      };

      ws.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };

      ws.onclose = () => {
        clearTimeout(timer);
      };
    });
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

/** Extension client options */
export interface ExtensionClientOptions extends ZapClientOptions {
  /** Extension ID (auto-generated if not provided) */
  extensionId?: string;
  /** Browser name */
  browser?: string;
  /** Extension version */
  version?: string;
}

/**
 * Detect current browser from user agent
 */
export function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'firefox';
  if (ua.includes('Edg/')) return 'edge';
  if (ua.includes('Chrome')) return 'chrome';
  if (ua.includes('Safari')) return 'safari';
  return 'unknown';
}

// Re-export types for convenience
export type { McpInfo, ToolInfo, Tool, ToolResult, BrowserAction, BrowserResult };
