/**
 * @hanzo/zap - Zero-Copy App Proto
 *
 * Direct browser extension <> MCP server communication via Cap'n Proto.
 * No serialization overhead, no middle server, no JSON parsing.
 *
 * Architecture:
 * - Browser extension connects directly to MCP server via WebSocket
 * - Messages are Cap'n Proto binary (zero-copy)
 * - Extension can connect to multiple MCPs
 * - MCP server can accept multiple extensions
 *
 * Variants:
 * - @hanzo/zap - TypeScript implementation (this package)
 * - @hanzo/zap-wasm - Rust/WebAssembly for maximum performance
 *
 * @example
 * ```typescript
 * // In browser extension
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
 * ```
 *
 * @example
 * ```typescript
 * // In MCP server
 * import { ZapServer } from '@hanzo/zap/server';
 *
 * const server = new ZapServer({ port: 9999 });
 * server.tool('search', 'Search the web', {}, async (params) => {
 *   return { content: [{ type: 'text', text: 'results' }] };
 * });
 * await server.start();
 * ```
 *
 * @example
 * ```typescript
 * // Using WASM variant for maximum performance
 * import init, { ZapClient } from '@hanzo/zap-wasm';
 *
 * await init();
 * const client = new ZapClient({ clientId: 'my-extension' });
 * await client.connect('ws://localhost:9999');
 * ```
 *
 * @packageDocumentation
 */

// Core types
export * from './types.js';
export * from './error.js';
export * from './protocol.js';

// Version info
export const VERSION = '1.0.0';
export const PROTOCOL_VERSION = '1.0.0';
export const DEFAULT_PORT = 9999;

// Re-export submodules for convenience
export { ZapClient } from './client.js';
export { ZapServer } from './server.js';
export type { ZapClientOptions, ZapServerOptions } from './types.js';
