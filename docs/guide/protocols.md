# Polyglot Protocols: gRPC, GraphQL & FLASH Wire

**FLASH DB** provides dedicated protocol engines for low-latency polyglot microservices (`gRPC`), flexible web query APIs (`GraphQL`), and the native **FLASH Wire** binary protocol.

> For the native TCP wire protocol (BSON, port 6744), see [FLASH Wire Protocol](/guide/flash-wire).

---

## 1. High-Throughput Binary Protocol / gRPC (`FlashGRPCServer`)

Runs a dedicated binary TCP socket listener with length-prefixed framing. Inserts must be **sealed client envelopes**; finds accept **trapdoor envelopes only**. The daemon never decrypts.

```javascript
import { FlashDatabase, FlashGRPCServer } from "flash-zk";

const db = new FlashDatabase("rpc_db", { storagePath: "./data" });
const grpcServer = new FlashGRPCServer(db, {
  port: 6743,
  authKey: "cluster-secret",
});

await grpcServer.start();
console.log("⚡ gRPC binary service running on port 6743");
```

---

## 2. Zero-Knowledge GraphQL Engine (`FlashGraphQL`)

Execute GraphQL-shaped queries through **FlashClient**. The engine returns sealed records; the client decrypts and projects fields.

```javascript
import { FlashClient, FlashGraphQL } from "flash-zk";

const client = new FlashClient({
  secretKey: "your-long-random-passphrase",
  storagePath: "./data",
});
const gql = new FlashGraphQL(client);

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
