# Distributed Scaling, Locks, Pub/Sub & CDC

**FLASH DB** provides high-concurrency cloud utilities for distributed architectures.

---

## 1. Distributed Locks (`FlashDistributedLock`)

```javascript
import { FlashDistributedLock } from 'flash-zk';

const dlock = new FlashDistributedLock();
const lock = dlock.acquire('monthly_billing_job', 'worker_node_1', 10000); // 10s TTL

if (lock.acquired) {
  // Perform exclusive task
  dlock.release('monthly_billing_job', lock.leaseToken);
}
```

---

## 2. Change Data Capture & Outbox (`FlashCDC`)

Reliably stream database mutations to Apache Kafka, RabbitMQ, or Webhooks:

```javascript
import { FlashCDC } from 'flash-zk';

const cdc = new FlashCDC();

// Subscribe to real-time events
cdc.subscribe((event) => {
  console.log(`[CDC] ${event.op} on ${event.collection} - Doc ${event.docId}`);
});

// Record mutation in transaction
cdc.recordChange('orders', 'INSERT', 'ord_123', { amount: 200 });
```

---

## 3. Streaming Pub/Sub (`FlashPubSub`)

```javascript
import { FlashPubSub } from 'flash-zk';

const pubsub = new FlashPubSub();
pubsub.subscribe('notifications', 'user_client', (msg, ack) => {
  console.log(msg.message);
  ack();
});

pubsub.publish('notifications', { text: 'Your invoice is ready' });
```

---

## 4. Multi-Database Federation (`FlashFederation`)

```javascript
import { FlashFederation, FlashDatabase } from 'flash-zk';

const fed = new FlashFederation();
fed.registerMember('us_cluster', new FlashDatabase('db_us', { storagePath: './data_us' }));
fed.registerMember('eu_cluster', new FlashDatabase('db_eu', { storagePath: './data_eu' }));

// Query across all federated clusters in parallel
const allItems = await fed.federatedFind('products', { inStock: true });
```
