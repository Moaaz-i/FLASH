# Polyglot Protocols: gRPC, GraphQL & FLASH Wire

**FLASH DB** provides dedicated protocol engines for low-latency polyglot microservices (`gRPC`), flexible web query APIs (`GraphQL`), and the native **FLASH Wire** binary protocol.

> For the native TCP wire protocol (BSON, port 6744), see [FLASH Wire Protocol](/guide/flash-wire).

---

## 1. High-Throughput Binary Protocol / gRPC (`FlashGRPCServer`)

Runs a dedicated binary TCP socket listener with protobuf-like length-prefixed framing for Go, Python, and Rust client integration:

```javascript
import { FlashDatabase, FlashGRPCServer } from '@moaaz-i/flash-db';

const db = new FlashDatabase('rpc_db', { storagePath: './data' });
const grpcServer = new FlashGRPCServer(db, { port: 6743 });

await grpcServer.start();
console.log('⚡ gRPC binary service running on port 6743');
```

---

## 2. Zero-Knowledge GraphQL Engine (`FlashGraphQL`)

Execute standard GraphQL queries against collections with field projection and pagination:

```javascript
import { FlashDatabase, FlashGraphQL } from '@moaaz-i/flash-db';

const db = new FlashDatabase('app_db', { storagePath: './data' });
const gql = new FlashGraphQL(db);

const response = await gql.execute(`
  {
    users(limit: 5) {
      name
      email
      balance
    }
  }
`);

console.log(response.data.users);
```
