@0x8d8f7b5e9a3c2f1d;  # Unique file ID

# ZAP Protocol: MCP Superset for Agentic Operations
# Version: 1.0.0
#
# ZAP extends MCP (Model Context Protocol) with:
# - Direct browser extension <> MCP server communication
# - No serialization overhead - zero-copy wire format
# - Multi-client support (multiple browsers, multiple MCPs)
# - Streaming capabilities for real-time output

# Core envelope types

struct ZapRequest {
  id @0 :Text;
  method @1 :Text;

  params :union {
    none @2 :Void;
    toolCall @3 :ToolCallParams;
    browser @4 :BrowserParams;
    extension @5 :ExtensionParams;
    stream @6 :StreamParams;
    mcp @7 :McpParams;
  }

  metadata @8 :List(KeyValue);
}

struct ZapResponse {
  id @0 :Text;

  result :union {
    none @1 :Void;
    toolResult @2 :ToolResult;
    browserResult @3 :BrowserResult;
    extensionResult @4 :ExtensionResult;
    streamChunk @5 :StreamChunk;
    mcpResult @6 :McpResult;
    error @7 :ErrorResult;
  }

  metadata @8 :List(KeyValue);
}

struct ErrorResult {
  code @0 :Int32;
  message @1 :Text;
  data @2 :Data;
}

struct KeyValue {
  key @0 :Text;
  value @1 :Text;
}

# Tool execution (MCP compatible)

struct ToolCallParams {
  name @0 :Text;
  arguments @1 :List(Argument);
}

struct Argument {
  name @0 :Text;
  value @1 :Value;
}

struct Value {
  union {
    void @0 :Void;
    text @1 :Text;
    int64 @2 :Int64;
    float64 @3 :Float64;
    bool @4 :Bool;
    data @5 :Data;
    list @6 :List(Value);
    object @7 :List(KeyValue);
  }
}

struct ToolResult {
  success @0 :Bool;
  content @1 :List(ContentBlock);
  isError @2 :Bool;
}

struct ContentBlock {
  union {
    text @0 :TextContent;
    image @1 :ImageContent;
    binary @2 :Data;
  }
}

struct TextContent {
  text @0 :Text;
  mimeType @1 :Text;
}

struct ImageContent {
  data @0 :Data;
  mimeType @1 :Text;
  altText @2 :Text;
}

# Browser integration (direct extension <> MCP)

struct BrowserParams {
  action @0 :BrowserAction;
  contextId @1 :Text;
  pageId @2 :Text;

  # Action-specific params
  url @3 :Text;
  selector @4 :Text;
  code @5 :Text;
  expression @6 :Text;
  value @7 :Text;

  # Screenshot options
  fullPage @8 :Bool;
  format @9 :Text;
  quality @10 :Int32;

  # Tab targeting
  tabId @11 :Int32;
}

enum BrowserAction {
  none @0;

  # Navigation
  navigate @1;
  reload @2;
  back @3;
  forward @4;

  # DOM interaction
  click @10;
  type @11;
  fill @12;
  select @13;
  scroll @14;
  hover @15;

  # JavaScript execution
  evaluate @20;

  # Page management
  newPage @30;
  closePage @31;
  listPages @32;
  getActivePage @33;

  # Screenshots
  screenshot @40;

  # Tab control
  getTabs @50;
  setActiveTab @51;
  closeTab @52;
  newTab @53;

  # Storage & cookies
  getCookies @60;
  setCookie @61;
  clearCookies @62;
  getStorage @63;
  setStorage @64;

  # Status
  status @70;
  ping @71;
}

struct BrowserResult {
  success @0 :Bool;
  pageId @1 :Text;
  contextId @2 :Text;

  union {
    none @3 :Void;
    evaluateResult @4 :EvaluateResult;
    screenshot @5 :Data;
    pages @6 :List(PageInfo);
    tabs @7 :List(TabInfo);
    cookies @8 :List(Cookie);
    storage @9 :List(KeyValue);
    status @10 :BrowserStatus;
  }
}

struct EvaluateResult {
  type @0 :Text;
  value @1 :Text;
  preview @2 :Text;
}

struct PageInfo {
  pageId @0 :Text;
  contextId @1 :Text;
  url @2 :Text;
  title @3 :Text;
}

