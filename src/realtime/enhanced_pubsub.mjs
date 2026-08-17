import { EventEmitter } from 'node:events';

class PubSubMessage {
  constructor(topic, payload, options = {}) {
    this.id = options.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.topic = topic;
    this.payload = payload;
    this.timestamp = Date.now();
    this.ttl = options.ttl || 0;
    this.retryCount = 0;
    this.maxRetries = options.maxRetries || 3;
    this.status = 'pending';
  }

  get expired() {
    return this.ttl > 0 && (Date.now() - this.timestamp) > this.ttl;
  }
}

export class FlashEnhancedPubSub extends EventEmitter {
  constructor(options = {}) {
    super();
    this._topics = new Map();
    this._wildcardSubscribers = [];
    this._history = new Map();
    this._deadLetter = [];
    this._maxHistory = options.maxHistory || 1000;
    this._maxRetries = options.maxRetries || 3;
    this._messageHandlers = new Map();
  }

  publish(topic, payload, options = {}) {
    const msg = new PubSubMessage(topic, payload, { ...options, maxRetries: this._maxRetries });

    this._storeHistory(topic, msg);
    this._deliverToSubscribers(topic, msg);
    this._deliverToWildcards(topic, msg);

    this.emit('publish', msg);
    return msg.id;
  }

  subscribe(topic, subscriberId, callback) {
    if (!this._topics.has(topic)) {
      this._topics.set(topic, new Map());
    }
    this._topics.get(topic).set(subscriberId, callback);
    return this;
  }

  subscribeWildcard(pattern, subscriberId, callback) {
    this._wildcardSubscribers.push({ pattern, subscriberId, callback });
    return this;
  }

  unsubscribe(topic, subscriberId) {
    const subs = this._topics.get(topic);
    if (subs) {
      subs.delete(subscriberId);
      if (subs.size === 0) this._topics.delete(topic);
    }
    return this;
  }

  unsubscribeAll(subscriberId) {
    for (const [topic, subs] of this._topics) {
      subs.delete(subscriberId);
      if (subs.size === 0) this._topics.delete(topic);
    }
    this._wildcardSubscribers = this._wildcardSubscribers.filter(s => s.subscriberId !== subscriberId);
  }

  _deliverToSubscribers(topic, msg) {
    const subs = this._topics.get(topic);
    if (!subs) return;

    for (const [subscriberId, callback] of subs) {
      if (msg.expired) continue;
      try {
        callback(msg, (ack = true) => {
          if (ack) {
            msg.status = 'delivered';
          } else {
            this._retryOrDeadLetter(msg);
          }
        });
      } catch {
        this._retryOrDeadLetter(msg);
      }
    }
  }

  _deliverToWildcards(topic, msg) {
    for (const { pattern, callback } of this._wildcardSubscribers) {
      if (msg.expired) continue;
      if (this._matchPattern(pattern, topic)) {
        try {
          callback(msg, () => {});
        } catch {}
      }
    }
  }

  _matchPattern(pattern, topic) {
    const regexStr = '^' + pattern.replace(/\*/g, '[^.]+').replace(/\./g, '\\.') + '$';
    return new RegExp(regexStr).test(topic);
  }

  _retryOrDeadLetter(msg) {
    msg.retryCount++;
    if (msg.retryCount < msg.maxRetries) {
      setTimeout(() => {
        this._deliverToSubscribers(msg.topic, msg);
      }, 1000 * msg.retryCount);
    } else {
      msg.status = 'dead';
      this._deadLetter.push(msg);
      this.emit('dead-letter', msg);
    }
  }

  _storeHistory(topic, msg) {
    if (!this._history.has(topic)) {
      this._history.set(topic, []);
    }
    const history = this._history.get(topic);
    history.push(msg);
    if (history.length > this._maxHistory) {
      history.shift();
    }
  }

  getHistory(topic, limit = 50) {
    const history = this._history.get(topic) || [];
    return history.slice(-limit);
  }

  getDeadLetter() {
    return [...this._deadLetter];
  }

  retryDeadLetter(msgId) {
    const idx = this._deadLetter.findIndex(m => m.id === msgId);
    if (idx === -1) return false;
    const msg = this._deadLetter.splice(idx, 1)[0];
    msg.status = 'pending';
    msg.retryCount = 0;
    this._deliverToSubscribers(msg.topic, msg);
    return true;
  }

  clearHistory(topic) {
    if (topic) {
      this._history.delete(topic);
    } else {
      this._history.clear();
    }
  }

  getTopics() {
    return Array.from(this._topics.keys());
  }

  getSubscriberCount(topic) {
    const subs = this._topics.get(topic);
    return subs ? subs.size : 0;
  }

  destroy() {
    this._topics.clear();
    this._wildcardSubscribers = [];
    this._history.clear();
    this._deadLetter = [];
    this.removeAllListeners();
  }
}
