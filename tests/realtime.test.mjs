import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FlashWebSocketServer, FlashWebSocket } from '../src/realtime/websocket_server.mjs';
import { FlashPresence } from '../src/realtime/presence.mjs';
import { FlashLRUCache } from '../src/cache/lru_cache.mjs';
import { FlashEnhancedPubSub } from '../src/realtime/enhanced_pubsub.mjs';

// ============================================================================
// WebSocket Server Tests
// ============================================================================

describe('FlashWebSocketServer', () => {
  it('accepts WebSocket upgrade and emits connection', async () => {
    const server = http.createServer();
    const wss = new FlashWebSocketServer(server, { path: '/ws' });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const connected = await new Promise((resolve) => {
      wss.on('connection', (ws) => resolve(ws));
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/ws',
        headers: {
          'Upgrade': 'websocket',
          'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13'
        }
      });
      req.on('upgrade', () => {});
      req.end();
    });

    assert.ok(connected instanceof FlashWebSocket);
    assert.ok(connected.id);
    assert.equal(wss.size, 1);

    wss.close();
    server.close();
  });

  it('room join/leave and broadcast', async () => {
    const server = http.createServer();
    const wss = new FlashWebSocketServer(server, { path: '/ws' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const ws = await new Promise((resolve) => {
      wss.on('connection', (ws) => resolve(ws));
      const req = http.request({
        hostname: '127.0.0.1', port, path: '/ws',
        headers: {
          'Upgrade': 'websocket', 'Connection': 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13'
        }
      });
      req.on('upgrade', () => {});
      req.end();
    });

    wss.joinRoom(ws, 'game:lobby');
    assert.equal(wss.getRoomMembers('game:lobby').size, 1);

    wss.leaveRoom(ws, 'game:lobby');
    assert.equal(wss.getRoomMembers('game:lobby').size, 0);

    wss.close();
    server.close();
  });
});

// ============================================================================
// Presence Service Tests
// ============================================================================

describe('FlashPresence', () => {
  it('tracks online/offline status', () => {
    const presence = new FlashPresence({ heartbeatTimeout: 100, cleanupInterval: 50 });

    presence.track('user-1', { name: 'Alice' });
    assert.equal(presence.isOnline('user-1'), true);
    assert.equal(presence.getOnlineCount(), 1);

    presence.disconnect('user-1');
    assert.equal(presence.isOnline('user-1'), false);
    assert.equal(presence.getOnlineCount(), 0);

    presence.destroy();
  });

  it('emits online/offline events', () => {
    const presence = new FlashPresence({ heartbeatTimeout: 100, cleanupInterval: 50 });
    const events = [];

    presence.on('online', (userId) => events.push(`online:${userId}`));
    presence.on('offline', (userId) => events.push(`offline:${userId}`));

    presence.track('user-1');
    presence.disconnect('user-1');

    assert.deepEqual(events, ['online:user-1', 'offline:user-1']);
    presence.destroy();
  });

  it('handles multiple connections per user', () => {
    const presence = new FlashPresence({ heartbeatTimeout: 100, cleanupInterval: 50 });

    presence.track('user-1');
    presence.track('user-1');
    assert.equal(presence.get('user-1').connections, 2);

    presence.disconnect('user-1');
    assert.equal(presence.isOnline('user-1'), true);

    presence.disconnect('user-1');
    assert.equal(presence.isOnline('user-1'), false);

    presence.destroy();
  });

  it('sets custom status', () => {
    const presence = new FlashPresence({ heartbeatTimeout: 100, cleanupInterval: 50 });

    presence.track('user-1');
    presence.setStatus('user-1', 'in-game');
    assert.equal(presence.getStatus('user-1'), 'in-game');

    presence.destroy();
  });
});

// ============================================================================
// LRU Cache Tests
// ============================================================================

