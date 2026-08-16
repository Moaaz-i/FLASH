/**
 * FLASH Time-Travel & Point-in-Time Recovery Engine (FlashTimeTravel)
 * Allows executing historical snapshot queries as of any timestamp in the past.
 */
export class FlashTimeTravel {
  /**
   * @param {import('../transactions/mvcc.mjs').FlashMVCC} mvccInstance
   */
  constructor(mvccInstance) {
    this.mvcc = mvccInstance;
    // Commit log index: timestamp -> commitTs
    this.timestampIndex = [];
  }

  /**
   * Records a timestamp mapping for a transaction commit
   * @param {number} commitTs
   * @param {number} [timestamp]
   */
  recordCommit(commitTs, timestamp = Date.now()) {
    this.timestampIndex.push({ commitTs, timestamp });
  }

  /**
   * Finds the highest commitTs active on or before a given Date/timestamp
   * @param {number|Date} asOf
   * @returns {number}
   */
  getCommitTsForTime(asOf) {
    const targetMs = asOf instanceof Date ? asOf.getTime() : Number(asOf);
    let matchedTs = 1;

    for (const entry of this.timestampIndex) {
      if (entry.timestamp <= targetMs) {
        matchedTs = entry.commitTs;
      } else {
        break;
      }
    }

    return matchedTs;
  }

  /**
   * Queries a document as it existed at a specific historical timestamp
   * @param {string} docId
   * @param {number|Date} asOf
   * @returns {object|null}
   */
  queryAsOf(docId, asOf) {
    const targetCommitTs = this.getCommitTsForTime(asOf);
    const chain = this.mvcc.versions.get(docId);
    if (!chain || chain.length === 0) return null;

    for (let i = chain.length - 1; i >= 0; i--) {
      const ver = chain[i];
      if (ver.commitTs <= targetCommitTs) {
        return ver.deleted ? null : { ...ver.doc, _v: ver.version, _asOfTs: ver.commitTs };
      }
    }

    return null;
  }
}
