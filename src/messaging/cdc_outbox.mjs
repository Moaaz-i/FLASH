/**
 * FLASH Change Data Capture & Transactional Outbox (FlashCDC)
 * Reliably captures database change events for streaming into Kafka, RabbitMQ, or Webhooks.
 */
export class FlashCDC {
  constructor() {
    // Array of { id: string, collection: string, op: 'INSERT'|'UPDATE'|'DELETE', docId: string, payload: object, timestamp: number, status: 'PENDING'|'PUBLISHED' }
    this.outbox = [];
    this.listeners = new Set();
  }

  /**
   * Records a change event in the transactional outbox table
   */
  recordChange(collection, op, docId, payload = {}) {
    const event = {
      id: `cdc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      collection,
      op,
      docId: String(docId),
      payload,
      timestamp: Date.now(),
      status: 'PENDING'
    };

    this.outbox.push(event);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[FlashCDC] Listener error:', err.message);
      }
    }

    return event;
  }

  /**
   * Polls unhandled CDC events in batches
   * @param {number} [batchSize=100]
   */
  pollPending(batchSize = 100) {
    const pending = this.outbox.filter(e => e.status === 'PENDING').slice(0, batchSize);
    return pending;
  }

  /**
   * Acknowledges that events have been streamed to message broker
   * @param {string[]} eventIds
   */
  ackEvents(eventIds) {
    const idSet = new Set(eventIds);
    for (const e of this.outbox) {
      if (idSet.has(e.id)) {
        e.status = 'PUBLISHED';
      }
    }
  }

  /**
   * Subscribes a listener to real-time CDC events
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
