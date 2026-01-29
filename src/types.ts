/**
 * ZAP Protocol Types
 *
 * Core types for direct browser extension <> MCP server communication.
 * Supports multi-browser, multi-MCP connections with zero-copy wire format.
 */

// ============================================================================
// Enums
// ============================================================================

/** Client type identifier */
export enum ClientType {
  Unknown = 0,
  BrowserExtension = 1,
  McpServer = 2,
  McpClient = 3,
  Agent = 4,
}

/** Browser action types */
export enum BrowserAction {
  None = 0,
  Navigate = 1,
  Reload = 2,
  Back = 3,
  Forward = 4,
  Click = 10,
  Type = 11,
  Fill = 12,
  Select = 13,
  Scroll = 14,
  Hover = 15,
  Evaluate = 20,
  NewPage = 30,
  ClosePage = 31,
  ListPages = 32,
  GetActivePage = 33,
  Screenshot = 40,
  GetTabs = 50,
  SetActiveTab = 51,
  CloseTab = 52,
  NewTab = 53,
  GetCookies = 60,
  SetCookie = 61,
  ClearCookies = 62,
  GetStorage = 63,
  SetStorage = 64,
  Status = 70,
  Ping = 71,
}

/** Extension action types */
export enum ExtensionAction {
  None = 0,
  Register = 1,
  Unregister = 2,
  Send = 3,
  Broadcast = 4,
  Subscribe = 5,
  Unsubscribe = 6,
  List = 7,
  Ping = 8,
  ListMcps = 9,
  ConnectMcp = 10,
  DisconnectMcp = 11,
}

/** Stream action types */
export enum StreamAction {
  None = 0,
  Start = 1,
  Stop = 2,
  Pause = 3,
  Resume = 4,
}

/** Stream types */
export enum StreamType {
  None = 0,
  ConsoleMessages = 1,
  NetworkEvents = 2,
  DomChanges = 3,
  Storage = 4,
}

/** Console log levels */
export enum ConsoleLevel {
  Log = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
}

/** Network event types */
export enum NetworkEventType {
  Request = 0,
  Response = 1,
  Failed = 2,
}

// ============================================================================
// Core message types
// ============================================================================

/** ZAP request envelope */
export interface ZapRequest {
  id: string;
  method: string;
  params?: ToolCallParams | BrowserParams | ExtensionParams | StreamParams | McpParams;
  metadata?: Record<string, string>;
}

/** ZAP response envelope */
export interface ZapResponse {
  id: string;
  result?: ToolResult | BrowserResult | ExtensionResult | StreamChunk | McpResult;
  error?: ErrorResult;
  metadata?: Record<string, string>;
}

/** Error result */
export interface ErrorResult {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================================================
// Tool types (MCP compatible)
// ============================================================================

/** Tool definition */
export interface Tool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

/** Tool call parameters */
export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

/** Tool result */
export interface ToolResult {
  success: boolean;
  content: ContentBlock[];
  isError?: boolean;
}

/** Content block in tool result */
export interface ContentBlock {
  type: 'text' | 'image' | 'binary';
  text?: string;
  mimeType?: string;
  data?: ArrayBuffer | Uint8Array | string;
  altText?: string;
}

// ============================================================================
// Resource types (MCP compatible)
// ============================================================================

/** Resource definition */
export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Resource content */
export interface ResourceContent {
  uri: string;
  mimeType: string;
  content: string | Uint8Array;
}

// ============================================================================
// Browser types
// ============================================================================

/** Browser action parameters */
export interface BrowserParams {
  action: BrowserAction;
  contextId?: string;
  pageId?: string;
  url?: string;
  selector?: string;
  code?: string;
  expression?: string;
  value?: string;
  fullPage?: boolean;
  format?: string;
  quality?: number;
  tabId?: number;
}

/** Browser action result */
export interface BrowserResult {
  success: boolean;
  pageId?: string;
  contextId?: string;
  evaluateResult?: EvaluateResult;
  screenshot?: ArrayBuffer | Uint8Array | string;
  pages?: PageInfo[];
  tabs?: TabInfo[];
  cookies?: Cookie[];
  storage?: Record<string, string>;
  status?: BrowserStatus;
}

/** JavaScript evaluation result */
export interface EvaluateResult {
  type: string;
  value: string;
  preview?: string;
}

/** Page information */
export interface PageInfo {
  pageId: string;
  contextId: string;
  url: string;
  title: string;
}

/** Tab information */
export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
}

/** Cookie data */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/** Browser status */
export interface BrowserStatus {
  connected: boolean;
  browser: string;
  version: string;
  extensionId: string;
  capabilities: string[];
}

