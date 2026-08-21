# Specialized Storage: Spatial R-Tree, Blob Storage & Local-First

**FLASH DB** offers specialized storage engines for geospatial coordinates, massive binary files, and offline in-browser applications.

---

## 1. Geospatial R-Tree Index (`FlashSpatialRTree`)

Search points within bounding boxes or query K-Nearest Neighbors via Haversine distance in Kilometers:

```javascript
import { FlashSpatialRTree } from '@moaaz-i/flash-db';

const rtree = new FlashSpatialRTree();
rtree.insertPoint('nyc_store', 40.7128, -74.0060, { name: 'Manhattan Store' });
rtree.insertPoint('philly_store', 39.9526, -75.1652, { name: 'Philly Store' });

// Find 2 nearest stores to user location
const nearest = rtree.searchNearest(40.7300, -73.9900, 2);
console.log(nearest[0].id); // 'nyc_store'
```

---

## 2. Chunked Large Object Storage (`FlashBlobStore`)

Store gigabyte-scale videos, images, and documents split into deduplicated, encrypted chunks:

```javascript
import { FlashBlobStore } from '@moaaz-i/flash-db';

const blobStore = new FlashBlobStore({ chunkSizeBytes: 65536 });
const fileData = Buffer.from('...'); // Raw file buffer

// Write blob
const meta = blobStore.writeBlob('video_101', 'sample.mp4', fileData, 'video/mp4');
console.log(`Stored in ${meta.totalChunks} chunks with SHA-256 ${meta.sha256}`);

// Read and reconstruct blob
const downloaded = blobStore.readBlob('video_101');
```

---

## 3. Local-First In-Browser Adapter (`FlashBrowserAdapter`)

Run FLASH completely inside web browsers and edge workers using IndexedDB and OPFS:

```javascript
import { FlashBrowserAdapter } from '@moaaz-i/flash-db';

const adapter = new FlashBrowserAdapter('my_offline_app', { driver: 'indexeddb' });
await adapter.set('drafts', 'draft_1', Buffer.from('Local draft data'));
```
