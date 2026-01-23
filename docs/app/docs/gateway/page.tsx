import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gateway',
  description: 'ZAP Gateway for aggregating multiple MCP servers',
}

export default function GatewayPage() {
  return (
    <>
      <h1>Gateway</h1>
      <p>
        The <code>Gateway</code> class aggregates multiple MCP servers into a single ZAP endpoint,
        allowing clients to access tools and resources from multiple sources through one connection.
      </p>

      <h2>Import</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'`}</code></pre>

      <h2>Constructor</h2>
      <pre><code>{`new Gateway(config?: Partial<Config>)`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const gateway = new Gateway({
  listen: '0.0.0.0',
  port: 9999,
  logLevel: 'info'
})`}</code></pre>

      <h2>Configuration</h2>
      <p>
        The gateway accepts the following configuration options:
      </p>
      <table>
        <thead>
          <tr>
            <th>Option</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>listen</code></td>
            <td><code>string</code></td>
            <td><code>&quot;0.0.0.0&quot;</code></td>
            <td>Address to listen on</td>
          </tr>
          <tr>
            <td><code>port</code></td>
            <td><code>number</code></td>
            <td><code>9999</code></td>
            <td>Port to listen on</td>
          </tr>
          <tr>
            <td><code>servers</code></td>
            <td><code>ServerConfig[]</code></td>
            <td><code>[]</code></td>
            <td>Initial servers to connect</td>
          </tr>
          <tr>
            <td><code>logLevel</code></td>
            <td><code>LogLevel</code></td>
            <td><code>&quot;info&quot;</code></td>
            <td>Logging verbosity</td>
          </tr>
          <tr>
            <td><code>tlsCert</code></td>
            <td><code>string</code></td>
            <td>-</td>
            <td>Path to TLS certificate</td>
          </tr>
          <tr>
            <td><code>tlsKey</code></td>
            <td><code>string</code></td>
            <td>-</td>
            <td>Path to TLS private key</td>
          </tr>
          <tr>
            <td><code>maxConnections</code></td>
            <td><code>number</code></td>
            <td><code>1000</code></td>
            <td>Maximum client connections</td>
          </tr>
          <tr>
            <td><code>connectionTimeout</code></td>
            <td><code>number</code></td>
            <td><code>30000</code></td>
            <td>Connection timeout (ms)</td>
          </tr>
          <tr>
            <td><code>requestTimeout</code></td>
            <td><code>number</code></td>
            <td><code>60000</code></td>
            <td>Request timeout (ms)</td>
          </tr>
        </tbody>
      </table>

      <h2>Lifecycle Methods</h2>

      <h3>start()</h3>
      <p>
        Start the gateway and connect to configured servers.
      </p>
      <pre><code>{`async start(): Promise<void>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`await gateway.start()
console.log('Gateway is running')`}</code></pre>

      <h3>stop()</h3>
      <p>
        Stop the gateway and disconnect all servers.
      </p>
      <pre><code>{`async stop(): Promise<void>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`await gateway.stop()
console.log('Gateway stopped')`}</code></pre>

      <h3>isRunning()</h3>
      <p>
        Check if the gateway is currently running.
      </p>
      <pre><code>{`isRunning(): boolean`}</code></pre>

      <h2>Server Management</h2>

      <h3>connectServer(config)</h3>
      <p>
        Connect to an MCP server dynamically.
      </p>
      <pre><code>{`async connectServer(config: ServerConfig): Promise<string>`}</code></pre>

      <p><strong>Returns:</strong> Server ID (UUID)</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const serverId = await gateway.connectServer({
  name: 'my-mcp-server',
  url: 'http://localhost:3000',
  transport: 'http'
})
console.log('Connected server:', serverId)`}</code></pre>

      <h3>disconnectServer(id)</h3>
      <p>
        Disconnect from a server by ID.
      </p>
      <pre><code>{`async disconnectServer(id: string): Promise<void>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`await gateway.disconnectServer(serverId)`}</code></pre>

      <h3>listServers()</h3>
      <p>
        List all connected servers.
      </p>
      <pre><code>{`listServers(): ConnectedServer[]`}</code></pre>

      <p><strong>Returns:</strong> Array of connected server info</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const servers = gateway.listServers()
for (const server of servers) {
  console.log(\`\${server.name}: \${server.status}\`)
  console.log(\`  Tools: \${server.tools}, Resources: \${server.resources}\`)
}`}</code></pre>

      <h3>getServer(id)</h3>
      <p>
        Get a specific server by ID.
      </p>
      <pre><code>{`getServer(id: string): ConnectedServer | undefined`}</code></pre>

      <h2>Tool Operations</h2>

      <h3>listTools()</h3>
      <p>
        List all tools from all connected servers.
      </p>
      <pre><code>{`async listTools(): Promise<Tool[]>`}</code></pre>

      <h3>callTool(serverId, name, args)</h3>
      <p>
        Call a tool on a specific server.
      </p>
      <pre><code>{`async callTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const result = await gateway.callTool(
  serverId,
  'search',
  { query: 'hello' }
)`}</code></pre>

      <h2>Resource Operations</h2>

      <h3>listResources()</h3>
      <p>
        List all resources from all connected servers.
      </p>
      <pre><code>{`async listResources(): Promise<Resource[]>`}</code></pre>

      <h3>readResource(serverId, uri)</h3>
      <p>
        Read a resource from a specific server.
      </p>
      <pre><code>{`async readResource(
  serverId: string,
  uri: string
): Promise<unknown>`}</code></pre>

      <h2>Server Configuration</h2>
      <p>
        The <code>ServerConfig</code> interface defines how to connect to an MCP server:
      </p>
      <pre><code>{`interface ServerConfig {
  name: string           // Display name
  url: string            // Server URL
  transport: Transport   // 'stdio' | 'http' | 'websocket' | 'zap' | 'unix'
  command?: string       // Command for stdio transport
  args?: string[]        // Arguments for stdio transport
  env?: Record<string, string>  // Environment variables
}`}</code></pre>

      <h3>HTTP Transport</h3>
      <pre><code>{`await gateway.connectServer({
  name: 'http-server',
  url: 'http://localhost:3000/mcp',
  transport: 'http'
})`}</code></pre>

      <h3>WebSocket Transport</h3>
      <pre><code>{`await gateway.connectServer({
  name: 'ws-server',
  url: 'ws://localhost:3000/mcp',
  transport: 'websocket'
})`}</code></pre>

      <h3>Stdio Transport</h3>
      <pre><code>{`await gateway.connectServer({
  name: 'stdio-server',
  url: 'stdio://',
  transport: 'stdio',
  command: 'node',
  args: ['./mcp-server.js'],
  env: { DEBUG: 'true' }
})`}</code></pre>

      <h3>ZAP Transport</h3>
      <pre><code>{`await gateway.connectServer({
  name: 'zap-server',
  url: 'zap://localhost:9998',
  transport: 'zap'
})`}</code></pre>

      <h2>Complete Example</h2>
      <pre><code>{`import { Gateway, DEFAULT_CONFIG } from '@zap-protocol/zap'

async function main() {
  // Create gateway with initial configuration
  const gateway = new Gateway({
    port: 9999,
    logLevel: 'info',
    servers: [
      {
        name: 'file-server',
        url: 'http://localhost:3001',
        transport: 'http'
      }
    ]
  })

  // Start gateway
  await gateway.start()
  console.log('Gateway running on port 9999')

  // Add another server dynamically
  const searchId = await gateway.connectServer({
    name: 'search-server',
    url: 'http://localhost:3002',
    transport: 'http'
  })

  // List all connected servers
  const servers = gateway.listServers()
  console.log(\`Connected to \${servers.length} servers\`)

  // List all tools
  const tools = await gateway.listTools()
  console.log(\`Total tools: \${tools.length}\`)

  // Handle shutdown
  process.on('SIGINT', async () => {
    await gateway.stop()
    process.exit(0)
  })
}

main().catch(console.error)`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/config/">Configuration</a> - Full configuration reference</li>
        <li><a href="/docs/client/">Client API</a> - Connect to the gateway</li>
        <li><a href="/docs/types/">TypeScript Types</a> - Type definitions</li>
      </ul>
    </>
  )
}
