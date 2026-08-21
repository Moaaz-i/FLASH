# TypeScript Support & Type Safety

**FLASH DB** ships with full first-class TypeScript definitions out of the box (`index.d.ts`), enabling strong typing, generic collection modeling, and instant IntelliSense autocompletion in VS Code, WebStorm, Next.js, and NestJS.

---

## Generic Collection Typing

You can provide a TypeScript interface to `client.collection<T>()` for type-safe document queries and mutations:

```typescript
import { FlashClient, InsertResult } from "flash-db";

interface UserProfile {
  _id?: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  balance: number;
  tags?: string[];
}

const client = new FlashClient({
  secretKey: process.env.FLASH_SECRET_KEY,
  storagePath: "./data",
});

// Type-safe collection instance
const users = client.collection<UserProfile>("users");

// Type checking on insertion
const res: InsertResult = await users.insertOne({
  name: "Grace Hopper",
  email: "grace@navy.mil",
  role: "admin",
  balance: 15000,
});

// Type-safe results on find
const admins: UserProfile[] = await users.find({ role: "admin" });
console.log(admins[0].name); // Type inferred as string!
```

---

## Supported Interfaces and Exports

The `flash-db` package exports all core interfaces directly:

```typescript
import type {
  FlashClientOptions,
  FlashEngineOptions,
  FlashLifecycleOptions,
  FlashPlugin,
  FlashQueryWhereBuilder,
  FlashRecordCodec,
  QueryOptions,
  InsertResult,
  InsertManyResult,
  DeleteResult,
  UpdateResult,
  VectorSearchResult,
} from "flash-db";
```

---

## Buffer pipeline types _(v1.3.2+)_

```typescript
import {
  FlashClient,
  FlashRecordCodec,
  FlashBinary,
  FlashCollection,
} from "flash-db";

const client = new FlashClient({ secretKey: "key", storagePath: "./data" });

// Client boundary — objects
const buf: Buffer = client.encryptToBuffer({ name: "Ada" });
const doc = client.decryptFromBuffer(buf);

// Engine boundary — buffers
const raw: FlashCollection = client.collection("users").raw;
const buffers: Buffer[] = await raw.find({});
const objects = FlashBinary.decodeRecords(buffers);
```

### FlashQuery fluent `.where()`

```typescript
// FlashQueryWhereBuilder fixes chained where() typing
await users.find({}).where("age").gte(18).exec();
```

---

## Plugin hooks

```typescript
import type {
  FlashPlugin,
  FlashClientCollection,
} from "flash-db";

const timestamps: FlashPlugin = {
  name: "timestamps",
  beforeInsert(doc) {
    doc.createdAt = new Date();
    return doc;
  },
  beforeUpdate(doc, _col, previous) {
    doc.updatedAt = new Date();
    return doc;
  },
  afterUpdate(doc) {
    console.log("updated", doc._id);
  },
};
```

---

## Typecheck (maintainers / CI)

The repo validates `src/index.d.ts` with a compile-only smoke file:

```bash
npm run typecheck
```

This runs `tsc --noEmit` against `tests/types/smoke.ts`, which exercises turbo/compact/in-memory and buffer-pipeline types.

---

## See also

- [Release Notes](/guide/release-notes)
- [Buffer Pipeline](/guide/buffer-pipeline)
- [FlashClient API](/api/flash-client)
