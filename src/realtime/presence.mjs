import { EventEmitter } from 'node:events';

export class FlashPresence extends EventEmitter {
  constructor(options = {}) {
    super();
    this._users = new Map();
    this._heartbeatTimeout = options.heartbeatTimeout || 10000;
    this._cleanupInterval = options.cleanupInterval || 5000;
    this._cleanupTimer = null;
    this._startCleanup();
  }

  _startCleanup() {
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [userId, info] of this._users) {
        if (now - info.lastSeen > this._heartbeatTimeout) {
          info.status = 'offline';
          this.emit('offline', userId, info);
          this._users.delete(userId);
        }
      }
    }, this._cleanupInterval);
  }

  track(userId, meta = {}) {
    const existing = this._users.get(userId);
    const info = {
      userId,
      status: 'online',
      lastSeen: Date.now(),
      connections: (existing?.connections || 0) + 1,
      meta: { ...existing?.meta, ...meta }
    };
    this._users.set(userId, info);
    if (!existing || existing.status === 'offline') {
      this.emit('online', userId, info);
    }
    return info;
  }

  heartbeat(userId) {
    const info = this._users.get(userId);
    if (info) {
      info.lastSeen = Date.now();
      info.status = 'online';
    }
  }

  disconnect(userId) {
    const info = this._users.get(userId);
    if (!info) return;
    info.connections -= 1;
    if (info.connections <= 0) {
      info.status = 'offline';
      info.lastSeen = Date.now();
      this.emit('offline', userId, info);
      this._users.delete(userId);
    }
  }

  setStatus(userId, status) {
    const info = this._users.get(userId);
    if (info) {
      info.status = status;
      info.lastSeen = Date.now();
      this.emit('status', userId, status, info);
    }
  }

  isOnline(userId) {
    const info = this._users.get(userId);
    return info ? info.status !== 'offline' : false;
  }

  getStatus(userId) {
    const info = this._users.get(userId);
    return info ? info.status : 'offline';
  }

  getOnlineUsers() {
    const result = [];
    for (const [userId, info] of this._users) {
      if (info.status !== 'offline') {
        result.push({ userId, status: info.status, lastSeen: info.lastSeen, meta: info.meta });
      }
    }
    return result;
  }

  getOnlineCount() {
    let count = 0;
    for (const [, info] of this._users) {
      if (info.status !== 'offline') count++;
    }
    return count;
  }

  get(userId) {
    return this._users.get(userId) || null;
  }

  getAll() {
    return Array.from(this._users.values());
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    this._users.clear();
  }
}
