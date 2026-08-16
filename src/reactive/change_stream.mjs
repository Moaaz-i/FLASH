import { EventEmitter } from 'node:events';

/**
 * FLASH Reactive Change Stream (FlashChangeStream)
 * Provides real-time reactive event subscriptions on database mutations
 */
export class FlashChangeStream extends EventEmitter {
  /**
   * @param {object} [filter={}] - Predicate filter for emitted changes
   * @param {Function} [onClose]
   */
  constructor(filter = {}, onClose = null) {
    super();
    this.filter = filter;
    this.onClose = onClose;
    this.isOpen = true;
  }

  /**
   * Evaluates change and emits to listeners if matching filter
   * @param {'insert'|'update'|'delete'} operationType
   * @param {object} doc - Decrypted document or { _id }
   */
  emitChange(operationType, doc) {
    if (!this.isOpen || !doc) return;

    // Check filter match
    if (this.filter && Object.keys(this.filter).length > 0) {
      for (const [k, v] of Object.entries(this.filter)) {
        if (doc[k] !== v) return; // Skip non-matching
      }
    }

    const changeEvent = {
      operationType,
      doc,
      id: doc._id,
      timestamp: Date.now()
    };

    this.emit('change', changeEvent);
    this.emit(operationType, changeEvent);
  }

  close() {
    this.isOpen = false;
    this.removeAllListeners();
    if (this.onClose) this.onClose(this);
  }
}
