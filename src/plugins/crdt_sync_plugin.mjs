import crypto from 'node:crypto';

/**
 * FLASH Multi-Master Conflict-Free Replicated Data Type (FlashCRDTSync)
 * Last-Write-Wins Element-Set (LWW-Element-Set) CRDT for active-active distributed replication
 */
export class FlashCRDTSync {
  constructor(nodeId = crypto.randomUUID()) {
    this.nodeId = nodeId;
    // docId -> { doc, timestamp, nodeId, isTombstone }
    this.state = new Map();
  }

  /**
   * Applies a local state change with high-resolution monotonic timestamp
   */
  setLocal(docId, doc, isTombstone = false) {
    const entry = {
      docId,
      doc,
      timestamp: Date.now() * 1000 + Math.floor(performance.now() % 1000),
      nodeId: this.nodeId,
      isTombstone
    };
    this.state.set(docId, entry);
    return entry;
  }

  /**
   * Merges remote delta state from another master node
   * Resolves conflicts deterministically using (timestamp, nodeId) tie-breaking
   */
  mergeRemoteDelta(remoteEntry) {
    const local = this.state.get(remoteEntry.docId);
    if (!local) {
      this.state.set(remoteEntry.docId, remoteEntry);
      return { applied: true, winner: 'remote' };
    }

    // Deterministic tie-breaking: Higher timestamp wins; if equal, higher nodeId wins
    const isRemoteNewer = (remoteEntry.timestamp > local.timestamp) ||
      (remoteEntry.timestamp === local.timestamp && remoteEntry.nodeId > local.nodeId);

    if (isRemoteNewer) {
      this.state.set(remoteEntry.docId, remoteEntry);
      return { applied: true, winner: 'remote' };
    }

    return { applied: false, winner: 'local' };
  }

  /**
   * Returns active non-tombstoned documents
   */
  getActiveDocuments() {
    const docs = [];
    for (const entry of this.state.values()) {
      if (!entry.isTombstone && entry.doc) {
        docs.push(entry.doc);
      }
    }
    return docs;
  }
}
