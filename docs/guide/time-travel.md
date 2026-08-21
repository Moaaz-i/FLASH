# Time-Travel & Point-in-Time Recovery (PITR)

**FLASH DB** supports non-blocking historical point-in-time queries through `FlashTimeTravel` by leveraging its immutable version chains in **MVCC** and the **FlashArc (`.farc`)** audit log.

---

## Querying Historical State (`queryAsOf`)

You can query any document as it existed at a past timestamp or historical commit point:

```javascript
import { FlashMVCC, FlashTimeTravel } from '@moaaz-i/flash-db';

const mvcc = new FlashMVCC();
const timeTravel = new FlashTimeTravel(mvcc);

// 1. Transaction 1 at 10:00 AM (Account created with $500)
const tx1 = mvcc.beginTransaction('tx1');
mvcc.write(tx1.txId, 'acc_100', { balance: 500 });
const c1 = mvcc.commit(tx1.txId);
timeTravel.recordCommit(c1.commitTs, new Date('2026-08-16T10:00:00Z').getTime());

// 2. Transaction 2 at 11:00 AM (Balance updated to $950)
const tx2 = mvcc.beginTransaction('tx2');
mvcc.write(tx2.txId, 'acc_100', { balance: 950 });
const c2 = mvcc.commit(tx2.txId);
timeTravel.recordCommit(c2.commitTs, new Date('2026-08-16T11:00:00Z').getTime());

// 3. Time-Travel Query: What was the balance at 10:30 AM?
const pastDoc = timeTravel.queryAsOf('acc_100', new Date('2026-08-16T10:30:00Z'));
console.log(pastDoc.balance); // 500!
```
