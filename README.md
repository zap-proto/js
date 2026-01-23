# ZAP TypeScript

TypeScript bindings for **ZAP** (Zero-Copy App Proto) - high-performance Cap'n Proto RPC for AI agents.

## Installation

```bash
npm install @zap-protocol/zap
# or
pnpm add @zap-protocol/zap
```

## Usage

```typescript
import { Client } from '@zap-protocol/zap';

// Connect to ZAP server
const client = await Client.connect('zap://localhost:9999');

// List available tools
const tools = await client.listTools();
console.log('Tools:', tools);

// Call a tool
const result = await client.callTool('search', { query: 'hello world' });
console.log('Result:', result);

// Clean up
await client.close();
```

## Server

```typescript
import { Server } from '@zap-protocol/zap';

const server = new Server({
  name: 'my-agent',
  version: '1.0.0',
});

// Register a tool
server.tool('search', {
  description: 'Search for content',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    return { results: [`Found: ${args.query}`] };
  },
});

// Start server
await server.listen(9999);
```

## Features

- Zero-copy message passing via Cap'n Proto
- Full ZAP protocol support (tools, resources, prompts)
- MCP Gateway bridging
- Post-quantum cryptography (ML-KEM, ML-DSA)
- W3C DID support
- Agent consensus voting
- Lux blockchain integration

## Related Packages

- [zap-protocol/zap](https://github.com/zap-protocol/zap) - Core schema + Rust implementation
- [zap-protocol/zap-go](https://github.com/zap-protocol/zap-go) - Go bindings
- [zap-protocol/zap-py](https://github.com/zap-protocol/zap-py) - Python bindings
- [zap-protocol/zap-cpp](https://github.com/zap-protocol/zap-cpp) - C/C++ bindings

## License

MIT
