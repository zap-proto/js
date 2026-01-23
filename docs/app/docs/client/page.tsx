import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Client API',
  description: 'ZAP Client API reference for connecting to ZAP servers',
}

export default function ClientPage() {
  return (
    <>
      <h1>Client API</h1>
      <p>
        The <code>Client</code> class provides methods for connecting to ZAP servers
        and interacting with tools and resources.
      </p>

      <h2>Import</h2>
      <pre><code>{`import { Client } from '@zap-protocol/zap'`}</code></pre>

      <h2>Static Methods</h2>

      <h3>Client.connect(url)</h3>
      <p>
        Connect to a ZAP server at the specified URL.
      </p>
      <pre><code>{`static async connect(url: string): Promise<Client>`}</code></pre>

      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>url</code></td>
            <td><code>string</code></td>
            <td>ZAP server URL (e.g., <code>zap://localhost:9999</code>)</td>
          </tr>
        </tbody>
      </table>

      <p><strong>Returns:</strong> <code>Promise&lt;Client&gt;</code> - Connected client instance</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const client = await Client.connect('zap://localhost:9999')`}</code></pre>

      <h2>Instance Methods</h2>

      <h3>listTools()</h3>
      <p>
        List all available tools on the connected server.
      </p>
      <pre><code>{`async listTools(): Promise<Tool[]>`}</code></pre>

      <p><strong>Returns:</strong> <code>Promise&lt;Tool[]&gt;</code> - Array of tool definitions</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const tools = await client.listTools()

for (const tool of tools) {
  console.log(tool.name, '-', tool.description)
}`}</code></pre>

      <h3>callTool(name, args)</h3>
      <p>
        Execute a tool with the given arguments.
      </p>
      <pre><code>{`async callTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown>`}</code></pre>

      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>name</code></td>
            <td><code>string</code></td>
            <td>Name of the tool to call</td>
          </tr>
          <tr>
            <td><code>args</code></td>
            <td><code>Record&lt;string, unknown&gt;</code></td>
            <td>Tool arguments matching the tool&apos;s schema</td>
          </tr>
        </tbody>
      </table>

      <p><strong>Returns:</strong> <code>Promise&lt;unknown&gt;</code> - Tool execution result</p>

      <p><strong>Throws:</strong></p>
      <ul>
        <li><code>ToolNotFoundError</code> - If the tool does not exist</li>
        <li><code>InvalidArgumentError</code> - If arguments are invalid</li>
        <li><code>ServerError</code> - If the server encounters an error</li>
      </ul>

      <p><strong>Example:</strong></p>
      <pre><code>{`const result = await client.callTool('search', {
  query: 'typescript zap',
  limit: 10,
  offset: 0
})`}</code></pre>

      <h3>listResources()</h3>
      <p>
        List all available resources on the connected server.
      </p>
      <pre><code>{`async listResources(): Promise<Resource[]>`}</code></pre>

      <p><strong>Returns:</strong> <code>Promise&lt;Resource[]&gt;</code> - Array of resource definitions</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const resources = await client.listResources()

for (const resource of resources) {
  console.log(\`\${resource.name}: \${resource.uri}\`)
}`}</code></pre>

      <h3>readResource(uri)</h3>
      <p>
        Read the content of a resource by URI.
      </p>
      <pre><code>{`async readResource(uri: string): Promise<ResourceContent>`}</code></pre>

      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>uri</code></td>
            <td><code>string</code></td>
            <td>Resource URI</td>
          </tr>
        </tbody>
      </table>

      <p><strong>Returns:</strong> <code>Promise&lt;ResourceContent&gt;</code> - Resource content with URI, MIME type, and data</p>

      <p><strong>Example:</strong></p>
      <pre><code>{`const content = await client.readResource('file:///config.json')
console.log('MIME type:', content.mimeType)
console.log('Content:', content.content)`}</code></pre>

      <h3>close()</h3>
      <p>
        Close the connection to the server.
      </p>
      <pre><code>{`async close(): Promise<void>`}</code></pre>

      <p><strong>Example:</strong></p>
      <pre><code>{`await client.close()`}</code></pre>

      <h2>Connection URLs</h2>
      <p>
        ZAP supports multiple URL schemes:
      </p>
      <table>
        <thead>
          <tr>
            <th>Scheme</th>
            <th>Description</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>zap://</code></td>
            <td>Native ZAP protocol (Cap&apos;n Proto)</td>
            <td><code>zap://localhost:9999</code></td>
          </tr>
          <tr>
            <td><code>zaps://</code></td>
            <td>ZAP with TLS encryption</td>
            <td><code>zaps://api.example.com:9999</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Error Handling</h2>
      <p>
        Client methods throw typed errors that can be caught and handled:
      </p>
      <pre><code>{`import {
  Client,
  ZapError,
  ConnectionError,
  ToolNotFoundError,
  TimeoutError
} from '@zap-protocol/zap'

try {
  const client = await Client.connect('zap://localhost:9999')
  const result = await client.callTool('nonexistent', {})
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Failed to connect:', error.message)
  } else if (error instanceof ToolNotFoundError) {
    console.error('Tool not found:', error.message)
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out:', error.message)
  } else if (error instanceof ZapError) {
    console.error(\`ZAP error [\${error.code}]: \${error.message}\`)
  } else {
    throw error
  }
}`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/types/">TypeScript Types</a> - Tool, Resource, and other type definitions</li>
        <li><a href="/docs/errors/">Error Handling</a> - Complete error reference</li>
        <li><a href="/docs/gateway/">Gateway</a> - Aggregate multiple servers</li>
      </ul>
    </>
  )
}
