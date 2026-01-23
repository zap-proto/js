import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'TypeScript Types',
  description: 'Complete TypeScript type definitions for ZAP',
}

export default function TypesPage() {
  return (
    <>
      <h1>TypeScript Types</h1>
      <p>
        ZAP provides comprehensive TypeScript type definitions for all APIs.
        This page documents the core types used throughout the library.
      </p>

      <h2>Import</h2>
      <pre><code>{`import type {
  Tool,
  Resource,
  ResourceContent,
  Prompt,
  PromptArgument,
  PromptMessage,
  TextContent,
  ImageContent,
  ServerInfo,
  ServerCapabilities,
  ConnectedServer,
  ServerStatus,
  Transport,
  LogLevel
} from '@zap-protocol/zap'`}</code></pre>

      <h2>Tool Types</h2>

      <h3>Tool</h3>
      <p>Represents a callable tool on a server.</p>
      <pre><code>{`interface Tool {
  name: string
  description: string
  schema: Record<string, unknown>  // JSON Schema
}`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const tool: Tool = {
  name: 'search',
  description: 'Search for content',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', default: 10 }
    },
    required: ['query']
  }
}`}</code></pre>

      <h2>Resource Types</h2>

      <h3>Resource</h3>
      <p>Represents a readable resource on a server.</p>
      <pre><code>{`interface Resource {
  uri: string
  name: string
  description: string
  mimeType: string
}`}</code></pre>

      <h3>ResourceContent</h3>
      <p>Content returned when reading a resource.</p>
      <pre><code>{`interface ResourceContent {
  uri: string
  mimeType: string
  content: string | Uint8Array
}`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const resource: Resource = {
  uri: 'file:///config.json',
  name: 'Configuration',
  description: 'Application configuration file',
  mimeType: 'application/json'
}

const content: ResourceContent = {
  uri: 'file:///config.json',
  mimeType: 'application/json',
  content: '{"debug": true}'
}`}</code></pre>

      <h2>Prompt Types</h2>

      <h3>Prompt</h3>
      <p>Represents a prompt template.</p>
      <pre><code>{`interface Prompt {
  name: string
  description: string
  arguments: PromptArgument[]
}`}</code></pre>

      <h3>PromptArgument</h3>
      <p>Argument definition for a prompt.</p>
      <pre><code>{`interface PromptArgument {
  name: string
  description: string
  required: boolean
}`}</code></pre>

      <h3>PromptMessage</h3>
      <p>Message in a prompt conversation.</p>
      <pre><code>{`interface PromptMessage {
  role: 'user' | 'assistant' | 'system'
  content: TextContent | ImageContent | ResourceContent
}`}</code></pre>

      <h2>Content Types</h2>

      <h3>TextContent</h3>
      <p>Plain text content.</p>
      <pre><code>{`interface TextContent {
  type: 'text'
  text: string
}`}</code></pre>

      <h3>ImageContent</h3>
      <p>Binary image content.</p>
      <pre><code>{`interface ImageContent {
  type: 'image'
  data: Uint8Array
  mimeType: string
}`}</code></pre>

      <h2>Server Types</h2>

      <h3>ServerInfo</h3>
      <p>Information about a server.</p>
      <pre><code>{`interface ServerInfo {
  name: string
  version: string
  capabilities: ServerCapabilities
}`}</code></pre>

      <h3>ServerCapabilities</h3>
      <p>Capabilities supported by a server.</p>
      <pre><code>{`interface ServerCapabilities {
  tools: boolean
  resources: boolean
  prompts: boolean
  logging: boolean
}`}</code></pre>

      <h3>ConnectedServer</h3>
      <p>Information about a connected server in the gateway.</p>
      <pre><code>{`interface ConnectedServer {
  id: string
  name: string
  url: string
  status: ServerStatus
  tools: number
  resources: number
}`}</code></pre>

      <h3>ServerStatus</h3>
      <p>Connection status of a server.</p>
      <pre><code>{`type ServerStatus = 'connecting' | 'connected' | 'disconnected' | 'error'`}</code></pre>

      <h2>Configuration Types</h2>

      <h3>Transport</h3>
      <p>Supported transport protocols.</p>
      <pre><code>{`type Transport = 'stdio' | 'http' | 'websocket' | 'zap' | 'unix'`}</code></pre>

      <h3>LogLevel</h3>
      <p>Logging verbosity levels.</p>
      <pre><code>{`type LogLevel = 'debug' | 'info' | 'warn' | 'error'`}</code></pre>

      <h2>Type Guards</h2>
      <p>
        You can use type guards to narrow content types:
      </p>
      <pre><code>{`function isTextContent(content: unknown): content is TextContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'text'
  )
}

function isImageContent(content: unknown): content is ImageContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    'type' in content &&
    content.type === 'image'
  )
}

// Usage
const message: PromptMessage = await getPromptMessage()
if (isTextContent(message.content)) {
  console.log('Text:', message.content.text)
} else if (isImageContent(message.content)) {
  console.log('Image size:', message.content.data.length)
}`}</code></pre>

      <h2>Generic Patterns</h2>
      <p>
        Common patterns for working with ZAP types:
      </p>

      <h3>Tool Result Typing</h3>
      <pre><code>{`interface SearchResult {
  items: Array<{ title: string; url: string }>
  total: number
}

async function search(client: Client, query: string): Promise<SearchResult> {
  const result = await client.callTool('search', { query })
  return result as SearchResult
}`}</code></pre>

      <h3>Resource Content Typing</h3>
      <pre><code>{`interface ConfigFile {
  debug: boolean
  apiUrl: string
}

async function readConfig(client: Client): Promise<ConfigFile> {
  const content = await client.readResource('file:///config.json')
  if (typeof content.content !== 'string') {
    throw new Error('Expected string content')
  }
  return JSON.parse(content.content) as ConfigFile
}`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/client/">Client API</a> - Using types with the client</li>
        <li><a href="/docs/gateway/">Gateway</a> - Server configuration types</li>
        <li><a href="/docs/errors/">Error Handling</a> - Error type definitions</li>
      </ul>
    </>
  )
}
