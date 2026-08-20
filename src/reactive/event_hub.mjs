/**
 * Unified in-process event bus for collection mutations and custom topics.
 */
export class FlashEventHub {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  subscribe(topic, handler) {
    if (!this._handlers.has(topic)) {
      this._handlers.set(topic, new Set());
    }
    this._handlers.get(topic).add(handler);
    return () => this.unsubscribe(topic, handler);
  }

  unsubscribe(topic, handler) {
    this._handlers.get(topic)?.delete(handler);
  }

  _matchTopics(publishedTopic) {
    const matched = new Set();
    for (const [pattern, handlers] of this._handlers) {
      if (pattern === "*" || pattern === publishedTopic) {
        for (const fn of handlers) matched.add(fn);
        continue;
      }
      if (pattern.endsWith(":*")) {
        const prefix = pattern.slice(0, -1);
        if (publishedTopic.startsWith(prefix)) {
          for (const fn of handlers) matched.add(fn);
        }
      }
    }
    return matched;
  }

  publish(topic, payload) {
    for (const fn of this._matchTopics(topic)) {
      try {
        fn(payload, topic);
      } catch {
        /* subscriber errors must not break writers */
      }
    }
  }
}
