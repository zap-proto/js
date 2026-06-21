# zap-proto

The default npm install for the **ZAP** TypeScript runtime — Zero-copy App Proto.

```bash
npm install zap-proto
```

This package re-exports [`@zap-proto/zap`](https://www.npmjs.com/package/@zap-proto/zap)
(the canonical implementation). Same name as the [PyPI](https://pypi.org/project/zap-proto/)
and [crates.io](https://crates.io/crates/zap-proto) packages, so `zap-proto` is the
consistent install across npm, Python, and Rust.

```ts
import { Builder, Message } from "zap-proto";          // zero-copy wire codec
import { issue, verify } from "zap-proto/cap";         // capability layer
import { ZapClient } from "zap-proto/node";            // TCP RPC client
```

See the [`@zap-proto/zap` docs](https://zap-proto.dev) for the full API.
