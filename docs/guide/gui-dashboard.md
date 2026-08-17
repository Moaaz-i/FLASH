# Built-In Web GUI & Interactive Studio

FLASH DB includes a full interactive local Web Studio (similar to **MongoDB Compass & Prisma Studio**) that can be launched directly in a single line of code with optional **Token / Password Protection**.

---

## 1. Launching the Studio Dashboard

```javascript
import { FlashClient } from '@moaaz-yahia-zakaria/flash-db';

const client = new FlashClient({
  secretKey: 'master_passphrase',
  storagePath: './flash_data'
});

// Launch Interactive Studio with optional security token
client.openDashboard({
  port: 3456,
  token: 'my_admin_passcode_2026' // Optional security token protection
});

console.log('⚡ Studio running at: http://localhost:3456');
```

---

## 2. Interactive Studio Capabilities

### 🔒 1. Token-Protected Access
- Protect read and write operations via a dashboard access token (`token`).
- Enter the token in the top bar of the Studio interface to authenticate all API mutations.

### ➕ 2. Live Document Creation (Insert Modal)
- Click **"➕ Insert Document"** to open the interactive JSON editor.
- The document is validated against schema, encrypted with AES-256-GCM, and inserted into the collection in real-time.

### 🗑️ 3. Direct Deletion
- Delete any document with a single click from the visual interface.
- Appends a deletion tombstone to `commit.farc` and recalculates the Merkle Tree root.

### 🔍 4. Instant Fuzzy Search Bar
- Search records live by ID, name, or keywords using client-side decrypted `$fuzzy` search.

### ⚡ 5. Manual SSTable Flush
- Click **"⚡ Flush SSTable"** to trigger a checkpoint, compressing the active MemTable into an immutable `.sst` segment.
