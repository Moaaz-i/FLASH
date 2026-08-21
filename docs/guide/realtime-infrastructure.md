# Real-Time Infrastructure

FLASH DB includes zero-dependency real-time building blocks for multiplayer games, chat apps, and social platforms.

## WebSocket Server

Pure Node.js WebSocket server — no external dependencies.

```javascript
import http from 'node:http';
import { FlashWebSocketServer } from 'flash-zk';

const server = http.createServer();
const wss = new FlashWebSocketServer(server, { path: '/ws' });

wss.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.send({ type: 'welcome', id: socket.id });

  socket.onmessage = (data) => {
    if (data.room) {
      wss.to(data.room, { from: socket.id, text: data.text }, socket);
    }
  };
});

wss.on('disconnect', (socket) => {
  console.log('Client left:', socket.id);
});

server.listen(3000);
```

### Rooms & Channels

```javascript
wss.on('connection', (socket) => {
  // Join a room
  wss.joinRoom(socket, 'game:lobby');
  wss.joinRoom(socket, 'game:match-123');

  // Broadcast to room (exclude sender)
  wss.to('game:lobby', { type: 'chat', text: 'Hello!' }, socket);

  // Broadcast to all connected clients
  wss.broadcast({ type: 'announcement', text: 'Server restarting' }, socket);

  // Leave room
  wss.leaveRoom(socket, 'game:lobby');

  // Get room members
  const members = wss.getRoomMembers('game:match-123');
  console.log('Players in match:', members.size);
});
```

