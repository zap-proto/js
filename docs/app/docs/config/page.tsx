import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Configuration',
  description: 'ZAP configuration options and environment variables',
}

export default function ConfigPage() {
  return (
    <>
      <h1>Configuration</h1>
      <p>
        ZAP provides flexible configuration through code, environment variables,
        and configuration files.
      </p>

      <h2>Import</h2>
      <pre><code>{`import {
  DEFAULT_CONFIG,
  loadConfigFromEnv,
  mergeConfig
} from '@zap-protocol/zap'
import type { Config, ServerConfig } from '@zap-protocol/zap'`}</code></pre>

      <h2>Config Interface</h2>
      <pre><code>{`interface Config {
  listen: string           // Listen address (default: "0.0.0.0")
  port: number             // Listen port (default: 9999)
  servers: ServerConfig[]  // Upstream servers
  logLevel: LogLevel       // Log verbosity (default: "info")
  tlsCert?: string         // TLS certificate path
  tlsKey?: string          // TLS private key path
  maxConnections?: number  // Max connections (default: 1000)
  connectionTimeout?: number  // Connection timeout ms (default: 30000)
  requestTimeout?: number     // Request timeout ms (default: 60000)
}`}</code></pre>

      <h2>ServerConfig Interface</h2>
      <pre><code>{`interface ServerConfig {
  name: string             // Display name
  url: string              // Server URL
  transport: Transport     // Transport protocol
  command?: string         // Command for stdio transport
  args?: string[]          // Arguments for stdio
  env?: Record<string, string>  // Environment variables
}`}</code></pre>

      <h2>Default Configuration</h2>
      <p>
        The <code>DEFAULT_CONFIG</code> export provides sensible defaults:
      </p>
      <pre><code>{`const DEFAULT_CONFIG: Config = {
  listen: '0.0.0.0',
  port: 9999,
  servers: [],
  logLevel: 'info',
  maxConnections: 1000,
  connectionTimeout: 30000,
  requestTimeout: 60000
}`}</code></pre>

      <h2>Environment Variables</h2>
      <p>
        Use <code>loadConfigFromEnv()</code> to load configuration from environment variables:
      </p>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Config Option</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>ZAP_LISTEN</code></td>
            <td><code>listen</code></td>
            <td><code>0.0.0.0</code></td>
          </tr>
          <tr>
            <td><code>ZAP_PORT</code></td>
            <td><code>port</code></td>
            <td><code>9999</code></td>
          </tr>
          <tr>
            <td><code>ZAP_LOG_LEVEL</code></td>
            <td><code>logLevel</code></td>
            <td><code>debug</code></td>
          </tr>
          <tr>
            <td><code>ZAP_TLS_CERT</code></td>
            <td><code>tlsCert</code></td>
            <td><code>/path/to/cert.pem</code></td>
          </tr>
          <tr>
            <td><code>ZAP_TLS_KEY</code></td>
            <td><code>tlsKey</code></td>
            <td><code>/path/to/key.pem</code></td>
          </tr>
          <tr>
            <td><code>ZAP_MAX_CONNECTIONS</code></td>
            <td><code>maxConnections</code></td>
            <td><code>5000</code></td>
          </tr>
        </tbody>
      </table>

      <p><strong>Example:</strong></p>
      <pre><code>{`import { loadConfigFromEnv, mergeConfig, Gateway } from '@zap-protocol/zap'

// Load from environment
const envConfig = loadConfigFromEnv()

// Merge with custom config
const config = mergeConfig(envConfig, {
  servers: [
    { name: 'api', url: 'http://localhost:3000', transport: 'http' }
  ]
})

const gateway = new Gateway(config)`}</code></pre>

      <h2>Merging Configurations</h2>
      <p>
        Use <code>mergeConfig()</code> to combine multiple configuration sources:
      </p>
      <pre><code>{`import { mergeConfig, DEFAULT_CONFIG } from '@zap-protocol/zap'

// Configuration precedence: later configs override earlier ones
const config = mergeConfig(
  DEFAULT_CONFIG,           // Base defaults
  loadConfigFromEnv(),      // Environment overrides
  { port: 8080 },           // Code overrides
  productionConfig          // Environment-specific
)`}</code></pre>

      <h2>Configuration Examples</h2>

      <h3>Development</h3>
      <pre><code>{`const devConfig: Partial<Config> = {
  listen: 'localhost',
  port: 9999,
  logLevel: 'debug',
  connectionTimeout: 60000,
  requestTimeout: 120000
}`}</code></pre>

      <h3>Production</h3>
      <pre><code>{`const prodConfig: Partial<Config> = {
  listen: '0.0.0.0',
  port: 443,
  logLevel: 'warn',
  tlsCert: '/etc/ssl/certs/zap.pem',
  tlsKey: '/etc/ssl/private/zap.key',
  maxConnections: 10000,
  connectionTimeout: 10000,
  requestTimeout: 30000
}`}</code></pre>

      <h3>With Multiple Servers</h3>
      <pre><code>{`const config: Config = {
  listen: '0.0.0.0',
  port: 9999,
  logLevel: 'info',
  servers: [
    {
      name: 'search',
      url: 'http://search-service:3000',
      transport: 'http'
    },
    {
      name: 'files',
      url: 'http://file-service:3001',
      transport: 'http'
    },
    {
      name: 'local-agent',
      url: 'stdio://',
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'mcp_agent'],
      env: { PYTHONUNBUFFERED: '1' }
    }
  ]
}`}</code></pre>

      <h2>Transport Configuration</h2>

      <h3>HTTP Transport</h3>
      <pre><code>{`{
  name: 'http-server',
  url: 'http://localhost:3000/mcp',
  transport: 'http'
}`}</code></pre>

      <h3>WebSocket Transport</h3>
      <pre><code>{`{
  name: 'ws-server',
  url: 'ws://localhost:3000/mcp',
  transport: 'websocket'
}`}</code></pre>

      <h3>Unix Socket Transport</h3>
      <pre><code>{`{
  name: 'unix-server',
  url: 'unix:///var/run/mcp.sock',
  transport: 'unix'
}`}</code></pre>

      <h3>Stdio Transport</h3>
      <pre><code>{`{
  name: 'stdio-server',
  url: 'stdio://',
  transport: 'stdio',
  command: 'node',
  args: ['./server.js', '--mode', 'mcp'],
  env: {
    NODE_ENV: 'production',
    DEBUG: 'mcp:*'
  }
}`}</code></pre>

      <h3>ZAP Transport</h3>
      <pre><code>{`{
  name: 'zap-server',
  url: 'zap://upstream.example.com:9999',
  transport: 'zap'
}`}</code></pre>

      <h2>Validation</h2>
      <p>
        Configuration is validated at runtime. Invalid configurations throw errors:
      </p>
      <pre><code>{`import { Gateway, ZapError } from '@zap-protocol/zap'

try {
  const gateway = new Gateway({
    port: -1  // Invalid port
  })
  await gateway.start()
} catch (error) {
  if (error instanceof ZapError) {
    console.error('Invalid config:', error.message)
  }
}`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/gateway/">Gateway</a> - Using configuration with Gateway</li>
        <li><a href="/docs/server/">Server</a> - Using configuration with Server</li>
        <li><a href="/docs/types/">TypeScript Types</a> - Type definitions</li>
      </ul>
    </>
  )
}