// ============================================================================
// Extension types (multi-browser, multi-MCP)
// ============================================================================

/** Extension action parameters */
export interface ExtensionParams {
  extensionId?: string;
  action: ExtensionAction;
  channel?: string;
  payload?: ArrayBuffer | Uint8Array | string;
  browser?: string;
  version?: string;
  capabilities?: string[];
  mcpId?: string;
}

/** Extension action result */
export interface ExtensionResult {
  success: boolean;
  extensionId?: string;
  payload?: ArrayBuffer | Uint8Array | string;
  extensions?: ExtensionInfo[];
  mcps?: McpInfo[];
}

/** Extension information */
export interface ExtensionInfo {
  id: string;
  browser: string;
  version: string;
  capabilities: string[];
  connected: boolean;
  lastActive: number;
}

/** MCP server information */
export interface McpInfo {
  id: string;
  name: string;
  url: string;
  connected: boolean;
  tools: ToolInfo[];
}

/** Tool information */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema?: string;
}

// ============================================================================
// MCP passthrough types
// ============================================================================

/** MCP native params */
export interface McpParams {
  method: string;
  params: unknown;
}

/** MCP native result */
export interface McpResult {
  result: unknown;
}

// ============================================================================
// Streaming types
// ============================================================================

/** Stream parameters */
export interface StreamParams {
  action: StreamAction;
  streamId: string;
  streamType: StreamType;
  filters?: Record<string, string>;
}

/** Stream chunk */
export interface StreamChunk {
  streamId: string;
  sequence: number;
  timestamp: number;
  data?: ConsoleMessage | NetworkEvent | ArrayBuffer | Uint8Array;
}

/** Console message */
export interface ConsoleMessage {
  level: ConsoleLevel;
  text: string;
  url?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

/** Network event */
export interface NetworkEvent {
  type: NetworkEventType;
  requestId: string;
  url: string;
  method: string;
  status?: number;
  headers?: Record<string, string>;
  body?: ArrayBuffer | Uint8Array | string;
  timestamp: number;
}

// ============================================================================
// Connection types
// ============================================================================

/** Handshake message */
export interface Handshake {
  version: string;
  clientType: ClientType;
  clientId: string;
  capabilities: string[];
  metadata?: Record<string, string>;
}

/** Handshake response */
export interface HandshakeResponse {
  accepted: boolean;
  clientId: string;
  serverVersion: string;
  capabilities: string[];
  error?: string;
}

// ============================================================================
// Options types
// ============================================================================

/** ZAP client options */
export interface ZapClientOptions {
  /** Client ID (auto-generated if not provided) */
  clientId?: string;
  /** Client type */
  clientType?: ClientType;
  /** Capabilities to advertise */
  capabilities?: string[];
  /** Connection timeout in ms */
  timeout?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect interval in ms */
  reconnectInterval?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Enable binary (Cap'n Proto) mode - default true for performance */
  binary?: boolean;
}

/** ZAP server options */
export interface ZapServerOptions {
  /** Server port (default: 9999) */
  port?: number;
  /** Server host (default: 0.0.0.0) */
  host?: string;
  /** Server name */
  name?: string;
  /** Maximum connections (default: 1000) */
  maxConnections?: number;
  /** Enable binary (Cap'n Proto) mode - default true for performance */
  binary?: boolean;
  /** Request timeout in ms (default: 30000) */
  requestTimeout?: number;
}

/** Server info */
export interface ServerInfo {
  name: string;
  version: string;
  capabilities: ServerCapabilities;
}

/** Server capabilities */
export interface ServerCapabilities {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  logging: boolean;
}

/** Connected server info */
export interface ConnectedServer {
  id: string;
  name: string;
  url: string;
  status: ServerStatus;
  tools: number;
  resources: number;
}

/** Server status */
export type ServerStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Connection state */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Transport type */
export type Transport = 'stdio' | 'http' | 'websocket' | 'zap' | 'unix';

/** Log level */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============================================================================
// Event types
// ============================================================================

/** ZAP event names */
export type ZapEventName =
  | 'connect'
  | 'disconnect'
  | 'reconnect'
  | 'error'
  | 'message'
  | 'request'
  | 'response'
  | 'stream'
  | 'browser:connect'
  | 'browser:disconnect'
  | 'extension:connect'
  | 'extension:disconnect';

/** Event handler type */
export type ZapEventHandler<T = unknown> = (data: T) => void | Promise<void>;

/** Tool handler type */
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult> | ToolResult;

/** Browser handler type */
export type BrowserHandler = (params: BrowserParams) => Promise<BrowserResult> | BrowserResult;
