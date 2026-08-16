# TypeScript Support & Type Safety

**FLASH DB** ships with full first-class TypeScript definitions out of the box (`index.d.ts`), enabling strong typing, generic collection modeling, and instant IntelliSense autocompletion in VS Code, WebStorm, Next.js, and NestJS.

---

## Generic Collection Typing

You can provide a TypeScript interface to `client.collection<T>()` for type-safe document queries and mutations:

```typescript
import { FlashClient, InsertResult } from 'flash-db';

interface UserProfile {
  _id?: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  balance: number;
  tags?: string[];
}

const client = new FlashClient({
  secretKey: process.env.FLASH_SECRET_KEY,
  storagePath: './data'
});

// Type-safe collection instance
const users = client.collection<UserProfile>('users');

// Type checking on insertion
const res: InsertResult = await users.insertOne({
  name: 'Grace Hopper',
  email: 'grace@navy.mil',
  role: 'admin',
  balance: 15000
});

// Type-safe results on find
const admins: UserProfile[] = await users.find({ role: 'admin' });
console.log(admins[0].name); // Type inferred as string!
```

---

## Supported Interfaces and Exports

The `flash-db` package exports all core interfaces directly:

```typescript
import type {
  FlashClientOptions,
  QueryOptions,
  InsertResult,
  InsertManyResult,
  DeleteResult,
  UpdateResult,
  VectorSearchResult
} from 'flash-db';
```
