import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Error Handling',
  description: 'ZAP error types and handling patterns',
}

export default function ErrorsPage() {
  return (
    <>
      <h1>Error Handling</h1>
      <p>
        ZAP provides a comprehensive error hierarchy for handling different failure
        scenarios. All errors extend the base <code>ZapError</code> class.
      </p>

      <h2>Import</h2>
      <pre><code>{`import {
  ZapError,
  ConnectionError,
  TransportError,
  ProtocolError,
  TimeoutError,
  ServerError,
  ToolNotFoundError,
  ResourceNotFoundError,
  InvalidArgumentError
} from '@zap-protocol/zap'`}</code></pre>

      <h2>Error Hierarchy</h2>
      <pre><code>{`ZapError (base)
├── ConnectionError
├── TransportError
├── ProtocolError
├── TimeoutError
├── ServerError
├── ToolNotFoundError
├── ResourceNotFoundError
└── InvalidArgumentError`}</code></pre>

      <h2>Base Error</h2>

      <h3>ZapError</h3>
      <p>Base class for all ZAP errors.</p>
      <pre><code>{`class ZapError extends Error {
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(
    message: string,
    code?: string,
    details?: Record<string, unknown>
  )
}`}</code></pre>

      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>message</code></td>
            <td><code>string</code></td>
            <td>Human-readable error message</td>
          </tr>
          <tr>
            <td><code>code</code></td>
            <td><code>string</code></td>
            <td>Machine-readable error code</td>
          </tr>
          <tr>
            <td><code>details</code></td>
            <td><code>Record&lt;string, unknown&gt;</code></td>
            <td>Additional error context</td>
          </tr>
        </tbody>
      </table>

      <h2>Connection Errors</h2>

      <h3>ConnectionError</h3>
      <p>Thrown when a connection cannot be established.</p>
      <pre><code>{`class ConnectionError extends ZapError {
  constructor(message: string, details?: Record<string, unknown>)
}
// Code: 'CONNECTION_ERROR'`}</code></pre>

      <p><strong>Common causes:</strong></p>
      <ul>
        <li>Server is not running</li>
        <li>Network is unreachable</li>
        <li>DNS resolution failed</li>
        <li>TLS handshake failed</li>
      </ul>

      <h3>TransportError</h3>
      <p>Thrown when the transport layer fails.</p>
      <pre><code>{`class TransportError extends ZapError {
  constructor(message: string, details?: Record<string, unknown>)
}
// Code: 'TRANSPORT_ERROR'`}</code></pre>

      <p><strong>Common causes:</strong></p>
      <ul>
        <li>Connection dropped</li>
        <li>Socket error</li>
        <li>Stream closed unexpectedly</li>
      </ul>

      <h2>Protocol Errors</h2>

      <h3>ProtocolError</h3>
      <p>Thrown when a protocol violation occurs.</p>
      <pre><code>{`class ProtocolError extends ZapError {
  constructor(message: string, details?: Record<string, unknown>)
}
// Code: 'PROTOCOL_ERROR'`}</code></pre>

      <p><strong>Common causes:</strong></p>
      <ul>
        <li>Invalid message format</li>
        <li>Unexpected message type</li>
        <li>Schema validation failed</li>
      </ul>

      <h2>Timeout Errors</h2>

      <h3>TimeoutError</h3>
      <p>Thrown when an operation times out.</p>
      <pre><code>{`class TimeoutError extends ZapError {
  constructor(message: string, details?: Record<string, unknown>)
}
// Code: 'TIMEOUT_ERROR'`}</code></pre>

      <p><strong>Common causes:</strong></p>
      <ul>
        <li>Connection timeout exceeded</li>
        <li>Request timeout exceeded</li>
        <li>Server not responding</li>
      </ul>

      <h2>Server Errors</h2>

      <h3>ServerError</h3>
      <p>Thrown when the server reports an error.</p>
      <pre><code>{`class ServerError extends ZapError {
  constructor(message: string, details?: Record<string, unknown>)
}
// Code: 'SERVER_ERROR'`}</code></pre>

      <h2>Resource Errors</h2>

      <h3>ToolNotFoundError</h3>
      <p>Thrown when a requested tool does not exist.</p>
      <pre><code>{`class ToolNotFoundError extends ZapError {
  constructor(toolName: string)
}
// Code: 'TOOL_NOT_FOUND'
// Details: { toolName: string }`}</code></pre>

      <h3>ResourceNotFoundError</h3>
      <p>Thrown when a requested resource does not exist.</p>
      <pre><code>{`class ResourceNotFoundError extends ZapError {
  constructor(uri: string)
}
// Code: 'RESOURCE_NOT_FOUND'
// Details: { uri: string }`}</code></pre>

      <h2>Validation Errors</h2>

      <h3>InvalidArgumentError</h3>
      <p>Thrown when tool arguments are invalid.</p>
      <pre><code>{`class InvalidArgumentError extends ZapError {
  constructor(argument: string, reason: string)
}
// Code: 'INVALID_ARGUMENT'
// Details: { argument: string, reason: string }`}</code></pre>

      <h2>Error Handling Patterns</h2>

      <h3>Basic Error Handling</h3>
      <pre><code>{`import { Client, ZapError } from '@zap-protocol/zap'

try {
  const client = await Client.connect('zap://localhost:9999')
  const result = await client.callTool('search', { query: 'test' })
} catch (error) {
  if (error instanceof ZapError) {
    console.error(\`Error [\${error.code}]: \${error.message}\`)
    if (error.details) {
      console.error('Details:', error.details)
    }
  } else {
    throw error  // Re-throw non-ZAP errors
  }
}`}</code></pre>

      <h3>Specific Error Handling</h3>
      <pre><code>{`import {
  Client,
  ConnectionError,
  TimeoutError,
  ToolNotFoundError,
  InvalidArgumentError,
  ZapError
} from '@zap-protocol/zap'

async function callToolSafely(
  client: Client,
  name: string,
  args: Record<string, unknown>
) {
  try {
    return await client.callTool(name, args)
  } catch (error) {
    if (error instanceof ConnectionError) {
      // Handle connection issues - maybe retry
      console.error('Connection failed, retrying...')
      await reconnect()
      return await client.callTool(name, args)
    }

    if (error instanceof TimeoutError) {
      // Handle timeout - maybe use longer timeout
      console.error('Request timed out')
      return null
    }

    if (error instanceof ToolNotFoundError) {
      // Handle missing tool
      console.error(\`Tool '\${name}' not found\`)
      return null
    }

    if (error instanceof InvalidArgumentError) {
      // Handle validation errors
      console.error(\`Invalid argument: \${error.details?.argument}\`)
      console.error(\`Reason: \${error.details?.reason}\`)
      return null
    }

    if (error instanceof ZapError) {
      // Handle other ZAP errors
      console.error(\`ZAP error: \${error.message}\`)
      return null
    }

    // Re-throw unknown errors
    throw error
  }
}`}</code></pre>

      <h3>Retry Pattern</h3>
      <pre><code>{`import { Client, ConnectionError, TimeoutError } from '@zap-protocol/zap'

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof ConnectionError || error instanceof TimeoutError) {
        lastError = error
        console.log(\`Attempt \${attempt} failed, retrying in \${delay}ms...\`)
        await new Promise(resolve => setTimeout(resolve, delay))
        delay *= 2  // Exponential backoff
      } else {
        throw error  // Don't retry other errors
      }
    }
  }

  throw lastError
}

// Usage
const result = await withRetry(() =>
  client.callTool('search', { query: 'test' })
)`}</code></pre>

      <h3>Error Logging</h3>
      <pre><code>{`import { ZapError } from '@zap-protocol/zap'

function logError(error: unknown) {
  if (error instanceof ZapError) {
    console.error(JSON.stringify({
      type: error.name,
      code: error.code,
      message: error.message,
      details: error.details,
      stack: error.stack
    }))
  } else if (error instanceof Error) {
    console.error(JSON.stringify({
      type: error.name,
      message: error.message,
      stack: error.stack
    }))
  } else {
    console.error('Unknown error:', error)
  }
}`}</code></pre>

      <h2>Error Codes Reference</h2>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Error Class</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>ZAP_ERROR</code></td>
            <td>ZapError</td>
            <td>Generic ZAP error</td>
          </tr>
          <tr>
            <td><code>CONNECTION_ERROR</code></td>
            <td>ConnectionError</td>
            <td>Connection failed</td>
          </tr>
          <tr>
            <td><code>TRANSPORT_ERROR</code></td>
            <td>TransportError</td>
            <td>Transport layer failure</td>
          </tr>
          <tr>
            <td><code>PROTOCOL_ERROR</code></td>
            <td>ProtocolError</td>
            <td>Protocol violation</td>
          </tr>
          <tr>
            <td><code>TIMEOUT_ERROR</code></td>
            <td>TimeoutError</td>
            <td>Operation timed out</td>
          </tr>
          <tr>
            <td><code>SERVER_ERROR</code></td>
            <td>ServerError</td>
            <td>Server-side error</td>
          </tr>
          <tr>
            <td><code>TOOL_NOT_FOUND</code></td>
            <td>ToolNotFoundError</td>
            <td>Tool does not exist</td>
          </tr>
          <tr>
            <td><code>RESOURCE_NOT_FOUND</code></td>
            <td>ResourceNotFoundError</td>
            <td>Resource does not exist</td>
          </tr>
          <tr>
            <td><code>INVALID_ARGUMENT</code></td>
            <td>InvalidArgumentError</td>
            <td>Invalid tool argument</td>
          </tr>
        </tbody>
      </table>

      <h2>See Also</h2>
      <ul>
        <li><a href="/docs/client/">Client API</a> - Client methods that throw errors</li>
        <li><a href="/docs/gateway/">Gateway</a> - Gateway methods that throw errors</li>
        <li><a href="/docs/types/">TypeScript Types</a> - Type definitions</li>
      </ul>
    </>
  )
}
