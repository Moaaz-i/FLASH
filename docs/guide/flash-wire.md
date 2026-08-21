# FLASH Native Wire Protocol

TCP binary protocol with BSON payloads for remote FLASH clients. Default port: **6744**.

---

## Server

```javascript
import { FlashDatabase, FlashWireServer } from 'flash-db';

const db = new FlashDatabase('wire_db', { storagePath: './data' });
const server = new FlashWireServer(db, {
  port: 6744,
  host: '127.0.0.1',
  replicaSet: 'flash_rs',
});

await server.start();
```

### Commands

| Command | Description |
|---------|-------------|
| `flashHello` / `handshake` | Server identity |
| `ping` | Health check |
| `find` | Query collection |
| `insert` | Insert documents |
| `update` / `delete` | Mutations |
| `count` | Count matching docs |
| `aggregate` | Pipeline (`$match`, `$project`, `$limit`) |
| `listCollections` | List collections |
| `createIndexes` | Create secondary indexes |

---

## Client

```javascript
import { FlashWireClient } from 'flash-db';

const client = new FlashWireClient('127.0.0.1', 6744);
const hello = await client.command({ flashHello: 1, $db: 'admin' });
const found = await client.command({
  find: 'users',
  filter: { name: 'Alice' },
  $db: 'wire_db',
});
```

---

## FlashEdgeNode

Combined HTTP (`6742`) + wire (`6744`) edge daemon:

```javascript
import { FlashEdgeNode } from 'flash-db';

const edge = new FlashEdgeNode({
  storagePath: './edge_data',
  httpPort: 6742,
  wirePort: 6744,
  authKey: 'edge-secret',
});

await edge.start();
```

See also: [Client-Server Mode](/guide/client-server), [Protocols: gRPC & GraphQL](/guide/protocols).
