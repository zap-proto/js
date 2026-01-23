import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Server',
  description: 'ZAP Server API for creating ZAP servers',
}

export default function ServerPage() {
  return (
    <>
      <h1>Server</h1>
      <p>
        The <code>Server</code> class allows you to create a ZAP server that exposes
        tools and resources to clients.
      </p>

      <h2>Import</h2>
      <pre><code>{`import { Server } from '@zap-protocol/zap'`}</code></pre>

      <h2>Constructor</h2>
      <pre><code>{`new Server(config?: Partial<Config>)`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const server = new Server({
  listen: '0.0.0.0',
  port: 9999,
  logLevel: 'info'
})`}</code></pre>

      <h2>Methods</h2>

      <h3>run()</h3>
      <p>
        Start the server and begin accepting connections. This method blocks until
        the server is stopped.
      </p>
      <pre><code>{`async run(): Promise<void>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`const server = new Server({ port: 9999 })
await server.run()
// Server runs until process is terminated`}</code></pre>

      <h2>Configuration</h2>
      <p>
        The server accepts the same configuration options as the Gateway:
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
        </tbody>
      </table>

      <h2>Basic Example</h2>
      <pre><code>{`import { Server } from '@zap-protocol/zap'

const server = new Server({
  listen: '0.0.0.0',
  port: 9999,
  logLevel: 'info'
})

console.log('Starting ZAP server...')
await server.run()`}</code></pre>

      <h2>With TLS</h2>
      <pre><code>{`import { Server } from '@zap-protocol/zap'

const server = new Server({
  port: 9999,
  tlsCert: '/path/to/cert.pem',
  tlsKey: '/path/to/key.pem'
})

await server.run()`}</code></pre>

      <h2>Graceful Shutdown</h2>
      <pre><code>{`import { Server } from '@zap-protocol/zap'

const server = new Server({ port: 9999 })

// Handle shutdown signals
process.on('SIGINT', () => {
  console.log('Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down...')
  process.exit(0)
})

await server.run()`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/gateway/">Gateway</a> - Aggregate multiple MCP servers</li>
        <li><a href="/docs/config/">Configuration</a> - Full configuration reference</li>
        <li><a href="/docs/client/">Client API</a> - Connect to servers</li>
      </ul>
    </>
  )
}
