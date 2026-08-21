# MVCC Snapshot Isolation & Distributed 2-Phase Commit (2PC)

**FLASH DB** guarantees strong consistency and enterprise-grade ACID transactions through two synchronized engines:
1. **FlashMVCC**: Multi-Version Concurrency Control with Snapshot Isolation & Optimistic Concurrency Control (OCC).
2. **FlashDistributedTxCoordinator**: Two-Phase Commit (2PC) protocol across sharded clusters.

---

## Multi-Version Concurrency Control (MVCC)

In FLASH MVCC, **readers never block writers, and writers never block readers**.

Each write creates a new version tagged with a monotonic commit timestamp (`commitTs`), keeping a historical chain of document versions for non-blocking snapshot reads.

```
Document Version Chain for "user_101":
[v1: commitTs=100] -> [v2: commitTs=150] -> [v3: commitTs=220 (Latest)]
```

### Snapshot Isolation Example

```javascript
import { FlashMVCC } from 'flash-zk';

const mvcc = new FlashMVCC();

// 1. Transaction 1 writes and commits an account balance
const tx1 = mvcc.beginTransaction('tx1');
mvcc.write(tx1.txId, 'acc_100', { balance: 500 });
mvcc.commit(tx1.txId);

// 2. Transaction 2 begins (Captures Snapshot timestamp)
const tx2 = mvcc.beginTransaction('tx2');
console.log(mvcc.read(tx2.txId, 'acc_100').balance); // 500

// 3. Transaction 3 modifies acc_100 in background and commits
const tx3 = mvcc.beginTransaction('tx3');
mvcc.write(tx3.txId, 'acc_100', { balance: 900 });
mvcc.commit(tx3.txId);

// 4. Transaction 2 STILL reads its snapshot (500) without seeing uncommitted/later changes!
console.log(mvcc.read(tx2.txId, 'acc_100').balance); // 500

// 5. If Transaction 2 attempts to write to acc_100, OCC detects conflict and aborts safely
mvcc.write(tx2.txId, 'acc_100', { balance: 550 });
try {
  mvcc.commit(tx2.txId);
} catch (err) {
  console.log(err.message); // 'Write-Write conflict on document acc_100. Transaction aborted.'
}
```

---

## Distributed Two-Phase Commit (2PC) in `FlashCluster`

When operations in a transaction span across multiple sharded nodes in a `FlashCluster`, the coordinator orchestrates a full Two-Phase Commit:

```
                  [ FlashDistributedTxCoordinator ]
                             /          \
                     Phase 1: Prepare    Phase 1: Prepare
                           /              \
                     [ Shard US ]     [ Shard EU ]
                           \              /
                     Phase 2: Commit     Phase 2: Commit
```

### Distributed Transaction Example

```javascript
import { FlashCluster, FlashDatabase } from 'flash-zk';

const cluster = new FlashCluster();
cluster.addShard('us_node', new FlashDatabase('us_db', { storagePath: './data/us' }));
cluster.addShard('eu_node', new FlashDatabase('eu_db', { storagePath: './data/eu' }));

const coordinator = cluster.getTxCoordinator();
const dtxId = coordinator.beginTransaction();

// Stage operations on documents located in different shards
coordinator.stageOperation(dtxId, 'accounts', 'user_us_1', 'insert', {
  doc: { _id: 'user_us_1', currency: 'USD', balance: 1000 }
});
coordinator.stageOperation(dtxId, 'accounts', 'user_eu_1', 'insert', {
  doc: { _id: 'user_eu_1', currency: 'EUR', balance: 850 }
});

// Commit across all participating shards atomically
const result = await coordinator.commitTransaction(dtxId);
console.log(result);
// { success: true, state: 'COMMITTED', shards: ['us_node', 'eu_node'] }
```
