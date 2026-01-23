import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Examples',
  description: 'ZAP TypeScript code examples and patterns',
}

export default function ExamplesPage() {
  return (
    <>
      <h1>Examples</h1>
      <p>
        This page provides practical examples for common ZAP use cases.
      </p>

      <h2>Basic Client Connection</h2>
      <pre><code>{`import { Client, ZapError } from '@zap-protocol/zap'

async function basicExample() {
  const client = await Client.connect('zap://localhost:9999')

  try {
    // List available tools
    const tools = await client.listTools()
    console.log('Available tools:', tools.map(t => t.name))

    // List available resources
    const resources = await client.listResources()
    console.log('Available resources:', resources.map(r => r.uri))
  } catch (error) {
    if (error instanceof ZapError) {
      console.error(\`ZAP Error [\${error.code}]: \${error.message}\`)
    } else {
      throw error
    }
  } finally {
    await client.close()
  }
}

basicExample()`}</code></pre>

      <h2>Tool Invocation with Error Handling</h2>
      <pre><code>{`import {
  Client,
  ToolNotFoundError,
  InvalidArgumentError,
  TimeoutError
} from '@zap-protocol/zap'

async function searchWithRetry(
  client: Client,
  query: string,
  maxRetries = 3
): Promise<unknown> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.callTool('search', {
        query,
        limit: 10,
        offset: 0
      })
    } catch (error) {
      if (error instanceof TimeoutError && attempt < maxRetries) {
        console.log(\`Attempt \${attempt} timed out, retrying...\`)
        continue
      }

      if (error instanceof ToolNotFoundError) {
        throw new Error('Search tool is not available')
      }

      if (error instanceof InvalidArgumentError) {
        throw new Error(\`Invalid search query: \${error.details?.reason}\`)
      }

      throw error
    }
  }

  throw new Error('Max retries exceeded')
}

// Usage
const client = await Client.connect('zap://localhost:9999')
const results = await searchWithRetry(client, 'typescript examples')
console.log('Search results:', results)
await client.close()`}</code></pre>

      <h2>Gateway with Multiple Servers</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

async function multiServerGateway() {
  const gateway = new Gateway({
    port: 9999,
    logLevel: 'info'
  })

  await gateway.start()

  // Connect to HTTP-based MCP server
  const httpServerId = await gateway.connectServer({
    name: 'web-api',
    url: 'http://localhost:3000/mcp',
    transport: 'http'
  })

  // Connect to WebSocket-based MCP server
  const wsServerId = await gateway.connectServer({
    name: 'realtime-api',
    url: 'ws://localhost:3001/mcp',
    transport: 'websocket'
  })

  // Connect to local process via stdio
  const stdioServerId = await gateway.connectServer({
    name: 'local-agent',
    url: 'stdio://',
    transport: 'stdio',
    command: 'python',
    args: ['-m', 'my_mcp_agent']
  })

  // List all connected servers
  const servers = gateway.listServers()
  for (const server of servers) {
    console.log(\`\${server.name}: \${server.status}\`)
  }

  // List all available tools across servers
  const tools = await gateway.listTools()
  console.log(\`Total tools: \${tools.length}\`)

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await gateway.stop()
    process.exit(0)
  })
}

multiServerGateway()`}</code></pre>

      <h2>Resource Reading</h2>
      <pre><code>{`import { Client } from '@zap-protocol/zap'

interface ConfigFile {
  apiUrl: string
  debug: boolean
  maxConnections: number
}

async function readConfigResource(client: Client): Promise<ConfigFile> {
  // List available resources
  const resources = await client.listResources()

  const configResource = resources.find(r =>
    r.uri.endsWith('config.json')
  )

  if (!configResource) {
    throw new Error('Config resource not found')
  }

  // Read the resource content
  const content = await client.readResource(configResource.uri)

  if (typeof content.content !== 'string') {
    throw new Error('Expected string content')
  }

  return JSON.parse(content.content) as ConfigFile
}

// Usage
const client = await Client.connect('zap://localhost:9999')
const config = await readConfigResource(client)
console.log('Config:', config)
await client.close()`}</code></pre>

      <h2>Identity and DID Operations</h2>
      <pre><code>{`import {
  parseDid,
  didUri,
  createDidFromWeb,
  generateDocument,
  NodeIdentity,
  generateIdentity,
  InMemoryStakeRegistry,
  DidMethod
} from '@zap-protocol/zap'

// Parse an existing DID
const did = parseDid('did:lux:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')
console.log('Method:', did.method)
console.log('ID:', did.id)
console.log('URI:', didUri(did))

// Generate DID document
const document = generateDocument(did)
console.log('DID Document:', JSON.stringify(document, null, 2))

// Create a web DID
const webDid = createDidFromWeb('example.com', 'agents/assistant')
console.log('Web DID:', didUri(webDid))

// Work with stake registry
const registry = new InMemoryStakeRegistry()
await registry.setStake(did, BigInt(1000))
const stake = await registry.getStake(did)
const weight = await registry.stakeWeight(did)
console.log(\`Stake: \${stake}, Weight: \${weight}\`)`}</code></pre>

      <h2>Connection Pool Pattern</h2>
      <pre><code>{`import { Client } from '@zap-protocol/zap'

class ConnectionPool {
  private connections: Client[] = []
  private available: Client[] = []
  private url: string
  private maxSize: number

  constructor(url: string, maxSize = 10) {
    this.url = url
    this.maxSize = maxSize
  }

  async acquire(): Promise<Client> {
    // Return available connection
    if (this.available.length > 0) {
      return this.available.pop()!
    }

    // Create new connection if pool not full
    if (this.connections.length < this.maxSize) {
      const client = await Client.connect(this.url)
      this.connections.push(client)
      return client
    }

    // Wait for available connection
    return new Promise((resolve) => {
      const check = () => {
        if (this.available.length > 0) {
          resolve(this.available.pop()!)
        } else {
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  release(client: Client): void {
    this.available.push(client)
  }

  async close(): Promise<void> {
    await Promise.all(this.connections.map(c => c.close()))
    this.connections = []
    this.available = []
  }
}

// Usage
const pool = new ConnectionPool('zap://localhost:9999', 5)

async function doWork() {
  const client = await pool.acquire()
  try {
    return await client.callTool('work', {})
  } finally {
    pool.release(client)
  }
}

// Run multiple operations concurrently
await Promise.all([
  doWork(),
  doWork(),
  doWork()
])

await pool.close()`}</code></pre>

      <h2>Event-Driven Pattern</h2>
      <pre><code>{`import { EventEmitter } from 'node:events'
import { Client, Tool, Resource, ZapError } from '@zap-protocol/zap'

class ZapEventClient extends EventEmitter {
  private client: Client | null = null
  private url: string

  constructor(url: string) {
    super()
    this.url = url
  }

  async connect(): Promise<void> {
    try {
      this.client = await Client.connect(this.url)
      this.emit('connected')

      const tools = await this.client.listTools()
      this.emit('tools', tools)

      const resources = await this.client.listResources()
      this.emit('resources', resources)
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected')
    }

    try {
      this.emit('toolStart', name, args)
      const result = await this.client.callTool(name, args)
      this.emit('toolComplete', name, result)
    } catch (error) {
      this.emit('toolError', name, error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
      this.emit('disconnected')
    }
  }
}

// Usage
const eventClient = new ZapEventClient('zap://localhost:9999')

eventClient.on('connected', () => console.log('Connected'))
eventClient.on('tools', (tools: Tool[]) => console.log(\`Found \${tools.length} tools\`))
eventClient.on('toolStart', (name: string) => console.log(\`Calling \${name}...\`))
eventClient.on('toolComplete', (name: string, result: unknown) => {
  console.log(\`\${name} completed:\`, result)
})
eventClient.on('error', (error: unknown) => console.error('Error:', error))

await eventClient.connect()
await eventClient.callTool('search', { query: 'test' })
await eventClient.disconnect()`}</code></pre>

      <h2>Batch Operations</h2>
      <pre><code>{`import { Client, Tool } from '@zap-protocol/zap'

interface BatchResult<T> {
  success: boolean
  toolName: string
  result?: T
  error?: Error
}

async function batchCallTools<T>(
  client: Client,
  calls: Array<{ name: string; args: Record<string, unknown> }>
): Promise<BatchResult<T>[]> {
  const promises = calls.map(async ({ name, args }): Promise<BatchResult<T>> => {
    try {
      const result = await client.callTool(name, args)
      return { success: true, toolName: name, result: result as T }
    } catch (error) {
      return {
        success: false,
        toolName: name,
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  })

  return Promise.all(promises)
}

// Usage
const client = await Client.connect('zap://localhost:9999')

const results = await batchCallTools(client, [
  { name: 'search', args: { query: 'typescript' } },
  { name: 'search', args: { query: 'javascript' } },
  { name: 'analyze', args: { text: 'Hello world' } }
])

for (const result of results) {
  if (result.success) {
    console.log(\`\${result.toolName}: \${JSON.stringify(result.result)}\`)
  } else {
    console.error(\`\${result.toolName} failed: \${result.error?.message}\`)
  }
}

await client.close()`}</code></pre>

      <h2>CLI Application</h2>
      <pre><code>{`#!/usr/bin/env node
import { Client, Gateway, ZapError } from '@zap-protocol/zap'

const args = process.argv.slice(2)
const command = args[0]

async function main() {
  switch (command) {
    case 'list-tools': {
      const url = args[1] || 'zap://localhost:9999'
      const client = await Client.connect(url)
      const tools = await client.listTools()

      console.log('Available tools:')
      for (const tool of tools) {
        console.log(\`  \${tool.name}: \${tool.description}\`)
      }

      await client.close()
      break
    }

    case 'call': {
      const url = args[1] || 'zap://localhost:9999'
      const toolName = args[2]
      const toolArgs = JSON.parse(args[3] || '{}')

      if (!toolName) {
        console.error('Usage: zap-cli call <url> <tool-name> [args-json]')
        process.exit(1)
      }

      const client = await Client.connect(url)
      const result = await client.callTool(toolName, toolArgs)
      console.log(JSON.stringify(result, null, 2))
      await client.close()
      break
    }

    case 'serve': {
      const port = parseInt(args[1] || '9999')

      const gateway = new Gateway({
        port,
        logLevel: 'info'
      })

      process.on('SIGINT', async () => {
        await gateway.stop()
        process.exit(0)
      })

      await gateway.start()
      console.log(\`Gateway running on port \${port}\`)
      break
    }

    default:
      console.log('ZAP CLI')
      console.log('')
      console.log('Commands:')
      console.log('  list-tools [url]              List available tools')
      console.log('  call <url> <tool> [args]      Call a tool')
      console.log('  serve [port]                  Start gateway server')
  }
}

main().catch(error => {
  if (error instanceof ZapError) {
    console.error(\`Error [\${error.code}]: \${error.message}\`)
  } else {
    console.error(error)
  }
  process.exit(1)
})`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/client/">Client API</a> - Full client reference</li>
        <li><a href="/docs/gateway/">Gateway</a> - Gateway reference</li>
        <li><a href="/docs/browser/">Browser Usage</a> - Browser patterns</li>
        <li><a href="/docs/nodejs/">Node.js Usage</a> - Node.js patterns</li>
      </ul>
    </>
  )
}
