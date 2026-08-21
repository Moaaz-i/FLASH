# Zero-Knowledge Distributed Sharding

Scale FLASH DB horizontally across multiple physical or logical nodes using a **Consistent Hashing Ring with Virtual Nodes**.

---

## 1. Setting Up a Cluster Ring

```javascript
import { FlashCluster, FlashDatabase } from '@moaaz-i/flash-db';

// Initialize Cluster with 64 Virtual Nodes per Shard
const cluster = new FlashCluster({ virtualNodes: 64 });

// Add regional shards
const shardEast = new FlashDatabase('shard_us_east', { storagePath: './data/east' });
const shardWest = new FlashDatabase('shard_us_west', { storagePath: './data/west' });
const shardEU   = new FlashDatabase('shard_eu_central', { storagePath: './data/eu' });

cluster.addShard('shard_us_east', shardEast);
cluster.addShard('shard_us_west', shardWest);
cluster.addShard('shard_eu_central', shardEU);
```

---

## 2. Deterministic Key Partitioning

Documents are partitioned deterministically across the ring without any central coordinator bottleneck:

```javascript
// Automatically finds target shard for user ID
const { shardId, db } = cluster.getShardForKey('user_uuid_1049');

console.log('Target Shard:', shardId); // 'shard_us_east'
const userCol = db.collection('users');
```
