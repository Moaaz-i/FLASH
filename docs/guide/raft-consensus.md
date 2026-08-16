# Raft Consensus & High-Availability Replication

**FLASH DB** implements the **Raft Consensus Protocol** (`FlashRaft`) for fault-tolerant state machine replication, leader election, and automatic failover across distributed database clusters.

---

## Raft State Machine

Each node in a cluster operates in one of three states:
1. **Follower**: Responds to heartbeats and log entries from the Leader.
2. **Candidate**: Starts an election round if leader heartbeats timeout.
3. **Leader**: Manages all write operations and replicates entries to majority quorum.

```
+------------+   Election Timeout   +-------------+   Majority Votes   +----------+
|  FOLLOWER  | -------------------> |  CANDIDATE  | -----------------> |  LEADER  |
+------------+                      +-------------+                    +----------+
```

---

## Example Usage

```javascript
import { FlashRaft } from 'flash-db';

// Initialize 3-node cluster
const node1 = new FlashRaft('node_us_1', ['node_us_2', 'node_us_3']);

// Start Leader Election
const election = node1.startElection();
if (election.elected) {
  console.log(`Node 1 elected Leader for Term ${election.term}!`);

  // Replicate write commands to quorum
  const rep = node1.replicate({
    collection: 'orders',
    action: 'INSERT',
    doc: { _id: 'ord_100', total: 450 }
  });

  console.log(`Log Index committed: ${rep.logIndex}`);
}
```
