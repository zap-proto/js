import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">ZAP</span>
              <span className="text-zinc-500 dark:text-zinc-400">TypeScript</span>
            </div>
            <nav className="flex items-center gap-6">
              <Link href="/docs/" className="text-sm hover:text-primary-600 dark:hover:text-primary-400">
                Documentation
              </Link>
              <a
                href="https://github.com/zap-protocol/zap-js"
                className="text-sm hover:text-primary-600 dark:hover:text-primary-400"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight">
            ZAP TypeScript
          </h1>
          <p className="mt-6 text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto">
            High-performance Cap&apos;n Proto RPC for AI agent communication.
            Zero-copy message passing with full TypeScript support.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/docs/"
              className="rounded-lg bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-500"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/zap-protocol/zap-js"
              className="rounded-lg bg-zinc-100 dark:bg-zinc-800 px-6 py-3 text-sm font-semibold shadow-sm hover:bg-zinc-200 dark:hover:bg-zinc-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Quick Install */}
        <div className="mt-16 max-w-2xl mx-auto">
          <pre className="bg-zinc-900 text-zinc-100 rounded-xl p-6 text-center">
            <code>npm install @zap-protocol/zap</code>
          </pre>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">Zero-Copy Performance</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Cap&apos;n Proto enables direct memory access without serialization overhead.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">Full TypeScript Support</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Complete type definitions for all APIs with excellent IDE integration.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">MCP Compatible</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Gateway bridges MCP servers for seamless AI agent integration.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">Post-Quantum Security</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              ML-KEM and ML-DSA cryptography for future-proof security.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">W3C DID Support</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Decentralized identifiers for agent authentication and verification.
            </p>
          </div>
          <div className="p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold">Browser &amp; Node.js</h3>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Works in any JavaScript environment with ESM module support.
            </p>
          </div>
        </div>

        {/* Quick Example */}
        <div className="mt-24">
          <h2 className="text-2xl font-bold text-center mb-8">Quick Example</h2>
          <div className="max-w-3xl mx-auto">
            <pre className="bg-zinc-900 text-zinc-100 rounded-xl p-6 overflow-x-auto">
              <code>{`import { Client } from '@zap-protocol/zap'

// Connect to ZAP server
const client = await Client.connect('zap://localhost:9999')

// List available tools
const tools = await client.listTools()
console.log('Available tools:', tools)

// Call a tool
const result = await client.callTool('search', {
  query: 'hello world'
})
console.log('Result:', result)

// Clean up
await client.close()`}</code>
            </pre>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              ZAP Protocol - MIT License
            </p>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="https://github.com/zap-protocol" className="hover:text-zinc-700 dark:hover:text-zinc-300">
                GitHub
              </a>
              <a href="https://zap.dev" className="hover:text-zinc-700 dark:hover:text-zinc-300">
                zap.dev
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
