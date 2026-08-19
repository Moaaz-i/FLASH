# Production Engine

Features for production-grade encrypted intelligence workloads.

---

## Query Planner & Explain

```javascript
const explained = await users
  .find({ tenantId: 't1', status: 'active' })
  .explain()
  .exec();

console.log(explained.queryPlanner.winningPlan);
console.log(explained.executionStats.totalKeysExamined);
```

`FlashQueryPlanner` selects compound indexes, blind indexes, or collection scan.

---

## Invariants

```javascript
const report = await users.raw.verifyInvariants();
// { valid, activeDocs, registeredIds, sstables, errors }
```

---

## ACID Sessions + TxLog

```javascript
const session = client.startSession();
session.startTransaction();
await session.insert('accounts', { account: 'A1', balance: 100 });
await session.commitTransaction();
```

Crash recovery replays prepared transactions:

```javascript
await client.db.recoverTransactions({ replay: true });
```

---

## Replica Set

```javascript
import { FlashReplicaSet } from '@moaaz-yahia-zakaria/flash-db';

const rs = new FlashReplicaSet({
  storageRoot: './replica_data',
  network: true,
  writeConcern: 'majority',
});

rs.addNode('leader', ['follower'], { port: 6751 });
rs.addNode('follower', ['leader'], { port: 6750 });
await rs.startNetworkNodes();
rs.electLeader('leader');

await rs.replicateInsert('events', { type: 'click', value: 42 });
await rs.failover('follower');
```

---

## Worker Pool & Spill Aggregation

Background compaction via worker threads and spill-to-disk aggregation for large `$group` pipelines. See [Enterprise Scale APIs](/api/enterprise-api).

---

## Tests

Production features are covered by:

- `production_hardening.test.mjs`
- `wire_protocol.test.mjs`
- `flash_superpowers.test.mjs`
- `flash_identity.test.mjs`

Run: `npm test` (122 tests).
