import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Browser Usage',
  description: 'Using ZAP TypeScript in browser environments',
}

export default function BrowserPage() {
  return (
    <>
      <h1>Browser Usage</h1>
      <p>
        ZAP TypeScript works in modern browsers with ESM support. This guide covers
        browser-specific considerations and patterns.
      </p>

      <h2>Browser Requirements</h2>
      <ul>
        <li>ES2022 support (Chrome 94+, Firefox 93+, Safari 15+, Edge 94+)</li>
        <li>ESM module support</li>
        <li>WebSocket support (for WebSocket transport)</li>
        <li>Fetch API (for HTTP transport)</li>
      </ul>

      <h2>Installation</h2>
      <p>
        Install with your preferred package manager:
      </p>
      <pre><code>npm install @zap-protocol/zap</code></pre>

      <h2>Bundler Configuration</h2>

      <h3>Vite</h3>
      <pre><code>{`// vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    include: ['@zap-protocol/zap']
  }
})`}</code></pre>

      <h3>webpack</h3>
      <pre><code>{`// webpack.config.js
module.exports = {
  resolve: {
    fallback: {
      // ZAP uses browser-compatible APIs
      // No Node.js polyfills needed
    }
  }
}`}</code></pre>

      <h3>esbuild</h3>
      <pre><code>{`// esbuild.config.js
import esbuild from 'esbuild'

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022']
})`}</code></pre>

      <h2>Basic Usage</h2>
      <pre><code>{`import { Client } from '@zap-protocol/zap'

// Connect to ZAP server
const client = await Client.connect('zap://api.example.com:9999')

// List tools
const tools = await client.listTools()
console.log('Available tools:', tools)

// Call a tool
const result = await client.callTool('search', {
  query: 'browser example'
})

// Clean up
await client.close()`}</code></pre>

      <h2>React Integration</h2>

      <h3>Custom Hook</h3>
      <pre><code>{`import { useState, useEffect, useCallback } from 'react'
import { Client, Tool, ZapError } from '@zap-protocol/zap'

interface UseZapClientOptions {
  url: string
  autoConnect?: boolean
}

interface UseZapClientResult {
  client: Client | null
  connected: boolean
  error: ZapError | null
  tools: Tool[]
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

export function useZapClient({
  url,
  autoConnect = true
}: UseZapClientOptions): UseZapClientResult {
  const [client, setClient] = useState<Client | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<ZapError | null>(null)
  const [tools, setTools] = useState<Tool[]>([])

  const connect = useCallback(async () => {
    try {
      setError(null)
      const newClient = await Client.connect(url)
      setClient(newClient)
      setConnected(true)

      // Fetch tools
      const fetchedTools = await newClient.listTools()
      setTools(fetchedTools)
    } catch (err) {
      if (err instanceof ZapError) {
        setError(err)
      }
      throw err
    }
  }, [url])

  const disconnect = useCallback(async () => {
    if (client) {
      await client.close()
      setClient(null)
      setConnected(false)
      setTools([])
    }
  }, [client])

  const callTool = useCallback(async (
    name: string,
    args: Record<string, unknown>
  ) => {
    if (!client) {
      throw new Error('Not connected')
    }
    return client.callTool(name, args)
  }, [client])

  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      if (client) {
        client.close()
      }
    }
  }, [])

  return { client, connected, error, tools, connect, disconnect, callTool }
}`}</code></pre>

      <h3>React Component Example</h3>
      <pre><code>{`import { useZapClient } from './hooks/useZapClient'

function ToolList() {
  const { connected, tools, error, callTool } = useZapClient({
    url: 'zap://api.example.com:9999'
  })

  const handleCallTool = async (toolName: string) => {
    try {
      const result = await callTool(toolName, {})
      console.log('Result:', result)
    } catch (err) {
      console.error('Tool call failed:', err)
    }
  }

  if (error) {
    return <div>Error: {error.message}</div>
  }

  if (!connected) {
    return <div>Connecting...</div>
  }

  return (
    <div>
      <h2>Available Tools</h2>
      <ul>
        {tools.map(tool => (
          <li key={tool.name}>
            <strong>{tool.name}</strong>: {tool.description}
            <button onClick={() => handleCallTool(tool.name)}>
              Call
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}`}</code></pre>

      <h2>Vue Integration</h2>
      <pre><code>{`<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Client, Tool, ZapError } from '@zap-protocol/zap'

const client = ref<Client | null>(null)
const connected = ref(false)
const tools = ref<Tool[]>([])
const error = ref<ZapError | null>(null)

onMounted(async () => {
  try {
    client.value = await Client.connect('zap://api.example.com:9999')
    connected.value = true
    tools.value = await client.value.listTools()
  } catch (err) {
    if (err instanceof ZapError) {
      error.value = err
    }
  }
})

onUnmounted(async () => {
  if (client.value) {
    await client.value.close()
  }
})

async function callTool(name: string, args: Record<string, unknown>) {
  if (!client.value) return
  return await client.value.callTool(name, args)
}
</script>

<template>
  <div v-if="error">Error: {{ error.message }}</div>
  <div v-else-if="!connected">Connecting...</div>
  <div v-else>
    <h2>Available Tools</h2>
    <ul>
      <li v-for="tool in tools" :key="tool.name">
        <strong>{{ tool.name }}</strong>: {{ tool.description }}
      </li>
    </ul>
  </div>
</template>`}</code></pre>

      <h2>Connection Management</h2>

      <h3>Handling Disconnections</h3>
      <pre><code>{`import { Client, ConnectionError } from '@zap-protocol/zap'

class ZapConnection {
  private client: Client | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<Client> {
    try {
      this.client = await Client.connect(this.url)
      this.reconnectAttempts = 0
      return this.client
    } catch (error) {
      if (error instanceof ConnectionError) {
        return this.handleReconnect()
      }
      throw error
    }
  }

  private async handleReconnect(): Promise<Client> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      throw new Error('Max reconnection attempts exceeded')
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(\`Reconnecting in \${delay}ms (attempt \${this.reconnectAttempts})\`)
    await new Promise(resolve => setTimeout(resolve, delay))

    return this.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
  }
}`}</code></pre>

      <h2>CORS Considerations</h2>
      <p>
        When connecting to a ZAP server from a browser, ensure the server is configured
        for CORS if it&apos;s on a different origin:
      </p>
      <ul>
        <li>The ZAP server must allow your origin</li>
        <li>WebSocket connections may require specific CORS headers</li>
        <li>Consider using a proxy in development</li>
      </ul>

      <h2>Security Best Practices</h2>
      <ul>
        <li>Always use <code>zaps://</code> (TLS) in production</li>
        <li>Never expose sensitive credentials in client-side code</li>
        <li>Validate all tool results before using them</li>
        <li>Implement rate limiting on the client side</li>
        <li>Handle connection errors gracefully</li>
      </ul>

      <h2>Performance Tips</h2>
      <ul>
        <li>Reuse client connections when possible</li>
        <li>Batch related tool calls when the API supports it</li>
        <li>Use WebSocket transport for real-time updates</li>
        <li>Implement connection pooling for high-traffic applications</li>
      </ul>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/nodejs/">Node.js Usage</a> - Server-side usage</li>
        <li><a href="/docs/client/">Client API</a> - Full client reference</li>
        <li><a href="/docs/examples/">Examples</a> - More code examples</li>
      </ul>
    </>
  )
}
