import { EventEmitter } from 'node:events';

/**
 * Oplog-backed change stream with resume tokens.
 */
export class FlashChangeStream extends EventEmitter {
  /**
   * @param {object} [filter={}]
   * @param {Function} [onClose]
   * @param {object} [options]
   * @param {import('../engine/oplog.mjs').FlashOplog} [options.oplog]
   * @param {string} [options.collectionName]
   * @param {number} [options.startAfterSeq=0]
   */
  constructor(filter = {}, onClose = null, options = {}) {
    super();
    this.filter = filter;
    this.onClose = onClose;
    this.oplog = options.oplog || null;
    this.collectionName = options.collectionName || null;
    this.lastSeq = options.startAfterSeq || 0;
    this.isOpen = true;
    this._pollTimer = null;

    if (this.oplog) {
      this._pollTimer = setInterval(() => this._pollOplog(), 250);
    }
  }

  async _pollOplog() {
    if (!this.isOpen || !this.oplog) return;
    const events = await this.oplog.readFrom(this.lastSeq);
    for (const evt of events) {
      if (this.collectionName && evt.collection !== this.collectionName) continue;
      this.lastSeq = evt.seq;
      this.emit('change', {
        operationType: evt.operationType,
        doc: { _id: evt.docId },
        id: evt.docId,
        timestamp: evt.timestamp,
        resumeToken: evt.resumeToken
      });
    }
  }

  emitChange(operationType, doc, resumeToken = null) {
    if (!this.isOpen || !doc) return;

    if (this.filter && Object.keys(this.filter).length > 0) {
      for (const [k, v] of Object.entries(this.filter)) {
        if (doc[k] !== v) return;
      }
    }

    const changeEvent = {
      operationType,
      doc,
      id: doc._id,
      timestamp: Date.now(),
      resumeToken: resumeToken || `${Date.now()}:${doc._id}`
    };

    this.emit('change', changeEvent);
    this.emit(operationType, changeEvent);
  }

  getResumeToken() {
    return `${this.lastSeq}`;
  }

  close() {
    this.isOpen = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this.removeAllListeners();
    if (this.onClose) this.onClose(this);
  }
}
