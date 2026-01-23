import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Node.js Usage',
  description: 'Using ZAP TypeScript in Node.js environments',
}

export default function NodejsPage() {
  return (
    <>
      <h1>Node.js Usage</h1>
      <p>
        ZAP TypeScript is designed to work seamlessly in Node.js environments.
        This guide covers Node.js-specific patterns and best practices.
      </p>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js 18 or later</li>
        <li>ESM module support (<code>&quot;type&quot;: &quot;module&quot;</code> in package.json)</li>
      </ul>

      <h2>Installation</h2>
      <pre><code>npm install @zap-protocol/zap</code></pre>

      <h2>Basic Client Usage</h2>
      <pre><code>{`import { Client } from '@zap-protocol/zap'

async function main() {
  const client = await Client.connect('zap://localhost:9999')

  try {
    const tools = await client.listTools()
    console.log('Tools:', tools)

    const result = await client.callTool('search', { query: 'hello' })
    console.log('Result:', result)
  } finally {
    await client.close()
  }
}

main().catch(console.error)`}</code></pre>

      <h2>Running a Gateway</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

async function main() {
  const gateway = new Gateway({
    listen: '0.0.0.0',
    port: 9999,
    logLevel: 'info',
    servers: [
      {
        name: 'local-agent',
        url: 'http://localhost:3000',
        transport: 'http'
      }
    ]
  })

  // Handle shutdown signals
  process.on('SIGINT', async () => {
    console.log('Shutting down...')
    await gateway.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('Shutting down...')
    await gateway.stop()
    process.exit(0)
  })

  await gateway.start()
  console.log('Gateway running on port 9999')
}

main().catch(console.error)`}</code></pre>

      <h2>Running a Server</h2>
      <pre><code>{`import { Server } from '@zap-protocol/zap'

const server = new Server({
  listen: '0.0.0.0',
  port: 9999,
  logLevel: 'info'
})

// Handle shutdown
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

await server.run()`}</code></pre>

      <h2>Environment Configuration</h2>
      <pre><code>{`import { Gateway, loadConfigFromEnv, mergeConfig } from '@zap-protocol/zap'

// Load from environment variables
const envConfig = loadConfigFromEnv()

// Merge with defaults
const config = mergeConfig(envConfig, {
  servers: [
    {
      name: 'api',
      url: process.env.API_URL || 'http://localhost:3000',
      transport: 'http'
    }
  ]
})

const gateway = new Gateway(config)
await gateway.start()`}</code></pre>

      <h3>Environment Variables</h3>
      <pre><code>{`# .env
ZAP_LISTEN=0.0.0.0
ZAP_PORT=9999
ZAP_LOG_LEVEL=info
ZAP_TLS_CERT=/etc/ssl/certs/zap.pem
ZAP_TLS_KEY=/etc/ssl/private/zap.key
ZAP_MAX_CONNECTIONS=5000`}</code></pre>

      <h2>Stdio Transport</h2>
      <p>
        Connect to MCP servers running as subprocess:
      </p>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

const gateway = new Gateway({
  port: 9999,
  servers: [
    {
      name: 'python-agent',
      url: 'stdio://',
      transport: 'stdio',
      command: 'python',
      args: ['-m', 'mcp_agent'],
      env: {
        PYTHONUNBUFFERED: '1',
        DEBUG: 'true'
      }
    },
    {
      name: 'node-agent',
      url: 'stdio://',
      transport: 'stdio',
      command: 'node',
      args: ['./agent.js', '--mode', 'mcp']
    }
  ]
})

await gateway.start()`}</code></pre>

      <h2>Unix Socket Transport</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

const gateway = new Gateway({
  port: 9999,
  servers: [
    {
      name: 'local-service',
      url: 'unix:///var/run/mcp/agent.sock',
      transport: 'unix'
    }
  ]
})

await gateway.start()`}</code></pre>

      <h2>TLS Configuration</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'
import { readFileSync } from 'node:fs'

const gateway = new Gateway({
  port: 443,
  tlsCert: '/etc/ssl/certs/zap.pem',
  tlsKey: '/etc/ssl/private/zap.key'
})

await gateway.start()
console.log('Gateway running with TLS on port 443')`}</code></pre>

      <h2>Logging</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

const gateway = new Gateway({
  port: 9999,
  logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
})

// Log levels: debug, info, warn, error
await gateway.start()`}</code></pre>

      <h2>Cluster Mode</h2>
      <p>
        Run multiple gateway processes for better performance:
      </p>
      <pre><code>{`import cluster from 'node:cluster'
import { cpus } from 'node:os'
import { Gateway } from '@zap-protocol/zap'

const numCPUs = cpus().length

if (cluster.isPrimary) {
  console.log(\`Primary \${process.pid} is running\`)

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(\`Worker \${worker.process.pid} died\`)
    cluster.fork()  // Replace dead worker
  })
} else {
  // Workers share the TCP port
  const gateway = new Gateway({
    port: 9999,
    logLevel: 'info'
  })

  await gateway.start()
  console.log(\`Worker \${process.pid} started\`)
}`}</code></pre>

      <h2>Health Checks</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'
import { createServer } from 'node:http'

const gateway = new Gateway({ port: 9999 })
await gateway.start()

// HTTP health check endpoint
const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    if (gateway.isRunning()) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'healthy',
        servers: gateway.listServers().length
      }))
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'unhealthy' }))
    }
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(8080)
console.log('Health check on :8080/health')`}</code></pre>

      <h2>TypeScript Configuration</h2>
      <pre><code>{`// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "declaration": true
  },
  "include": ["src/**/*"]
}`}</code></pre>

      <h2>Running with tsx</h2>
      <pre><code>{`# Development with hot reload
npx tsx watch src/server.ts

# Production
npx tsx src/server.ts`}</code></pre>

      <h2>Docker Deployment</h2>
      <pre><code>{`# Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV ZAP_PORT=9999
ENV ZAP_LOG_LEVEL=info

EXPOSE 9999

CMD ["node", "dist/server.js"]`}</code></pre>

      <pre><code>{`# docker-compose.yml
services:
  zap-gateway:
    build: .
    ports:
      - "9999:9999"
    environment:
      - ZAP_PORT=9999
      - ZAP_LOG_LEVEL=info
    restart: unless-stopped`}</code></pre>

      <h2>Graceful Shutdown</h2>
      <pre><code>{`import { Gateway } from '@zap-protocol/zap'

const gateway = new Gateway({ port: 9999 })

let isShuttingDown = false

async function shutdown(signal: string) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(\`Received \${signal}, shutting down gracefully...\`)

  // Set a timeout for forceful shutdown
  const forceTimeout = setTimeout(() => {
    console.error('Forceful shutdown due to timeout')
    process.exit(1)
  }, 30000)

  try {
    await gateway.stop()
    clearTimeout(forceTimeout)
    console.log('Shutdown complete')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    clearTimeout(forceTimeout)
    process.exit(1)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

await gateway.start()
console.log('Gateway running')`}</code></pre>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/browser/">Browser Usage</a> - Client-side usage</li>
        <li><a href="/docs/gateway/">Gateway</a> - Full gateway reference</li>
        <li><a href="/docs/config/">Configuration</a> - Configuration options</li>
        <li><a href="/docs/examples/">Examples</a> - More code examples</li>
      </ul>
    </>
  )
}
