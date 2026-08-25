# ACID Multi-Document Transactions

For mission-critical fintech, banking, and inventory systems, FLASH DB provides **ACID multi-document transactions** with session isolation and atomic rollback.

---

## Transaction Lifecycle

```javascript
import { FlashClient } from 'flash-zk';

const client = new FlashClient({ storagePath: "./flash_data" });
const accounts = client.collection('accounts');
const ledger = client.collection('audit_ledger');

// 1. Start a Client Session
const session = client.startSession();

try {
  // 2. Begin Transaction
  session.startTransaction();

  // Stage operation 1: Deduct from Alice
  session.stagedOperations.push({
    collectionName: 'accounts',
    type: 'insert',
    doc: { _id: 'acc_alice', balance: 4500 }
  });

  // Stage operation 2: Add to Bob
  session.stagedOperations.push({
    collectionName: 'accounts',
    type: 'insert',
    doc: { _id: 'acc_bob', balance: 2500 }
  });

  // Stage operation 3: Log to audit ledger
  session.stagedOperations.push({
    collectionName: 'audit_ledger',
    type: 'insert',
    doc: { action: 'TRANSFER', amount: 500, timestamp: Date.now() }
  });

  // 3. Commit all changes atomically
  await session.commitTransaction();
  console.log('Transaction committed successfully!');
} catch (error) {
  // 4. Rollback in case of any error
  await session.abortTransaction();
  console.error('Transaction aborted and rolled back:', error);
}
```
