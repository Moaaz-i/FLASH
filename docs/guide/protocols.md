# Polyglot Protocols: gRPC & GraphQL

**FLASH DB** provides dedicated protocol engines for low-latency polyglot microservices (`gRPC`) and flexible web query APIs (`GraphQL`).

---

## 1. High-Throughput Binary Protocol / gRPC (`FlashGRPCServer`)

Runs a dedicated binary TCP socket listener with protobuf-like length-prefixed framing for Go, Python, and Rust client integration:

```javascript
import { FlashDatabase, FlashGRPCServer } from 'flash-db';

const db = new FlashDatabase('rpc_db', { storagePath: './data' });
const grpcServer = new FlashGRPCServer(db, { port: 6743 });

await grpcServer.start();
console.log('⚡ gRPC binary service running on port 6743');
```

---

## 2. Zero-Knowledge GraphQL Engine (`FlashGraphQL`)

Execute standard GraphQL queries against collections with field projection and pagination:

```javascript
import { FlashDatabase, FlashGraphQL } from 'flash-db';

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
