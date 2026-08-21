# FlashBinary Engine Reference

`FlashBinary` is the zero-copy, binary document serializer and deserializer that powers the high throughput of FLASH DB.

---

## Static Methods

### `FlashBinary.serialize(document)`
Serializes a JavaScript object into a packed binary buffer with an embedded offset table.
- **Arguments:** `document: object`
- **Returns:** `Buffer`

```javascript
import { FlashBinary } from 'flash-db';

const buffer = FlashBinary.serialize({
  username: 'hyper_user',
  score: 99.8,
  active: true
});
```

---

### `FlashBinary.getField(buffer, keyName)`
Extracts a single field value directly from the binary buffer in $O(1)$ time by reading from the offset table, **without** parsing or allocating memory for the rest of the document.
- **Arguments:**
  - `buffer: Buffer`
  - `keyName: string`
- **Returns:** `any` (FieldValue or `undefined`)

```javascript
// Instant field extraction: ~1,000,000+ ops/sec
const score = FlashBinary.getField(buffer, 'score'); // 99.8
```

---

### `FlashBinary.deserialize(buffer)`
Decodes the full binary buffer into a complete JavaScript object.
- **Arguments:** `buffer: Buffer`
- **Returns:** `object`

```javascript
const doc = FlashBinary.deserialize(buffer);
```
