# Standalone Server & Client-Server Mode

FLASH DB supports **Dual Architectural Modes**:
1. **Embedded In-Process Mode** (Fastest, zero-network overhead).
2. **Standalone Client-Server Mode** (Connecting over network URIs across servers, containers, or clusters like MongoDB).

---

## 1. Starting the Standalone Server Daemon (`FlashServer`)

On your dedicated Database Server or Docker Container:

```javascript
import { FlashServer } from 'flash-db';

// Start high-performance Zero-Knowledge database server daemon
const server = FlashServer.start({
  port: 6742,                          // Default FLASH port
  host: '0.0.0.0',
  storagePath: '/var/data/flash',
  authKey: 'my_cluster_secret_token'   // Optional network authentication key
});

console.log('⚡ FLASH Server daemon is live on port 6742');
```

---

## 2. Connecting from Remote Apps (`FlashClient`)

On your Web Application or API Servers:

```javascript
import { FlashClient } from 'flash-db';

const client = new FlashClient({
  // Network connection string (flash:// or http://)
  uri: 'flash://db.internal.cloud:6742',
  authKey: 'my_cluster_secret_token',
  
  // Master decryption key stays on the client application!
  secretKey: process.env.FLASH_MASTER_SECRET
});

const users = client.collection('users');

// CRUD operations work identically!
await users.insertOne({ name: 'Ada Lovelace', role: 'engineer' });
const results = await users.find({ name: 'Ada Lovelace' });
```

---

## 3. Why FLASH Client-Server Mode Crushes Traditional Databases

| Security & Architectural Aspect | Traditional DBMS (MongoDB / Postgres) | FLASH DB Client-Server |
| :--- | :--- | :--- |
| **Data in Transit** | Dependent only on TLS (Decrypted on server RAM) | **Encrypted End-to-End** with randomized AES-256-GCM before sending over network. |
| **Server Compromise Risk** | Attacker who compromises the DB server reads all records in plaintext. | **Zero-Knowledge:** Even root access to the DB server yields zero readable data. |
| **Client-Side Decryption** | None | Decryption occurs **only on client instances** with the master key. |