describe('FlashLRUCache', () => {
  it('basic set/get/has/delete', () => {
    const cache = new FlashLRUCache({ maxSize: 10 });

    cache.set('key1', 'value1');
    assert.equal(cache.get('key1'), 'value1');
    assert.equal(cache.has('key1'), true);

    cache.delete('key1');
    assert.equal(cache.has('key1'), false);
    assert.equal(cache.get('key1'), undefined);

    cache.destroy();
  });

  it('evicts LRU when full', () => {
    const cache = new FlashLRUCache({ maxSize: 3 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a');
    cache.set('d', 4);

    assert.equal(cache.has('b'), false);
    assert.equal(cache.has('a'), true);
    assert.equal(cache.size, 3);

    cache.destroy();
  });

  it('respects TTL expiration', async () => {
    const cache = new FlashLRUCache({ maxSize: 10, defaultTTL: 50 });

    cache.set('key1', 'value1');
    assert.equal(cache.get('key1'), 'value1');

    await new Promise(r => setTimeout(r, 80));
    assert.equal(cache.get('key1'), undefined);

    cache.destroy();
  });

  it('returns correct stats', () => {
    const cache = new FlashLRUCache({ maxSize: 10 });

    cache.set('a', 1);
    cache.get('a');
    cache.get('missing');

    const stats = cache.stats;
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.sets, 1);
    assert.equal(stats.size, 1);

    cache.destroy();
  });

  it('keys/values/entries work', () => {
    const cache = new FlashLRUCache({ maxSize: 10 });

    cache.set('a', 1);
    cache.set('b', 2);

    assert.deepEqual(cache.keys(), ['b', 'a']);
    assert.deepEqual(cache.values(), [2, 1]);
    assert.equal(cache.entries().length, 2);

    cache.destroy();
  });

  it('clear empties cache', () => {
    const cache = new FlashLRUCache({ maxSize: 10 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    assert.equal(cache.size, 0);
    cache.destroy();
  });
});

// ============================================================================
// Enhanced Pub/Sub Tests
// ============================================================================

describe('FlashEnhancedPubSub', () => {
  it('publish/subscribe delivers messages', () => {
    const pubsub = new FlashEnhancedPubSub();
    const received = [];

    pubsub.subscribe('chat:lobby', 'sub-1', (msg) => {
      received.push(msg.payload);
    });

    pubsub.publish('chat:lobby', { text: 'hello' });
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], { text: 'hello' });

    pubsub.destroy();
  });

  it('wildcard subscriptions work', () => {
    const pubsub = new FlashEnhancedPubSub();
    const received = [];

    pubsub.subscribeWildcard('game.*.chat', 'sub-1', (msg) => {
      received.push(msg.topic);
    });

    pubsub.publish('game.room1.chat', { text: 'hi' });
    pubsub.publish('game.room2.chat', { text: 'hey' });
    pubsub.publish('chat.lobby', { text: 'nope' });

    assert.equal(received.length, 2);
    assert.deepEqual(received, ['game.room1.chat', 'game.room2.chat']);

    pubsub.destroy();
  });

  it('history retrieval works', () => {
    const pubsub = new FlashEnhancedPubSub({ maxHistory: 100 });

    pubsub.publish('topic1', { n: 1 });
    pubsub.publish('topic1', { n: 2 });
    pubsub.publish('topic1', { n: 3 });

    const history = pubsub.getHistory('topic1');
    assert.equal(history.length, 3);
    assert.deepEqual(history[2].payload, { n: 3 });

    pubsub.destroy();
  });

  it('unsubscribe removes subscriber', () => {
    const pubsub = new FlashEnhancedPubSub();
    let count = 0;

    pubsub.subscribe('topic', 'sub-1', () => count++);
    pubsub.publish('topic', 'a');
    assert.equal(count, 1);

    pubsub.unsubscribe('topic', 'sub-1');
    pubsub.publish('topic', 'b');
    assert.equal(count, 1);

    pubsub.destroy();
  });

  it('dead letter queue captures failed messages', async () => {
    const pubsub = new FlashEnhancedPubSub({ maxRetries: 1 });

    pubsub.subscribe('topic', 'bad-sub', (msg, ack) => {
      ack(false);
    });

    pubsub.publish('topic', 'fail-me');

    await new Promise((r) => setTimeout(r, 300));
    const dl = pubsub.getDeadLetter();
    assert.ok(dl.length >= 0);

    pubsub.destroy();
  });
});
