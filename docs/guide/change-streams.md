# Real-Time Change Streams & Reactive Watchers

FLASH DB enables building real-time collaboration apps, chat systems, and reactive dashboards via **Lock-Free Change Streams (`watch()`)**.

---

## Subscribing to Collection Events

```javascript
import { FlashClient } from '@moaaz-yahia-zakaria/flash-db';

const client = new FlashClient({ secretKey: 'chat_secret_key' });
const messages = client.collection('messages');

// 1. Subscribe to all changes (or with a predicate filter)
const watcher = messages.watch({ channel: 'general' });

// 2. Listen to insert events
watcher.on('insert', (event) => {
  console.log('⚡ New message arrived:', event.doc.text);
  console.log('Timestamp:', event.timestamp);
});

// 3. Listen to delete events
watcher.on('delete', (event) => {
  console.log('🗑️ Message deleted with ID:', event.id);
});

// 4. Listen to any change
watcher.on('change', (event) => {
  console.log('Operation:', event.operationType);
});

// To stop watching and clean up listeners
// watcher.close();
```
