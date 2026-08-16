# Enterprise & Scale API Reference

Complete API documentation for enterprise modules in **FLASH DB**.

---

## 1. `FlashHNSWIndex`

```typescript
class FlashHNSWIndex {
  constructor(options?: {
    M?: number;              // Default: 16
    efConstruction?: number; // Default: 64
    efSearch?: number;       // Default: 32
    mL?: number;             // Default: 1/ln(M)
    metric?: 'cosine' | 'euclidean' | 'dot'; // Default: 'cosine'
  });

  insert(id: string, vector: Array<number> | Float32Array): void;
  search(queryVector: Array<number> | Float32Array, k?: number, options?: { efSearch?: number; filter?: Set<string> }): VectorSearchResult[];
  size(): number;
}
```

---

## 2. `FlashMVCC`

```typescript
class FlashMVCC {
  beginTransaction(txId?: string): { txId: string; readTs: number };
  read(txId: string, docId: string): Record<string, any> | null;
  write(txId: string, docId: string, doc: Record<string, any>): void;
  delete(txId: string, docId: string): void;
  commit(txId: string): { success: boolean; commitTs: number };
  abort(txId: string): void;
  vacuum(): void;
}
```

---

## 3. `FlashDistributedTxCoordinator`

```typescript
class FlashDistributedTxCoordinator {
  constructor(cluster: FlashCluster);
  beginTransaction(customTxId?: string): string;
  stageOperation(dtxId: string, collection: string, docKey: string, type: 'insert' | 'update' | 'delete', payload?: any): void;
  commitTransaction(dtxId: string): Promise<{ success: boolean; state: string; shards: string[] }>;
  abortTransaction(dtxId: string): Promise<void>;
}
```

---

## 4. `FlashKeyRotationManager`

```typescript
class FlashKeyRotationManager {
  constructor(masterKey: string | Buffer);
  rotateKey(): { previousVersion: number; newVersion: number; activeKeysCount: number };
  encrypt(data: string | object): string;
  decrypt(versionedCiphertext: string): any;
  needsReEncryption(versionedCiphertext: string): boolean;
  reEncrypt(oldCiphertext: string): string;
  batchReEncrypt(documents: Array<Record<string, any>>, encryptedFields: string[]): { upgradedCount: number };
}
```

---

## 5. `FlashORE`

```typescript
class FlashORE {
  constructor(secretKey: string | Buffer);
  encrypt(value: number | Date | string, fieldScope?: string): string;
  static compare(oreTokenA: string, oreTokenB: string): -1 | 0 | 1;
  static matchesRange(oreToken: string, rangeCriteria: { $gt?: string; $gte?: string; $lt?: string; $lte?: string }): boolean;
}
```

---

## 6. `FlashCompactor`

```typescript
class FlashCompactor {
  constructor(options?: {
    maxSSTablesBeforeCompact?: number; // Default: 4
    compactionIntervalMs?: number;    // Default: 30000
  });

  start(collections?: FlashCollection[]): void;
  stop(): void;
  compactCollection(collection: FlashCollection): Promise<{ compacted: boolean; originalFiles: number; totalRecordsMerged: number }>;
}
```

---

## 7. `FlashMetrics`

```typescript
class FlashMetrics {
  recordOp(op: 'insert' | 'find' | 'update' | 'delete' | 'flush' | 'compact', durationMs: number): void;
  setGauge(name: string, value: number): void;
  toPrometheus(): string;
}
```

---

## 8. `FlashETL`

```typescript
class FlashETL {
  static exportToNDJSON(collection: FlashCollection, destFilePath: string): Promise<{ exportedCount: number; filePath: string }>;
  static importFromNDJSON(collection: FlashCollection, sourceFilePath: string, batchSize?: number): Promise<{ importedCount: number }>;
  static exportToCSV(collection: FlashCollection, destFilePath: string, fields?: string[]): Promise<{ exportedCount: number }>;
}
```
