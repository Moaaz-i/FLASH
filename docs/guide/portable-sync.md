# Portable Bundles, Cloud Sync & Federation

---

## FlashPortableBundle

Export encrypted `.flashpack` bundles — move your intelligence data anywhere.

```javascript
const pack = client.portableBundle();
await pack.exportToFile(['docs', 'knowledge'], './backup.flashpack', {
  textCache: vault.exportTextCache(), // optional EmbeddingVault cache
});

import { FlashPortableBundle } from '@moaaz-yahia-zakaria/flash-db';
const manifest = await FlashPortableBundle.importFromFile('./backup.flashpack', client);
```

---

## FlashCloudSync

Provider-agnostic sync to cloud folders (Dropbox, iCloud, S3 mount).

```javascript
const sync = client.cloudSync('./iCloud/FLASH');
await sync.push(['docs', 'knowledge'], 'daily-backup');
const bundles = await sync.listBundles();
const manifest = await sync.pull(); // latest bundle
```

---

## FlashFederatedQuery

Query multiple FLASH clients and merge results client-side (each peer holds its own keys).

```javascript
import { FlashFederatedQuery } from '@moaaz-yahia-zakaria/flash-db';

const fed = new FlashFederatedQuery();
fed.addPeer('eu', clientEU).addPeer('us', clientUS);

const results = await fed.find('patients', { status: 'active' }, { limit: 50 });
const total = await fed.count('patients', {});
```

---

## FlashEncryptedCRDT

Multi-master encrypted CRDT sync (LWW element-set).

```javascript
const nodeA = client.encryptedCRDT('notes', 'node-a');
const nodeB = client.encryptedCRDT('notes', 'node-b');

const entry = await nodeA.localWrite({ _id: '1', text: 'hello' });
await nodeB.applyRemoteDelta(entry);

const delta = nodeA.exportDelta();
// send delta over network, apply on peer
```

---

## FlashBrowserVault

Browser-local encrypted storage (memory driver; IndexedDB-ready adapter).

```javascript
import { FlashBrowserVault } from '@moaaz-yahia-zakaria/flash-db';

const vault = new FlashBrowserVault(secretKey);
await vault.put('prefs', { theme: 'dark', lang: 'ar' });
const prefs = await vault.get('prefs');
```
