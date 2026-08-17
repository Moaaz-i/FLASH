class LRUNode {
  constructor(key, value, ttl) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
    this.createdAt = Date.now();
    this.ttl = ttl || 0;
    this.accessedAt = Date.now();
  }

  get expired() {
    return this.ttl > 0 && (Date.now() - this.createdAt) > this.ttl;
  }
}

export class FlashLRUCache {
  constructor(options = {}) {
    this._maxSize = options.maxSize || 1000;
    this._defaultTTL = options.defaultTTL || 0;
    this._head = null;
    this._tail = null;
    this._map = new Map();
    this._stats = { hits: 0, misses: 0, evictions: 0, sets: 0, deletes: 0 };
    this._cleanupInterval = options.cleanupInterval || 60000;
    this._cleanupTimer = null;

    if (this._cleanupInterval > 0) {
      this._cleanupTimer = setInterval(() => this._cleanup(), this._cleanupInterval);
    }
  }

  _moveToFront(node) {
    if (node === this._head) return;
    this._detach(node);
    this._attachFront(node);
  }

  _detach(node) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this._head) this._head = node.next;
    if (node === this._tail) this._tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  _attachFront(node) {
    node.next = this._head;
    node.prev = null;
    if (this._head) this._head.prev = node;
    this._head = node;
    if (!this._tail) this._tail = node;
  }

  _evict() {
    if (!this._tail) return;
    const node = this._tail;
    this._detach(node);
    this._map.delete(node.key);
    this._stats.evictions++;
  }

  _cleanup() {
    for (const [key, node] of this._map) {
      if (node.expired) {
        this._detach(node);
        this._map.delete(key);
      }
    }
  }

  set(key, value, ttl) {
    const effectiveTTL = ttl || this._defaultTTL;
    const existing = this._map.get(key);

    if (existing) {
      existing.value = value;
      existing.ttl = effectiveTTL;
      existing.createdAt = Date.now();
      existing.accessedAt = Date.now();
      this._moveToFront(existing);
      this._stats.sets++;
      return;
    }

    if (this._map.size >= this._maxSize) {
      this._evict();
    }

    const node = new LRUNode(key, value, effectiveTTL);
    this._map.set(key, node);
    this._attachFront(node);
    this._stats.sets++;
  }

  get(key) {
    const node = this._map.get(key);
    if (!node) {
      this._stats.misses++;
      return undefined;
    }

    if (node.expired) {
      this._detach(node);
      this._map.delete(key);
      this._stats.misses++;
      return undefined;
    }

    node.accessedAt = Date.now();
    this._moveToFront(node);
    this._stats.hits++;
    return node.value;
  }

  has(key) {
    const node = this._map.get(key);
    if (!node) return false;
    if (node.expired) {
      this._detach(node);
      this._map.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    const node = this._map.get(key);
    if (!node) return false;
    this._detach(node);
    this._map.delete(key);
    this._stats.deletes++;
    return true;
  }

  peek(key) {
    const node = this._map.get(key);
    if (!node || node.expired) return undefined;
    return node.value;
  }

  keys() {
    const result = [];
    let current = this._head;
    while (current) {
      if (!current.expired) result.push(current.key);
      current = current.next;
    }
    return result;
  }

  values() {
    const result = [];
    let current = this._head;
    while (current) {
      if (!current.expired) result.push(current.value);
      current = current.next;
    }
    return result;
  }

  entries() {
    const result = [];
    let current = this._head;
    while (current) {
      if (!current.expired) result.push([current.key, current.value]);
      current = current.next;
    }
    return result;
  }

  clear() {
    this._head = null;
    this._tail = null;
    this._map.clear();
  }

  get size() {
    let count = 0;
    for (const [, node] of this._map) {
      if (!node.expired) count++;
    }
    return count;
  }

  get stats() {
    return { ...this._stats, size: this.size, maxSize: this._maxSize };
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    this.clear();
  }
}
