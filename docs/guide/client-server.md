# Standalone Server & Client-Server Mode

FLASH DB supports **Dual Architectural Modes**:

1. **Embedded In-Process Mode** (Fastest, zero-network overhead).
2. **Standalone Client-Server Mode** (Connecting over network URIs across servers, containers, or clusters).

---

## 1. Starting the Standalone Server Daemon (`FlashServer`)

On your dedicated Database Server or Docker Container:

```javascript
import { FlashServer } from "flash-zk";

// Start high-performance Zero-Knowledge database server daemon
const server = FlashServer.start({
  port: 6742,
  host: "127.0.0.1",
  storagePath: "/var/data/flash",
  authKey: "my_cluster_secret_token",
  // Optional: authorize operations without the server reading plaintext
  // rbac: myFlashRBAC,
});

console.log("⚡ FLASH Server daemon is live on port 6742");
```

::: warning Security Best Practices

- **Zero-Knowledge Kernel**: `FlashServer` rejects plaintext records and plaintext query fields. It never accepts `secretKey`.
- **Mandatory `authKey`**: The daemon will not start without one. Send `x-flash-server-key` on every route except `/health`.
- **Public bind**: `0.0.0.0` requires `allowPublicBind: true` plus `authKey`.
- **Rate limit**: 200 requests / 10 seconds per client IP.
- **Host Binding**: By default, `FlashServer` listens on `127.0.0.1` for local safety. When exposing on a public or LAN interface (like `0.0.0.0`), ensure you use a strong `authKey` and protect the port behind a strict firewall, mTLS proxy, or VPN.
- **Timing-Safe Auth**: All connection authentication checks (including `authKey` validation) use timing-safe constant-time comparison algorithms to mitigate side-channel timing attacks.
- **Secure CORS**: Remote connections strictly evaluate incoming `Origin` headers. Requests from unrecognized remote domains are rejected with `null` origins to mitigate Cross-Origin Exploitation.
- **Resource Limits**: The HTTP daemon enforces a strict **10MB payload size limit** to protect the server from memory-exhaustion Denial of Service (DoS) attacks.
  :::

---

## 2. Connecting from Remote Apps (`FlashClient`)

On your Web Application or API Servers:

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  // Network connection string (flash:// or http://)
  uri: "flash://db.internal.cloud:6742",
  authKey: "my_cluster_secret_token",

  // Master decryption key stays on the client application!
});

const users = client.collection("users");

// CRUD operations work identically!
await users.insertOne({ name: "Ada Lovelace", role: "engineer" });
const results = await users.find({ name: "Ada Lovelace" });
```

---

## 3. Why FLASH Client-Server Mode Is Different

FLASH is built for a threat model most databases ignore: **the server itself is untrusted.**

| Dimension               | Typical server-side DB                         | FLASH Client-Server                                                         |
| :---------------------- | :--------------------------------------------- | :-------------------------------------------------------------------------- |
| **Data in transit**     | TLS terminates at the server; plaintext in RAM | **End-to-end ciphertext** — AES-256-GCM before the packet leaves the client |
| **Server compromise**   | Full plaintext exposure                        | **Zero-knowledge** — root on the host yields only opaque blobs              |
| **Query execution**     | Server evaluates filters on plaintext          | Server matches **blind trapdoors** and ORE tokens                           |
| **Decryption boundary** | Server holds keys                              | **Client-only** — master key never leaves your application                  |

---

## 4. Wire record format _(v1.3.2+)_

REST query/insert payloads use **FlashBinary buffers**, not plaintext JSON documents:

```json
{
  "encryptedRecord": {
    "_flashRecord": "RkxEQk...base64..."
  }
}
```

The `FlashClient` SDK handles encode/decode automatically when you use `uri`. Custom HTTP clients should use `FlashRecordCodec.encodeForWire()` / `decodeFromWire()`.

**Notes:**

- `insertMany` over remote mode currently loops single inserts
- Server `/api/v1/query` returns `{ records: [{ _flashRecord: "..." }] }`
- Decryption always happens on the **client**

See [Buffer Pipeline](/guide/buffer-pipeline) and [Release Notes](/guide/release-notes).
