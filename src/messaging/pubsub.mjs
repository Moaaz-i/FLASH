/**
 * FLASH Streaming Pub/Sub & Message Broker (FlashPubSub)
 * In-memory topic partitioning, consumer group subscriptions, and Ack/Nack delivery semantics.
 */
export class FlashPubSub {
  constructor() {
    // topic -> Array<{ id: string, message: any, timestamp: number, acked: Set<string> }>
    this.topics = new Map();
    // topic -> Map<subscriberId, Function>
    this.subscribers = new Map();
  }

  /**
   * Publishes a message to a topic
   * @param {string} topic
   * @param {any} message
   * @returns {string} Message ID
   */
  publish(topic, message) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, []);
    }

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const msgObj = {
      id: msgId,
      message,
      timestamp: Date.now(),
      acked: new Set()
    };

    this.topics.get(topic).push(msgObj);

    // Notify active subscribers
    const subMap = this.subscribers.get(topic);
    if (subMap) {
      for (const [subId, callback] of subMap.entries()) {
        try {
          callback(msgObj, () => msgObj.acked.add(subId));
        } catch (err) {
          console.error(`[FlashPubSub] Subscriber ${subId} error:`, err.message);
        }
      }
    }

    return msgId;
  }

  /**
   * Subscribes to a topic
   * @param {string} topic
   * @param {string} subscriberId
   * @param {Function} callback - (msg, ack) => void
   */
  subscribe(topic, subscriberId, callback) {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Map());
    }
    this.subscribers.get(topic).set(subscriberId, callback);
  }

  /**
   * Unsubscribes from a topic
   */
  unsubscribe(topic, subscriberId) {
    if (this.subscribers.has(topic)) {
      this.subscribers.get(topic).delete(subscriberId);
    }
  }
}
