/**
 * FLASH Multi-Version Concurrency Control Engine (FlashMVCC)
 * Implements Snapshot Isolation and Optimistic Concurrency Control (OCC)
 * Non-blocking reads, version timestamping, and deterministic write conflict detection.
 */

export class FlashMVCC {
  constructor() {
    // docId -> Array<{ version: number, txId: string, doc: object, deleted: boolean, commitTs: number }>
    this.versions = new Map();
    // Global transaction sequence counter
    this.globalTs = 1;
    // Active transactions: txId -> { readTs: number, writes: Map<string, object>, status: 'active'|'committed'|'aborted' }
    this.activeTransactions = new Map();
  }

  /**
   * Begins a new transaction with a snapshot read timestamp
   * @param {string} [txId]
   * @returns {{ txId: string, readTs: number }}
   */
  beginTransaction(txId = null) {
    const transactionId = txId || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const readTs = this.globalTs;
    
    this.activeTransactions.set(transactionId, {
      txId: transactionId,
      readTs,
      writes: new Map(), // docId -> { doc: object, deleted: boolean }
      status: 'active'
    });

    return { txId: transactionId, readTs };
  }

  /**
   * Reads a document version visible at the transaction's read timestamp (Snapshot Isolation)
   * @param {string} txId
   * @param {string} docId
   * @returns {object|null}
   */
  read(txId, docId) {
    const tx = this.activeTransactions.get(txId);
    if (!tx || tx.status !== 'active') {
      throw new Error(`Transaction ${txId} is not active`);
    }

    // 1. Check local writes within current transaction
    if (tx.writes.has(docId)) {
      const localWrite = tx.writes.get(docId);
      return localWrite.deleted ? null : { ...localWrite.doc };
    }

    // 2. Scan version chain for highest commitTs <= tx.readTs
    const chain = this.versions.get(docId);
    if (!chain || chain.length === 0) return null;

    for (let i = chain.length - 1; i >= 0; i--) {
      const ver = chain[i];
      if (ver.commitTs <= tx.readTs) {
        return ver.deleted ? null : { ...ver.doc, _v: ver.version };
      }
    }

    return null;
  }

  /**
   * Stages a write (insert or update) in the transaction workspace
   * @param {string} txId
   * @param {string} docId
   * @param {object} doc
   */
  write(txId, docId, doc) {
    const tx = this.activeTransactions.get(txId);
    if (!tx || tx.status !== 'active') {
      throw new Error(`Transaction ${txId} is not active`);
    }
    tx.writes.set(docId, { doc, deleted: false });
  }

  /**
   * Stages a delete in the transaction workspace
   * @param {string} txId
   * @param {string} docId
   */
  delete(txId, docId) {
    const tx = this.activeTransactions.get(txId);
    if (!tx || tx.status !== 'active') {
      throw new Error(`Transaction ${txId} is not active`);
    }
    tx.writes.set(docId, { doc: null, deleted: true });
  }

  /**
   * Commits the transaction, performing OCC conflict validation
   * @param {string} txId
   * @returns {{ success: boolean, commitTs: number }}
   */
  commit(txId) {
    const tx = this.activeTransactions.get(txId);
    if (!tx || tx.status !== 'active') {
      throw new Error(`Transaction ${txId} is not active`);
    }

    // OCC Conflict Detection: Verify no doc modified by tx has been committed with commitTs > tx.readTs
    for (const [docId] of tx.writes.entries()) {
      const chain = this.versions.get(docId);
      if (chain && chain.length > 0) {
        const latest = chain[chain.length - 1];
        if (latest.commitTs > tx.readTs) {
          tx.status = 'aborted';
          this.activeTransactions.delete(txId);
          throw new Error(`Write-Write conflict on document ${docId}. Transaction aborted.`);
        }
      }
    }

    // Assign new commit timestamp
    const commitTs = ++this.globalTs;

    // Apply writes to version chains
    for (const [docId, writeOp] of tx.writes.entries()) {
      let chain = this.versions.get(docId);
      if (!chain) {
        chain = [];
        this.versions.set(docId, chain);
      }

      const nextVersion = chain.length > 0 ? chain[chain.length - 1].version + 1 : 1;
      chain.push({
        version: nextVersion,
        txId,
        doc: writeOp.doc,
        deleted: writeOp.deleted,
        commitTs
      });
    }

    tx.status = 'committed';
    this.activeTransactions.delete(txId);
    return { success: true, commitTs };
  }

  /**
   * Aborts and rolls back the transaction
   * @param {string} txId
   */
  abort(txId) {
    const tx = this.activeTransactions.get(txId);
    if (tx) {
      tx.status = 'aborted';
      this.activeTransactions.delete(txId);
    }
  }

  /**
   * Garbage collection: removes obsolete versions older than oldest active readTs
   */
  vacuum() {
    let oldestActiveTs = this.globalTs;
    for (const tx of this.activeTransactions.values()) {
      if (tx.readTs < oldestActiveTs) {
        oldestActiveTs = tx.readTs;
      }
    }

    for (const [docId, chain] of this.versions.entries()) {
      if (chain.length <= 1) continue;
      // Keep versions visible to oldest active transaction, plus the one immediately preceding
      let keepIdx = 0;
      for (let i = 0; i < chain.length; i++) {
        if (chain[i].commitTs <= oldestActiveTs) {
          keepIdx = i;
        } else {
          break;
        }
      }
      if (keepIdx > 0) {
        this.versions.set(docId, chain.slice(keepIdx));
      }
    }
  }
}
