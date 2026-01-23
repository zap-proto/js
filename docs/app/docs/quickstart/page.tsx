import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Quick Start',
  description: 'Get started with ZAP TypeScript in minutes',
}

export default function QuickStartPage() {
  return (
    <>
      <h1>Quick Start</h1>
      <p>
        This guide walks you through connecting to a ZAP server, listing tools,
        and making your first RPC call.
      </p>

      <h2>Connect to a Server</h2>
      <p>
        Use the <code>Client</code> class to connect to a ZAP server:
      </p>
      <pre><code>{`import { Client } from '@zap-protocol/zap'

// Connect to ZAP server
const client = await Client.connect('zap://localhost:9999')
console.log('Connected to ZAP server')`}</code></pre>

      <h2>List Available Tools</h2>
      <p>
        Query the server for available tools:
      </p>
      <pre><code>{`const tools = await client.listTools()

for (const tool of tools) {
  console.log(\`Tool: \${tool.name}\`)
  console.log(\`  Description: \${tool.description}\`)
  console.log(\`  Schema: \${JSON.stringify(tool.schema)}\`)
}`}</code></pre>

      <h2>Call a Tool</h2>
      <p>
        Execute a tool with arguments:
      </p>
      <pre><code>{`const result = await client.callTool('search', {
  query: 'hello world',
  limit: 10
})

console.log('Result:', result)`}</code></pre>

      <h2>Read Resources</h2>
      <p>
        Access server resources:
      </p>
      <pre><code>{`// List available resources
const resources = await client.listResources()

for (const resource of resources) {
  console.log(\`Resource: \${resource.name} (\${resource.uri})\`)
}

// Read a specific resource
const content = await client.readResource('file:///path/to/resource')
console.log('Content:', content)`}</code></pre>

      <h2>Close Connection</h2>
      <p>
        Always close the connection when done:
      </p>
      <pre><code>{`await client.close()
console.log('Disconnected')`}</code></pre>

      <h2>Complete Example</h2>
      <p>
        Here&apos;s a complete example putting it all together:
      </p>
      <pre><code>{`import { Client, ZapError } from '@zap-protocol/zap'

async function main() {
  // Connect to server
  const client = await Client.connect('zap://localhost:9999')

  try {
    // List tools
    const tools = await client.listTools()
    console.log(\`Found \${tools.length} tools\`)

    // Call a tool if available
    if (tools.length > 0) {
      const tool = tools[0]
      console.log(\`Calling tool: \${tool.name}\`)

      const result = await client.callTool(tool.name, {})
      console.log('Result:', result)
    }

    // List resources
    const resources = await client.listResources()
    console.log(\`Found \${resources.length} resources\`)

  } catch (error) {
    if (error instanceof ZapError) {
      console.error(\`ZAP Error [\${error.code}]: \${error.message}\`)
    } else {
      throw error
    }
  } finally {
    // Always close the connection
    await client.close()
  }
}

main().catch(console.error)`}</code></pre>

      <h2>Next Steps</h2>
      <ul>
        <li><a href="/docs/client/">Client API Reference</a> - Full client documentation</li>
        <li><a href="/docs/gateway/">Gateway</a> - Aggregate multiple MCP servers</li>
        <li><a href="/docs/types/">TypeScript Types</a> - Type definitions reference</li>
        <li><a href="/docs/examples/">Examples</a> - More code examples</li>
      </ul>
    </>
  )
}