### Client-Side (Browser)

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({ room: 'game:lobby', text: 'Hello!' }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### API

| Method | Description |
|--------|-------------|
| `wss.joinRoom(socket, room)` | Add client to a room |
| `wss.leaveRoom(socket, room)` | Remove client from a room |
| `wss.to(room, data, exclude?)` | Send to all room members |
| `wss.broadcast(data, exclude?)` | Send to all connected clients |
| `wss.getRoomMembers(room)` | Get Set of room members |
| `wss.size` | Number of connected clients |
| `socket.join(room)` | Client joins a room |
| `socket.leave(room)` | Client leaves a room |
| `socket.send(data)` | Send to this client |
| `socket.close()` | Disconnect this client |

---

## Presence Service

Track who's online, offline, or in a specific state.

```javascript
import { FlashPresence } from 'flash-zk';

const presence = new FlashPresence({
  heartbeatTimeout: 10000,   // ms before marking offline
  cleanupInterval: 5000      // ms between cleanup checks
});

// Track a user
presence.track('player-1', { name: 'Alice', score: 1500 });

// Check status
presence.isOnline('player-1');     // true
presence.getStatus('player-1');    // 'online'
presence.getOnlineCount();         // 1

// Custom status
presence.setStatus('player-1', 'in-game');
presence.setStatus('player-1', 'away');

// Events
presence.on('online', (userId, info) => {
  console.log(`${userId} came online`);
});

presence.on('offline', (userId, info) => {
  console.log(`${userId} went offline`);
});

presence.on('status', (userId, status, info) => {
  console.log(`${userId} is now ${status}`);
});

// Disconnect (decrements connection count)
presence.disconnect('player-1');
```

### Multiple Connections

```javascript
// User opens 2 tabs
presence.track('user-1');  // connections: 1
presence.track('user-1');  // connections: 2

presence.disconnect('user-1');  // connections: 1, still online
presence.disconnect('user-1');  // connections: 0, goes offline
```

### API

| Method | Description |
|--------|-------------|
| `presence.track(userId, meta?)` | Mark user as online |
| `presence.heartbeat(userId)` | Refresh last-seen timestamp |
| `presence.disconnect(userId)` | Decrement connection count |
| `presence.setStatus(userId, status)` | Set custom status |
| `presence.isOnline(userId)` | Check if online |
| `presence.getStatus(userId)` | Get current status |
| `presence.getOnlineUsers()` | List all online users |
| `presence.getOnlineCount()` | Count online users |
| `presence.get(userId)` | Get full user info |
| `presence.destroy()` | Clean up |

---

## LRU Cache

Fast in-memory cache with TTL expiration and LRU eviction.

```javascript
import { FlashLRUCache } from 'flash-zk';

const cache = new FlashLRUCache({
  maxSize: 10000,
  defaultTTL: 60000,          // 1 minute
  cleanupInterval: 30000      // check every 30 seconds
});

// Basic operations
cache.set('player:1:position', { x: 100, y: 200 });
cache.get('player:1:position');  // { x: 100, y: 200 }
cache.has('player:1:position');  // true
cache.delete('player:1:position');

// Custom TTL per key
cache.set('session:abc', { userId: '123' }, 300000);  // 5 minutes

// Stats
cache.stats;
// { hits: 42, misses: 3, evictions: 1, sets: 45, size: 42, maxSize: 10000 }

// List keys/values
cache.keys();    // ['player:1:position', 'session:abc']
cache.values();  // [{ x: 100, y: 200 }, { userId: '123' }]
```

### Gaming Use Cases

```javascript
// Cache game state
cache.set('game:match-1:state', { players: 4, status: 'running' });

// Cache player sessions
cache.set(`session:${token}`, { userId, expiresAt }, 3600000);

// Cache leaderboard (hot data)
cache.set('leaderboard:daily', topPlayers, 300000);
```

### API

| Method | Description |
|--------|-------------|
| `cache.set(key, value, ttl?)` | Store value |
| `cache.get(key)` | Retrieve value (returns undefined if expired/missing) |
| `cache.has(key)` | Check existence |
| `cache.delete(key)` | Remove entry |
| `cache.peek(key)` | Get without updating LRU order |
| `cache.keys()` | List all keys |
| `cache.values()` | List all values |
| `cache.entries()` | List all [key, value] pairs |
| `cache.clear()` | Remove all entries |
| `cache.size` | Current entry count |
| `cache.stats` | Hit/miss/eviction stats |
| `cache.destroy()` | Clean up timer |

---

## Enhanced Pub/Sub

Persistent message broker with wildcards, history, and dead-letter queue.

```javascript
import { FlashEnhancedPubSub } from 'flash-zk';

const pubsub = new FlashEnhancedPubSub({
  maxHistory: 1000,
  maxRetries: 3
});

// Subscribe to exact topic
pubsub.subscribe('chat:lobby', 'user-1', (msg, ack) => {
  console.log(msg.payload);
  ack(true); // acknowledge delivery
});

// Subscribe with wildcard pattern
pubsub.subscribeWildcard('game.*.chat', 'mod-1', (msg) => {
  console.log(`[${msg.topic}]`, msg.payload);
});

// Publish
pubsub.publish('chat:lobby', { text: 'Hello everyone!' });
pubsub.publish('game.room1.chat', { text: 'Nice shot!' });

// Message history
const history = pubsub.getHistory('chat:lobby', 50);
console.log('Last 50 messages:', history);

// Dead-letter queue
const failed = pubsub.getDeadLetter();
pubsub.retryDeadLetter(failed[0].id);
```

### Wildcard Patterns

```javascript
pubsub.subscribeWildcard('game.*.chat', 'sub', handler);   // matches game.room1.chat
pubsub.subscribeWildcard('game.*', 'sub', handler);         // matches game.room1
pubsub.subscribeWildcard('*', 'sub', handler);               // matches everything
```

### API

| Method | Description |
|--------|-------------|
| `pubsub.publish(topic, payload, options?)` | Publish message |
| `pubsub.subscribe(topic, id, callback)` | Subscribe to topic |
| `pubsub.subscribeWildcard(pattern, id, callback)` | Subscribe with wildcard |
| `pubsub.unsubscribe(topic, id)` | Unsubscribe |
| `pubsub.unsubscribeAll(id)` | Remove all subscriptions |
| `pubsub.getHistory(topic, limit?)` | Get message history |
| `pubsub.getDeadLetter()` | Get failed messages |
| `pubsub.retryDeadLetter(msgId)` | Retry a failed message |
| `pubsub.clearHistory(topic?)` | Clear history |
| `pubsub.getTopics()` | List all topics |
| `pubsub.getSubscriberCount(topic)` | Count subscribers |
| `pubsub.destroy()` | Clean up |