struct TabInfo {
  tabId @0 :Int32;
  url @1 :Text;
  title @2 :Text;
  active @3 :Bool;
  windowId @4 :Int32;
}

struct Cookie {
  name @0 :Text;
  value @1 :Text;
  domain @2 :Text;
  path @3 :Text;
  expires @4 :Int64;
  httpOnly @5 :Bool;
  secure @6 :Bool;
  sameSite @7 :Text;
}

struct BrowserStatus {
  connected @0 :Bool;
  browser @1 :Text;
  version @2 :Text;
  extensionId @3 :Text;
  capabilities @4 :List(Text);
}

# Extension messaging (multi-browser, multi-MCP)

struct ExtensionParams {
  extensionId @0 :Text;
  action @1 :ExtensionAction;
  channel @2 :Text;
  payload @3 :Data;

  # For registration
  browser @4 :Text;
  version @5 :Text;
  capabilities @6 :List(Text);

  # For targeting specific MCP
  mcpId @7 :Text;
}

enum ExtensionAction {
  none @0;
  register @1;
  unregister @2;
  send @3;
  broadcast @4;
  subscribe @5;
  unsubscribe @6;
  list @7;
  ping @8;
  listMcps @9;
  connectMcp @10;
  disconnectMcp @11;
}

struct ExtensionResult {
  success @0 :Bool;
  extensionId @1 :Text;
  payload @2 :Data;
  extensions @3 :List(ExtensionInfo);
  mcps @4 :List(McpInfo);
}

struct ExtensionInfo {
  id @0 :Text;
  browser @1 :Text;
  version @2 :Text;
  capabilities @3 :List(Text);
  connected @4 :Bool;
  lastActive @5 :Int64;
}

struct McpInfo {
  id @0 :Text;
  name @1 :Text;
  url @2 :Text;
  connected @3 :Bool;
  tools @4 :List(ToolInfo);
}

struct ToolInfo {
  name @0 :Text;
  description @1 :Text;
  inputSchema @2 :Text;  # JSON schema as text
}

# MCP native passthrough

struct McpParams {
  method @0 :Text;
  params @1 :Data;  # JSON-encoded MCP params
}

struct McpResult {
  result @0 :Data;  # JSON-encoded MCP result
}

# Streaming

struct StreamParams {
  action @0 :StreamAction;
  streamId @1 :Text;
  streamType @2 :StreamType;
  filters @3 :List(KeyValue);
}

enum StreamAction {
  none @0;
  start @1;
  stop @2;
  pause @3;
  resume @4;
}

enum StreamType {
  none @0;
  consoleMessages @1;
  networkEvents @2;
  domChanges @3;
  storage @4;
}

struct StreamChunk {
  streamId @0 :Text;
  sequence @1 :Int64;
  timestamp @2 :Int64;

  data :union {
    none @3 :Void;
    consoleMessage @4 :ConsoleMessage;
    networkEvent @5 :NetworkEvent;
    raw @6 :Data;
  }
}

struct ConsoleMessage {
  level @0 :ConsoleLevel;
  text @1 :Text;
  url @2 :Text;
  line @3 :Int32;
  column @4 :Int32;
  timestamp @5 :Int64;
}

enum ConsoleLevel {
  log @0;
  debug @1;
  info @2;
  warn @3;
  error @4;
}

struct NetworkEvent {
  type @0 :NetworkEventType;
  requestId @1 :Text;
  url @2 :Text;
  method @3 :Text;
  status @4 :Int32;
  headers @5 :List(KeyValue);
  body @6 :Data;
  timestamp @7 :Int64;
}

enum NetworkEventType {
  request @0;
  response @1;
  failed @2;
}

# Connection handshake

struct Handshake {
  version @0 :Text;
  clientType @1 :ClientType;
  clientId @2 :Text;
  capabilities @3 :List(Text);
  metadata @4 :List(KeyValue);
}

enum ClientType {
  unknown @0;
  browserExtension @1;
  mcpServer @2;
  mcpClient @3;
  agent @4;
}

struct HandshakeResponse {
  accepted @0 :Bool;
  clientId @1 :Text;  # Assigned or confirmed ID
  serverVersion @2 :Text;
  capabilities @3 :List(Text);
  error @4 :Text;
}
