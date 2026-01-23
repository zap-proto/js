import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Installation',
  description: 'Install and set up ZAP TypeScript in your project',
}

export default function InstallationPage() {
  return (
    <>
      <h1>Installation</h1>
      <p>
        ZAP TypeScript provides high-performance Cap&apos;n Proto RPC bindings for AI agent communication.
        It works in both Node.js and browser environments.
      </p>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js 18 or later</li>
        <li>TypeScript 5.0 or later (recommended)</li>
        <li>ESM module support</li>
      </ul>

      <h2>Package Managers</h2>

      <h3>npm</h3>
      <pre><code>npm install @zap-protocol/zap</code></pre>

      <h3>pnpm</h3>
      <pre><code>pnpm add @zap-protocol/zap</code></pre>

      <h3>yarn</h3>
      <pre><code>yarn add @zap-protocol/zap</code></pre>

      <h3>bun</h3>
      <pre><code>bun add @zap-protocol/zap</code></pre>

      <h2>TypeScript Configuration</h2>
      <p>
        ZAP is written in TypeScript and ships with full type definitions.
        Ensure your <code>tsconfig.json</code> has the following settings:
      </p>
      <pre><code>{`{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true
  }
}`}</code></pre>

      <h2>ESM Module</h2>
      <p>
        ZAP is distributed as an ESM module. Ensure your <code>package.json</code> includes:
      </p>
      <pre><code>{`{
  "type": "module"
}`}</code></pre>

      <h2>Verify Installation</h2>
      <p>
        Create a simple test file to verify the installation:
      </p>
      <pre><code>{`import { VERSION, DEFAULT_PORT } from '@zap-protocol/zap'

console.log('ZAP Version:', VERSION)
console.log('Default Port:', DEFAULT_PORT)`}</code></pre>

      <p>Run with:</p>
      <pre><code>npx tsx verify.ts</code></pre>

      <h2>Next Steps</h2>
      <p>
        Now that ZAP is installed, proceed to the <a href="/docs/quickstart/">Quick Start</a> guide
        to learn how to connect to a ZAP server and make your first RPC calls.
      </p>
    </>
  )
}
