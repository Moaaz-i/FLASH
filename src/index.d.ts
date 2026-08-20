/**
 * TypeScript Type Definitions for FLASH DB
 * Next-Gen Ultra-Fast Zero-Knowledge Encrypted Embedded Document Database Engine
 *
 * No `any` types — full IntelliSense autocomplete and type safety.
 */

// ============================================================================
// Core Result & Option Types
// ============================================================================

export interface FlashEngineOptions {
  /** @default 'balanced' */
  durability?: "strict" | "balanced" | "throughput";
  /** Memtable flush threshold in bytes. @default 4194304 (4 MB) */
  memtableThreshold?: number;
  /** Use worker thread for large SSTable flushes. @default true */
  useWorkerFlush?: boolean;
  /** Defer Merkle rebuild on bulk write paths. @default true */
  deferMerkleOnWrite?: boolean;
}

export interface FlashClientOptions {
  secretKey: string | Buffer;
  dbName?: string;
  storagePath?: string;
  uri?: string;
  authKey?: string;
  pqcHardened?: boolean;
  autoTimestamps?: boolean;
  fieldPolicy?: Record<string, FieldPolicyType>;
  engineOptions?: FlashEngineOptions;
}

export interface FlashLifecycleOptions {
  expireAfterMs?: number;
  maxDocuments?: number;
  timeField?: string;
  archivePath?: string;
}

export interface FlashPaginationResult<T = Record<string, unknown>> {
  docs: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FlashMaintenanceOptions {
  sweepIntervalMs?: number;
  flushIntervalMs?: number;
  compactIntervalMs?: number;
  autoStart?: boolean;
}

export interface FlashPlugin {
  name: string;
  onRegister?: (client: FlashClient) => void;
  beforeInsert?: (
    doc: Record<string, unknown>,
    collection: FlashClientCollection,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  afterInsert?: (
    doc: Record<string, unknown>,
    collection: FlashClientCollection,
  ) => void | Promise<void>;
  beforeUpdate?: (
    doc: Record<string, unknown>,
    collection: FlashClientCollection,
    previous?: Record<string, unknown>,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export type FieldPolicyType =
  "searchable" | "counter" | "plaintext" | "zk-secret";

export interface QueryOptions {
  limit?: number;
  skip?: number;
  sort?: Record<string, 1 | -1>;
  select?: Record<string, 0 | 1> | string[];
  populate?: PopulateOptions[];
}

export interface PopulateOptions {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
  single?: boolean;
}

export interface InsertResult {
  insertedId: string;
  merkleRoot: string;
}

export interface InsertManyResult {
  insertedCount: number;
  insertedIds: string[];
}

export interface DeleteResult {
  deletedCount: number;
}

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedId?: string;
}

export interface VectorSearchResult {
  docId: string;
  score: number;
}

export interface BulkWriteResult {
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
  insertedIds: Record<number, string>;
  upsertedIds: Record<number, string>;
  errors: string[];
}

export interface BackupResult {
  bytesWritten: number;
  files: string[];
  timestamp: string;
}

export interface RestoreResult {
  filesRestored: number;
  destinationPath: string;
}

export interface AggregateStage {
  $match?: Record<string, unknown>;
  $group?: Record<string, unknown>;
  $sort?: Record<string, 1 | -1>;
  $limit?: number;
  $unwind?: string | { path: string };
  $addFields?: Record<string, unknown>;
  $project?: Record<string, 0 | 1 | boolean>;
  $lookup?: {
    from: string;
    localField: string;
    foreignField: string;
    as: string;
    single?: boolean;
  };
}

export interface MerkleProofResult {
  isValid: boolean;
  leafHash: string;
  root: string;
}

export interface IndexSpecification {
  [field: string]: 1 | -1;
}

export interface CreateIndexOptions {
  unique?: boolean;
  name?: string;
}

export interface IndexInfo {
  name: string;
  spec: IndexSpecification;
  fields: string[];
  unique: boolean;
}

// ============================================================================
// Schema Types
// ============================================================================

export interface SchemaRule {
  type?:
    "string" | "number" | "boolean" | "object" | "array" | "date" | "buffer";
  required?: boolean;
  default?: unknown | (() => unknown);
  min?: number;
  max?: number;
  match?: RegExp;
  enum?: unknown[];
  unique?: boolean;
  trim?: boolean;
}

export type SchemaDefinition = Record<string, SchemaRule>;

// ============================================================================
// Binary & Storage
// ============================================================================

export type FLASH_TYPE_VALUE =
  | 0x00 // NULL
  | 0x01 // BOOLEAN
  | 0x02 // INT32
  | 0x03 // DOUBLE
  | 0x04 // STRING_UTF8
  | 0x05 // BINARY
  | 0x06 // OBJECT_JSON
  | 0x07 // ARRAY_JSON
  | 0x08; // ENCRYPTED_BLOB

export interface FLASH_TYPE {
  NULL: 0x00;
  BOOLEAN: 0x01;
  INT32: 0x02;
  DOUBLE: 0x03;
  STRING_UTF8: 0x04;
  BINARY: 0x05;
  OBJECT_JSON: 0x06;
  ARRAY_JSON: 0x07;
  ENCRYPTED_BLOB: 0x08;
}

export interface FlashBinaryInterface {
  serialize(doc: Record<string, unknown>): Buffer;
  deserialize(buffer: Buffer): Record<string, unknown>;
  getField(
    buffer: Buffer,
    targetKey: string,
  ):
    | string
    | number
    | boolean
    | null
    | undefined
    | Record<string, unknown>
    | unknown[];
  hashKey(str: string): number;
}

// ============================================================================
// WAL & SSTable
// ============================================================================

export type WAL_OPCODE = 0x01 | 0x02 | 0x03 | 0x04;

export interface ARC_OP_INTERFACE {
  INSERT: 0x01;
  UPDATE: 0x02;
  DELETE: 0x03;
  COMMIT: 0x04;
}

export interface FlashArcOptions {
  syncOnWrite?: boolean;
}

export interface FlashSSTableMeta {
  offset: number;
  len: number;
}

// ============================================================================
// Logger
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface FlashLoggerInterface {
  setLevel(level: LogLevel): void;
  debug(
    module: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  info(
    module: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  warn(
    module: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
  error(
    module: string,
    message: string,
    context?: Record<string, unknown>,
  ): void;
}

// ============================================================================
// Class: FlashCipher
// ============================================================================

export interface CipherEncryptOptions {
  aad?: string | Buffer;
}

export interface CipherDecryptOptions {
  asJson?: boolean;
  aad?: string | Buffer;
}

export class FlashCipher {
  readonly key: Buffer;
  constructor(masterKey: string | Buffer, salt?: string);
  encrypt(
    data: string | Buffer | Record<string, unknown>,
    options?: CipherEncryptOptions,
  ): string;
  decrypt(payloadBase64: string, options?: CipherDecryptOptions): string;
  decrypt(payloadBase64: string, asJson: boolean): string;
  encryptDeterministic(plaintext: string, domainKey?: Buffer): string;
}

// ============================================================================
// Class: FlashBlindIndex
// ============================================================================

export interface RangeBucketResult {
  bucketIndex: number;
  token: string;
  exactTrapdoor: string;
}

export class FlashBlindIndex {
  readonly ngramSize: number;
  readonly bucketSize: number;
  constructor(
    secretKey: string | Buffer,
    options?: { ngramSize?: number; bucketSize?: number },
  );
  generateTrapdoor(
    fieldName: string,
    value: string | number | boolean | null,
  ): string | null;
  generateNGramTrapdoors(
    fieldName: string,
    text: string,
    addHoneyPadding?: boolean,
  ): string[];
  generateRangeBuckets(
    fieldName: string,
    value: number | Date,
  ): RangeBucketResult;
  generateRangeQueryTokens(
    fieldName: string,
    min: number,
    max: number,
  ): string[];
}

// ============================================================================
// Class: FlashHomomorphic
// ============================================================================

export interface HomomorphicCiphertext {
  ciphertext: string;
  recordId: string;
  fieldName: string;
}

export class FlashHomomorphic {
  constructor(secretKey: string | Buffer);
  encryptAdd(
    value: number,
    recordId: string,
    fieldName: string,
  ): HomomorphicCiphertext;
  aggregateSum(ciphertexts: string[]): string;
  decryptSum(
    aggregateCiphertext: string,
    recordsMetadata: Array<{ recordId: string; fieldName: string }>,
  ): number;
}

// ============================================================================
// Class: FlashMerkle
// ============================================================================

export class FlashMerkle {
  constructor(leafHashes: string[]);
  getRoot(): string;
  getProof(leafIndex: number): string[];
  static verifyProof(
    leafHash: Buffer | string,
    proof: string[],
    root: string,
  ): boolean;
  static hash(data: string | Buffer): Buffer;
}

// ============================================================================
// Class: FlashPQC
// ============================================================================

export class FlashPQC {
  static deriveQuantumHardenedKey(passphrase: string): Buffer;
}

// ============================================================================
// Class: FlashFuzzyEngine
// ============================================================================

export class FlashFuzzyEngine {
  static levenshteinDistance(a: string, b: string): number;
  static soundex(str: string): string;
  static isPhoneticMatch(a: string, b: string, threshold?: number): boolean;
}

// ============================================================================
// Class: FlashKeyRotationManager
// ============================================================================

export class FlashKeyRotationManager {
  constructor(masterKey: string | Buffer);
  rotateKey(): {
    previousVersion: number;
    newVersion: number;
    activeKeysCount: number;
  };
  encrypt(data: string | Record<string, unknown>): string;
  decrypt(versionedCiphertext: string): string | Record<string, unknown>;
  needsReEncryption(versionedCiphertext: string): boolean;
  reEncrypt(oldCiphertext: string): string;
  batchReEncrypt<T extends Record<string, unknown>>(
    documents: T[],
    encryptedFields: string[],
  ): { upgradedCount: number };
}

// ============================================================================
// Class: FlashORE
// ============================================================================

export class FlashORE {
  constructor(secretKey: string | Buffer);
  encrypt(value: number | Date | string, fieldScope?: string): string;
  static compare(oreTokenA: string, oreTokenB: string): -1 | 0 | 1;
  static matchesRange(
    oreToken: string,
    rangeCriteria: { $gt?: string; $gte?: string; $lt?: string; $lte?: string },
  ): boolean;
}

// ============================================================================
// Class: FlashBinary
// ============================================================================

export const FlashBinary: FlashBinaryInterface;

// ============================================================================
// Storage: FlashBloomFilter & FlashCompressor
// ============================================================================

export class FlashBloomFilter {
  constructor(expectedItems?: number);
  add(item: string): void;
  has(item: string): boolean;
  toBuffer(): Buffer;
  static fromBuffer(buffer: Buffer): FlashBloomFilter;
}

export class FlashCompressor {
  static compressBlock(data: Buffer): Promise<Buffer>;
  static decompressBlock(data: Buffer): Promise<Buffer>;
}

// ============================================================================
// Engine: FlashMemTable
// ============================================================================

export interface MemTableEntry {
  key: string;
  value: Buffer | Record<string, unknown>;
}

export class FlashMemTable {
  readonly size: number;
  readonly byteSize: number;
  set(
    key: string,
    value: Buffer | Record<string, unknown>,
    approxBytes?: number,
  ): void;
  get(key: string): Buffer | Record<string, unknown> | null;
  delete(key: string): void;
  scan(
    minKey?: string | null,
    maxKey?: string | null,
    limit?: number,
  ): MemTableEntry[];
  entries(): MemTableEntry[];
  clear(): void;
}

// ============================================================================
// Engine: FlashArc (WAL)
// ============================================================================

export { ARC_OP_INTERFACE as ARC_OP };
export { ARC_OP_INTERFACE as WAL_OP };
export type FlashWAL = FlashArc;

export class FlashArc {
  readonly arcPath: string;
  readonly syncOnWrite: boolean;
  constructor(arcPath: string, options?: FlashArcOptions);
  open(): Promise<void>;
  append(opCode: number, key: string, data: Buffer | string): Promise<void>;
  recover(
    onRecord: (opCode: number, key: string, dataBuffer: Buffer) => void,
  ): Promise<void>;
  truncate(): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Engine: FlashSSTable
// ============================================================================

export function fsyncDir(dir: string): Promise<void>;

export class FlashSSTable {
  readonly filePath: string;
  readonly indexMap: Map<string, FlashSSTableMeta>;
  readonly isLoaded: boolean;
  static write(
    filePath: string,
    sortedEntries: MemTableEntry[],
  ): Promise<FlashSSTable>;
  constructor(filePath: string);
  load(): Promise<void>;
  get(key: string): Promise<Buffer | null>;
}

// ============================================================================
// Engine: FlashIndexManager
// ============================================================================

export interface BlindPayload {
  exact?: Record<string, string>;
  ngrams?: Record<string, string[]>;
  range?: Record<string, RangeBucketResult>;
}

export class FlashIndexManager {
  indexDocument(docId: string, blindPayload: BlindPayload): void;
  removeDocument(docId: string): void;
  findExact(field: string, trapdoor: string): Set<string>;
  findNGrams(field: string, queryTokens: string[]): Set<string>;
  findRangeBuckets(field: string, rangeTokens: string[]): Set<string>;
}

// ============================================================================
// Engine: FlashCompactor
// ============================================================================

export interface CompactionResult {
  compacted: boolean;
  originalFiles: number;
  totalRecordsMerged: number;
}

export class FlashCompactor {
  readonly isRunning: boolean;
  constructor(options?: {
    maxSSTablesBeforeCompact?: number;
    compactionIntervalMs?: number;
  });
  start(collections?: FlashCollection[]): void;
  stop(): void;
  compactCollection(collection: FlashCollection): Promise<CompactionResult>;
}

// ============================================================================
// Engine: FlashUpdateEngine
// ============================================================================

export interface UpdateSpecification {
  $set?: Record<string, unknown>;
  $unset?: Record<string, 0 | 1 | boolean>;
  $inc?: Record<string, number>;
  $mul?: Record<string, number>;
  $min?: Record<string, number>;
  $max?: Record<string, number>;
  $push?: Record<string, unknown>;
  $pull?: Record<string, unknown>;
  $addToSet?: Record<string, unknown>;
  $pop?: Record<string, 1 | -1>;
  $currentDate?: Record<string, 1 | true | { $type: "date" | "timestamp" }>;
}

export class FlashUpdateEngine {
  static applyUpdate(
    doc: Record<string, unknown>,
    updateSpec: UpdateSpecification | Record<string, unknown>,
  ): Record<string, unknown>;
}

// ============================================================================
// Engine: FlashQueryEvaluator
// ============================================================================

export class FlashQueryEvaluator {
  static matches(
    doc: Record<string, unknown>,
    query: Record<string, unknown>,
  ): boolean;
}

// ============================================================================
// Engine: FlashSecondaryIndexManager
// ============================================================================

export class DuplicateKeyError extends Error {
  readonly code: 11000;
  readonly keyPattern: Record<string, 1>;
  readonly keyValue: Record<string, unknown>;
  constructor(field: string, value: unknown, indexName: string);
}

export class FlashSecondaryIndexManager {
  createIndex(
    keySpec: IndexSpecification,
    options?: CreateIndexOptions,
  ): string;
  listIndexes(): IndexInfo[];
  dropIndex(name: string): boolean;
  indexDocument(doc: Record<string, unknown>): void;
  unindexDocument(doc: Record<string, unknown>): void;
  validateUniqueConstraints(
    doc: Record<string, unknown>,
    excludeId?: string,
  ): void;
}

// ============================================================================
// Engine: FlashTTLManager
// ============================================================================

export class FlashTTLManager {
  constructor(
    collection: FlashCollection,
    options?: {
      field?: string;
      expireAfterSeconds?: number;
      intervalMs?: number;
    },
  );
  start(): void;
  stop(): void;
  purgeExpired(): Promise<number>;
}

// ============================================================================
// Engine: FlashBulkWriter
// ============================================================================

export type BulkWriteOperation =
  | { insertOne: { document: Record<string, unknown> } }
  | {
      updateOne: {
        filter: Record<string, unknown>;
        update: UpdateSpecification;
        upsert?: boolean;
      };
    }
  | {
      updateMany: {
        filter: Record<string, unknown>;
        update: UpdateSpecification;
        upsert?: boolean;
      };
    }
  | { deleteOne: { filter: Record<string, unknown> } }
  | { deleteMany: { filter: Record<string, unknown> } }
  | {
      replaceOne: {
        filter: Record<string, unknown>;
        replacement: Record<string, unknown>;
      };
    };

export class FlashBulkWriter {
  static execute(
    collection: FlashClientCollection,
    operations: BulkWriteOperation[],
    options?: { ordered?: boolean },
  ): Promise<BulkWriteResult>;
}

// ============================================================================
// Engine: FlashBackupManager
// ============================================================================

export class FlashBackupManager {
  static backup(
    sourcePath: string,
    destinationPath: string,
  ): Promise<BackupResult>;
  static restore(
    backupPath: string,
    destinationPath: string,
  ): Promise<RestoreResult>;
}

// ============================================================================
// Engine: FlashExplain
// ============================================================================

export interface ExplainResult {
  queryPlanner: {
    plannerVersion: number;
    namespace: string;
    indexFilterSet: boolean;
    parsedQuery: Record<string, unknown>;
    winningPlan: {
      stage: "INDEX_SCAN" | "COLL_SCAN";
      indexName: string | null;
      direction: "forward";
    };
  };
  executionStats: {
    executionSuccess: boolean;
    nReturned: number;
    executionTimeMillis: number;
    totalKeysExamined: number;
    totalDocsExamined: number;
    executionStages: {
      stage: "INDEX_SCAN" | "COLL_SCAN";
      nReturned: number;
      executionTimeMillisEstimate: number;
      docsExamined: number;
    };
  };
}

export class FlashExplain {
  static analyze(
    collectionName: string,
    query: Record<string, unknown>,
    options: QueryOptions,
    results: Record<string, unknown>[],
    durationMs: number,
    indexHit?: string | null,
  ): ExplainResult;
}

// ============================================================================
// Engine: FlashDeadlockDetector
// ============================================================================

export class FlashDeadlockDetector {
  addDependency(txWaiting: string, txHolding: string): boolean;
  removeTransaction(txId: string): void;
  detectCycle(): string[];
}

// ============================================================================
// Engine: FlashOnlineIndexer
// ============================================================================

export class FlashOnlineIndexer {
  static buildIndexOnline(
    collection: FlashCollection,
    fieldName: string,
    options?: {
      chunkSize?: number;
      onProgress?: (progress: { indexed: number; total: number }) => void;
    },
  ): Promise<{ indexedCount: number; durationMs: number }>;
}

// ============================================================================
// Schema: FlashSchema
// ============================================================================

export class FlashSchema {
  readonly rules: Record<string, SchemaRule>;
  constructor(definition?: SchemaDefinition);
  validate(doc: Record<string, unknown>): Record<string, unknown>;
  applyDefaults(doc: Record<string, unknown>): Record<string, unknown>;
}

// ============================================================================
// ODM: FlashSchemaExtended & FlashModel
// ============================================================================

export interface HookNext {
  (): void;
}

export class FlashSchemaExtended extends FlashSchema {
  pre(action: string, fn: (next: HookNext) => void | Promise<void>): this;
  post(
    action: string,
    fn: (doc: Record<string, unknown>) => void | Promise<void>,
  ): this;
  virtual(name: string): {
    get(fn: (this: Record<string, unknown>) => unknown): {
      set(fn: (this: Record<string, unknown>, value: unknown) => void): void;
    };
  };
  method(name: string, fn: (...args: unknown[]) => unknown): this;
  staticMethod(
    name: string,
    fn: (...args: unknown[]) => unknown,
  ): typeof FlashSchemaExtended;
}

export interface FlashModelInterface<T extends Record<string, unknown>> {
  create(doc: T): Promise<InsertResult>;
  find(filter?: Record<string, unknown>): FlashQuery;
  findOne(filter?: Record<string, unknown>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  updateOne(
    filter: Record<string, unknown>,
    update: UpdateSpecification,
  ): Promise<UpdateResult>;
  deleteOne(filter: Record<string, unknown>): Promise<DeleteResult>;
  count(filter?: Record<string, unknown>): Promise<number>;
}

export class FlashModel {
  static compile<T extends Record<string, unknown>>(
    name: string,
    schema:
      | FlashSchemaExtended
      | SchemaDefinition
      | Record<string, unknown>
      | undefined,
    collection: FlashClientCollection<T>,
  ): FlashModelInterface<T>;
}

// ============================================================================
// Transactions: FlashMVCC
// ============================================================================

export interface TransactionInfo {
  txId: string;
  readTs: number;
}

export interface CommitResult {
  success: boolean;
  commitTs: number;
}

export class FlashMVCC {
  beginTransaction(txId?: string): TransactionInfo;
  read(txId: string, docId: string): Record<string, unknown> | null;
  write(txId: string, docId: string, doc: Record<string, unknown>): void;
  delete(txId: string, docId: string): void;
  commit(txId: string): CommitResult;
  abort(txId: string): void;
  vacuum(): void;
}

// ============================================================================
// Transactions: FlashSession
// ============================================================================

export class FlashSession {
  readonly sessionId: string;
  readonly inTransaction: boolean;
  constructor(client: FlashClient);
  startTransaction(): void;
  commitTransaction(): Promise<void>;
  abortTransaction(): Promise<void>;
}

// ============================================================================
// Reactive: FlashChangeStream
// ============================================================================

export interface ChangeEvent {
  operationType: "insert" | "update" | "delete";
  doc: Record<string, unknown>;
  id: string;
  timestamp: number;
}

export class FlashChangeStream {
  readonly isOpen: boolean;
  constructor(
    filter?: Record<string, unknown> | null,
    onClose?: (() => void) | null,
  );
  emitChange(
    operationType: "insert" | "update" | "delete",
    doc: Record<string, unknown>,
  ): void;
  on(event: "change", listener: (event: ChangeEvent) => void): this;
  close(): void;
}

export class FlashEventHub {
  subscribe(
    topic: string,
    handler: (payload: Record<string, unknown>, topic?: string) => void,
  ): () => void;
  unsubscribe(
    topic: string,
    handler: (payload: Record<string, unknown>, topic?: string) => void,
  ): void;
  publish(topic: string, payload: Record<string, unknown>): void;
}

export class FlashPluginHost {
  readonly plugins: FlashPlugin[];
  use(plugin: FlashPlugin): this;
  runHook(hook: string, ...args: unknown[]): Promise<unknown>;
}

export class FlashLifecycle {
  constructor(
    collection: FlashClientCollection,
    options?: FlashLifecycleOptions,
  );
  sweep(): Promise<{ expired: number; trimmed: number }>;
}

export class FlashPaginator {
  static paginate(
    collection: FlashClientCollection,
    query?: Record<string, unknown>,
    options?: {
      cursor?: string;
      limit?: number;
      sort?: Record<string, 1 | -1>;
    },
  ): Promise<FlashPaginationResult>;
  static encodeCursor(
    doc: Record<string, unknown>,
    sortSpec?: Record<string, 1 | -1>,
  ): string;
  static decodeCursor(
    cursor: string,
  ): { k: string; v: unknown; id: string } | null;
}

export class FlashMaintenance {
  start(): this;
  stop(): void;
  runNow(): Promise<void>;
}

export class FlashPipeline {
  fromNDJSON(filePath: string): this;
  fromCollection(name: string, query?: Record<string, unknown>): this;
  toCollection(name: string): this;
  toNDJSON(filePath: string): this;
  batchSize(n: number): this;
  run(): Promise<Record<string, unknown>>;
}

export class FlashEventLog {
  append(data?: Record<string, unknown>): Promise<Record<string, unknown>>;
  appendMany(items?: Record<string, unknown>[]): Promise<InsertManyResult>;
  tail(
    query?: Record<string, unknown>,
    options?: {
      limit?: number;
      cursor?: string | null;
      sort?: Record<string, 1 | -1>;
    },
  ): Promise<FlashPaginationResult>;
  since(
    when: Date | number,
    query?: Record<string, unknown>,
    options?: { limit?: number },
  ): Promise<Record<string, unknown>[]>;
}

export class FlashCounter {
  get(): Promise<number>;
  increment(by?: number): Promise<number>;
  decrement(by?: number): Promise<number>;
  set(value: number): Promise<number>;
  reset(value?: number): Promise<number>;
}

export class FlashQueue {
  enqueue(
    payload: unknown,
    options?: { priority?: number },
  ): Promise<Record<string, unknown>>;
  dequeue(): Promise<Record<string, unknown> | null>;
  ack(id: string): Promise<void>;
  fail(id: string, error?: string): Promise<void>;
  depth(): Promise<number>;
}

export class FlashHealth {
  report(): Promise<Record<string, unknown>>;
}

export class FlashSnapshot {
  exportTo(
    filePath: string,
    collectionNames?: string[] | null,
  ): Promise<Record<string, unknown>>;
  importFrom(filePath: string): Promise<Record<string, unknown>>;
}

// ============================================================================
// Client: FlashQuery (Fluent)
// ============================================================================

export class FlashQuery<T = Record<string, unknown>> implements PromiseLike<
  T[]
> {
  sort(spec: string | Record<string, 1 | -1>): this;
  limit(n: number): this;
  skip(n: number): this;
  select(fields: string | Record<string, 0 | 1>): this;
  where(field: string): {
    equals(value: unknown): this;
    gt(value: unknown): this;
    lt(value: unknown): this;
    gte(value: unknown): this;
    lte(value: unknown): this;
    in(values: unknown[]): this;
    regex(pattern: string): this;
  };
  lean(): this;
  explain(): Promise<ExplainResult>;
  stream(): AsyncIterable<T>;
  then<TResult1 = T[], TResult2 = never>(
    onfulfilled?: (value: T[]) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2>;
  exec(): Promise<T[]>;
}

// ============================================================================
// Client: FlashClientCollection
// ============================================================================

export class FlashClientCollection<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  readonly raw: FlashCollection;
  insertOne(doc: T): Promise<InsertResult>;
  insertMany(docs: T[]): Promise<InsertManyResult>;
  find(filter?: Record<string, unknown>, options?: QueryOptions): FlashQuery<T>;
  findOne(filter?: Record<string, unknown>): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  updateOne(
    filter: Record<string, unknown>,
    update: UpdateSpecification,
    options?: { upsert?: boolean },
  ): Promise<UpdateResult>;
  updateMany(
    filter: Record<string, unknown>,
    update: UpdateSpecification,
    options?: { upsert?: boolean },
  ): Promise<UpdateResult>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: UpdateSpecification,
    options?: { new?: boolean },
  ): Promise<T | null>;
  findByIdAndUpdate(
    id: string,
    update: UpdateSpecification,
    options?: { new?: boolean },
  ): Promise<T | null>;
  deleteOne(filter: Record<string, unknown>): Promise<DeleteResult>;
  deleteMany(filter: Record<string, unknown>): Promise<DeleteResult>;
  bulkWrite(
    operations: BulkWriteOperation[],
    options?: { ordered?: boolean },
  ): Promise<BulkWriteResult>;
  aggregate(pipeline: AggregateStage[]): Promise<Record<string, unknown>[]>;
  count(filter?: Record<string, unknown>): Promise<number>;
  createIndex(
    keySpec: IndexSpecification,
    options?: CreateIndexOptions,
  ): string;
  listIndexes(): IndexInfo[];
  dropIndex(name: string): boolean;
  watch(filter?: Record<string, unknown> | null): FlashChangeStream;
  paginate(
    filter?: Record<string, unknown>,
    options?: {
      cursor?: string;
      limit?: number;
      sort?: Record<string, 1 | -1>;
    },
  ): Promise<FlashPaginationResult<T>>;
  vectorSearch(params: {
    vector: number[] | Float32Array;
    topK?: number;
    filter?: Record<string, unknown> | null;
  }): Promise<(T & { _score: number })[]>;
  verifyRecordIntegrity(docId: string): Promise<MerkleProofResult>;
  setSchema(
    schema: SchemaDefinition | FlashSchema,
    options?: { expireAfterSeconds?: number; ttlField?: string },
  ): this;
  ask(
    prompt: string,
    options?: QueryOptions,
  ): Promise<(T & { _interpretedQuery?: Record<string, unknown> })[]>;
  timeSeriesBucket(
    timeField: string,
    interval: number,
    aggregations: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;
  spatialNear(
    field: string,
    nearSpec: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]>;
}

// ============================================================================
// Intelligence Stack (FLASH-exclusive)
// ============================================================================

export interface FlashDashboardOptions {
  port?: number;
  host?: string;
  token?: string;
}

export interface PrivateRAGIngestInput {
  text: string;
  title?: string;
  metadata?: Record<string, unknown>;
  sourceId?: string;
}

export interface PrivateRAGIngestResult {
  parentId: string;
  chunks: number;
  chunkIds: string[];
}

export interface PrivateRAGAskResult {
  question: string;
  contextPack: string;
  sources: Array<{
    id: string;
    text: string;
    metadata: Record<string, unknown>;
    score: number;
  }>;
  tokens: { used: number; savedEstimate: number };
  serverSawPlaintext: false;
}

export interface AgentMemoryEntry {
  memoryId: string;
  content: string;
  tags: string[];
  score: number;
  semantic: number;
  importance: number;
  recency: number;
}

export class FlashPrivateRAG {
  constructor(
    client: FlashClient,
    collectionName?: string,
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      dimensions?: number;
    },
  );
  ingest(input: PrivateRAGIngestInput): Promise<PrivateRAGIngestResult>;
  ask(
    question: string,
    options?: { topK?: number; maxTokens?: number },
  ): Promise<PrivateRAGAskResult>;
  exportBundle(
    question: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export class FlashAgentMemory {
  constructor(
    client: FlashClient,
    namespace?: string,
    options?: { defaultTtlMs?: number; dimensions?: number },
  );
  remember(
    content: string,
    options?: { tags?: string[]; importance?: number; ttlMs?: number },
  ): Promise<{ memoryId: string; expiresAt: number }>;
  recall(
    query: string,
    options?: { topK?: number },
  ): Promise<AgentMemoryEntry[]>;
  forget(memoryId: string): Promise<DeleteResult>;
  pruneExpired(): Promise<number>;
}

export class FlashSealedVault {
  readonly isLocked: boolean;
  unlock(passphrase: string): void;
  lock(): void;
  put(
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<InsertResult>;
  get(recordId: string): Promise<Record<string, unknown> | null>;
  list(): Promise<Record<string, unknown>[]>;
  remove(recordId: string): Promise<DeleteResult>;
  close(): Promise<void>;
}

export class FlashEmbeddingVault {
  ingest(
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  ask(
    question: string,
    options?: Record<string, unknown>,
  ): Promise<PrivateRAGAskResult>;
  exportTextCache(): Record<string, string>;
}

export class FlashPortableBundle {
  exportToFile(
    collections: string[],
    filePath: string,
    options?: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  static importFromFile(
    filePath: string,
    client: FlashClient,
  ): Promise<Record<string, unknown>>;
}

export class FlashLangChainAdapter {
  asVectorStore(): {
    addDocuments(
      docs: Array<{ pageContent: string; metadata?: Record<string, unknown> }>,
    ): Promise<void>;
    similaritySearch(
      query: string,
      k?: number,
    ): Promise<
      Array<{ pageContent: string; metadata: Record<string, unknown> }>
    >;
  };
  asMemory(): {
    saveContext(input: string, output: string): Promise<void>;
    loadMemoryVariables(
      vars: Record<string, unknown>,
    ): Promise<Record<string, unknown>>;
  };
}

export class FlashFederatedQuery {
  addPeer(name: string, client: FlashClient): this;
  find(
    collection: string,
    filter: Record<string, unknown>,
    options?: QueryOptions,
  ): Promise<Record<string, unknown>[]>;
  count(collection: string, filter: Record<string, unknown>): Promise<number>;
}

export class FlashMultiAgentSync {
  registerAgent(agentId: string): void;
  share(agentId: string, content: string): Promise<Record<string, unknown>>;
  getSharedContext(
    query: string,
    options?: { topK?: number },
  ): Promise<Record<string, unknown>>;
}

export class FlashComplianceExport {
  exportSubjectData(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  eraseSubjectData(
    collection: string,
    filter: Record<string, unknown>,
    actor: string,
  ): Promise<Record<string, unknown>>;
}

export class FlashPromptFirewall {
  static scan(
    text: string,
    options?: { redact?: boolean },
  ): {
    safe: boolean;
    violations: string[];
    redacted: string;
    originalLength: number;
  };
  static assertSafe(text: string): void;
}

export class FlashDifferentialPrivacy {
  static noisyCount(count: number, epsilon?: number): number;
  static noisySum(sum: number, sensitivity?: number, epsilon?: number): number;
}

export class FlashKeyCeremony {
  constructor(shardCount?: number);
  split(masterKey: string | Buffer): string[];
  combine(shards: string[]): string;
}

export class FlashIntegrityProof {
  static export(
    client: FlashClient,
    collectionName: string,
    options?: { actor?: string },
  ): Promise<Record<string, unknown>>;
  static verify(
    proof: Record<string, unknown>,
    secretKey: string | Buffer,
  ): boolean;
}

export class FlashTimeSeal {
  seal(
    event: string,
    metadata?: Record<string, unknown>,
  ): Record<string, unknown>;
  verify(): { valid: boolean; entries: number };
}

export class FlashCloudSync {
  push(collections: string[], label?: string): Promise<Record<string, unknown>>;
  pull(bundleName?: string): Promise<Record<string, unknown>>;
  listBundles(): Promise<string[]>;
}

export class FlashEncryptedCRDT {
  localWrite(doc: Record<string, unknown>): Promise<Record<string, unknown>>;
  applyRemoteDelta(delta: Record<string, unknown>): Promise<void>;
  exportDelta(): Record<string, unknown>;
}

export class FlashBrowserVault {
  constructor(secretKey: string | Buffer, vaultName?: string);
  put(key: string, value: Record<string, unknown>): Promise<void>;
  get(key: string): Promise<Record<string, unknown> | null>;
  remove(key: string): Promise<void>;
  list(): Promise<string[]>;
}

export class FlashAuditStream {
  watch(actor?: string): FlashChangeStream;
  verify(): { valid: boolean };
  getAuditTrail(): Record<string, unknown>[];
}

export class FlashWireServer {
  constructor(
    db: FlashDatabase,
    options?: { port?: number; host?: string; replicaSet?: string },
  );
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export class FlashWireClient {
  constructor(host?: string, port?: number);
  command(cmd: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class FlashEdgeNode {
  constructor(options?: Record<string, unknown>);
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class FlashReplicaSet {
  constructor(options?: Record<string, unknown>);
  addNode(
    nodeId: string,
    peers: string[],
    options?: Record<string, unknown>,
  ): void;
  startNetworkNodes(): Promise<void>;
  electLeader(nodeId: string): void;
  replicateInsert(
    collection: string,
    doc: Record<string, unknown>,
  ): Promise<void>;
  failover(newLeaderId: string): Promise<void>;
}

// ============================================================================
// Client: FlashClient
// ============================================================================

export class FlashClient {
  readonly secretKey: string | Buffer;
  constructor(config: FlashClientOptions);
  collection<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    options?: { schema?: SchemaDefinition | FlashSchema },
  ): FlashClientCollection<T>;
  model<T extends Record<string, unknown>>(
    name: string,
    schema?: FlashSchemaExtended | SchemaDefinition | Record<string, unknown>,
  ): FlashModelInterface<T>;
  tenant(tenantId: string): FlashClient;
  startSession(): FlashSession;
  backup(destinationPath: string): Promise<BackupResult>;
  restore(backupPath: string): Promise<RestoreResult>;
  openDashboard(options?: FlashDashboardOptions): import("node:http").Server;
  privateRAG(
    collectionName?: string,
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      dimensions?: number;
    },
  ): FlashPrivateRAG;
  agentMemory(
    namespace?: string,
    options?: { defaultTtlMs?: number; dimensions?: number },
  ): FlashAgentMemory;
  sealedVault(
    vaultName: string,
    options?: { autoLockMs?: number },
  ): FlashSealedVault;
  integrityProof(
    collectionName: string,
    options?: { actor?: string },
  ): Promise<Record<string, unknown>>;
  embeddingVault(
    collectionName?: string,
    options?: Record<string, unknown>,
  ): FlashEmbeddingVault;
  portableBundle(): FlashPortableBundle;
  langChainAdapter(options?: Record<string, unknown>): FlashLangChainAdapter;
  federatedQuery(): FlashFederatedQuery;
  multiAgentSync(namespace?: string): FlashMultiAgentSync;
  complianceExport(): FlashComplianceExport;
  timeSeal(sealPath?: string): FlashTimeSeal;
  cloudSync(syncDir: string): FlashCloudSync;
  encryptedCRDT(
    collectionName: string,
    nodeId?: string | null,
  ): FlashEncryptedCRDT;
  browserVault(vaultName?: string): FlashBrowserVault;
  auditStream(
    collectionName: string,
    options?: Record<string, unknown>,
  ): FlashAuditStream;
  events(): FlashEventHub;
  use(plugin: FlashPlugin): FlashPluginHost;
  lifecycle(
    collectionName: string,
    options?: FlashLifecycleOptions,
  ): FlashLifecycle;
  maintenance(options?: FlashMaintenanceOptions): FlashMaintenance;
  pipeline(): FlashPipeline;
  eventLog(
    collectionName: string,
    options?: { timeField?: string },
  ): FlashEventLog;
  counter(name: string, options?: { namespace?: string }): FlashCounter;
  queue(collectionName: string, options?: { statusField?: string }): FlashQueue;
  health(): Promise<Record<string, unknown>>;
  snapshot(): FlashSnapshot;
  listCollections(): Promise<string[]>;
  encryptDocument(doc: Record<string, unknown>): EncryptedDocument;
  decryptDocument(encryptedRecord: EncryptedDocument): Record<string, unknown>;
  buildQueryEnvelope(query?: Record<string, unknown>): QueryEnvelope;
  close(): Promise<void>;
}

// ============================================================================
// Encrypted Document & Query Envelope (internal types exposed for advanced use)
// ============================================================================

export interface EncryptedDocument {
  _id: string;
  _enc: Record<string, string>;
  _blind: BlindPayload;
  _homo: Record<string, string>;
  _plain: Record<string, unknown>;
}

export interface QueryEnvelope {
  _id?: string;
  $exact?: Record<string, string>;
  $ngrams?: Record<string, string[]>;
  $range?: Record<string, string[] | RangeBucketResult>;
  $plain?: Record<string, unknown>;
}

// ============================================================================
// Core: FlashCollection (Low-Level)
// ============================================================================

export class FlashCollection {
  readonly name: string;
  readonly storageDir: string;
  readonly memtable: FlashMemTable;
  readonly sstables: FlashSSTable[];
  readonly arc: FlashArc;
  readonly wal: FlashArc;
  readonly indexManager: FlashIndexManager;
  readonly docOrder: string[];
  isReady: boolean;
  init(): Promise<void>;
  insertOne(doc: Record<string, unknown>): Promise<InsertResult>;
  insertMany(docs: Array<Record<string, unknown>>): Promise<InsertManyResult>;
  find(
    queryEnvelope?: QueryEnvelope,
    options?: QueryOptions,
  ): Promise<Array<Record<string, unknown>>>;
  findOne(
    queryEnvelope?: QueryEnvelope,
  ): Promise<Record<string, unknown> | null>;
  deleteOne(queryEnvelope?: QueryEnvelope): Promise<DeleteResult>;
  flush(): Promise<FlashSSTable | null>;
  compact(): Promise<CompactionResult>;
  count(): Promise<number>;
  getMerkleRoot(): string;
  getMerkleProof(
    docId: string,
  ): { index: number; proof: string[]; root: string } | null;
  getMerkleProofAsync(
    docId: string,
  ): Promise<{ index: number; proof: string[]; root: string } | null>;
  verifyRecordIntegrity(docId: string): MerkleProofResult;
}

// ============================================================================
// Core: FlashDatabase
// ============================================================================

export class FlashDatabase {
  readonly dbName: string;
  readonly storagePath: string;
  readonly collections: Map<string, FlashCollection>;
  constructor(name?: string, options?: { storagePath?: string });
  collection(name: string): FlashCollection;
  listCollections(): string[];
  dropCollection(name: string): Promise<void>;
  close(): Promise<void>;
}

// ============================================================================
// Server: FlashServer
// ============================================================================

export interface FlashServerOptions {
  port?: number;
  host?: string;
  storagePath?: string;
  authKey?: string;
  dbName?: string;
}

export class FlashServer {
  static start(options?: FlashServerOptions): import("node:http").Server;
}

// ============================================================================
// Server: FlashMetrics
// ============================================================================

export type MetricOp =
  "insert" | "find" | "update" | "delete" | "flush" | "compact";

export class FlashMetrics {
  constructor(options?: { latencyBuckets?: number[] });
  recordOp(op: MetricOp, durationMs: number): void;
  recordError(op: MetricOp): void;
  setGauge(name: string, value: number): void;
  toPrometheus(): string;
}

// ============================================================================
// Logger
// ============================================================================

export const logger: FlashLoggerInterface;

// ============================================================================
// Vector: FlashVectorIndex & FlashHNSWIndex
// ============================================================================

export interface HNSWOptions {
  M?: number;
  efConstruction?: number;
  efSearch?: number;
  mL?: number;
  metric?: "cosine" | "euclidean" | "dot";
}

export class FlashHNSWIndex {
  constructor(options?: HNSWOptions);
  insert(id: string, vector: number[] | Float32Array): void;
  search(
    queryVector: number[] | Float32Array,
    k?: number,
    options?: { efSearch?: number; filter?: Set<string> },
  ): VectorSearchResult[];
  size(): number;
}

export class FlashVectorIndex {
  constructor(options?: {
    engine?: "exact" | "hnsw";
    hnswOptions?: HNSWOptions;
  });
  set(docId: string, vector: number[] | Float32Array): void;
  delete(docId: string): void;
  search(
    queryVector: number[] | Float32Array,
    topK?: number,
    candidateFilter?: Set<string>,
  ): VectorSearchResult[];
}

// ============================================================================
// Vector: FlashQuantizer
// ============================================================================

export interface SQ8Quantized {
  data: Uint8Array;
  min: number;
  max: number;
  scale: number;
  dimensions: number;
  format: "sq8";
}

export interface BinaryQuantized {
  data: Uint32Array;
  dimensions: number;
  format: "binary1bit";
}

export interface MemorySavingsEstimate {
  vectorCount: number;
  dimensions: number;
  rawFloat32MB: string;
  sq8MB: string;
  binary1BitMB: string;
  sq8Savings: string;
  binary1BitSavings: string;
}

export class FlashQuantizer {
  static popcount32(n: number): number;
  static quantizeSQ8(vector: Float32Array | number[]): SQ8Quantized;
  static dequantizeSQ8(
    quantizedData: Uint8Array,
    min: number,
    scale: number,
  ): Float32Array;
  static asymmetricCosineSQ8(
    queryVec: Float32Array | number[],
    targetSQ8Data: Uint8Array,
    min: number,
    scale: number,
  ): number;
  static quantizeBinary(vector: Float32Array | number[]): BinaryQuantized;
  static hammingDistance(binA: Uint32Array, binB: Uint32Array): number;
  static hammingSimilarity(
    binA: Uint32Array,
    binB: Uint32Array,
    totalDimensions?: number,
  ): number;
  static cosineApproxFromBinary(
    binA: Uint32Array,
    binB: Uint32Array,
    totalDimensions?: number,
  ): number;
  static estimateMemorySavings(
    count: number,
    dimensions: number,
  ): MemorySavingsEstimate;
}

// ============================================================================
// AI: FlashSemanticCache
// ============================================================================

export interface CacheHit {
  hit: true;
  response: string;
  similarity: number;
  prompt: string;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRatio: number;
}

export class FlashSemanticCache {
  constructor(options?: {
    similarityThreshold?: number;
    maxEntries?: number;
    ttlMs?: number;
  });
  get(
    queryEmbedding: number[] | Float32Array,
    promptText?: string,
  ): CacheHit | null;
  set(
    prompt: string,
    embedding: number[] | Float32Array,
    response: string,
  ): void;
  clear(): void;
  getStats(): CacheStats;
}

// ============================================================================
// AI: FlashContextOptimizer
// ============================================================================

export interface RRFInput {
  id?: string;
  docId?: string;
  text?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface RRFOutput {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
  rrfScore: number;
  originalScores: Record<string, number>;
}

export interface TokenBudgetResult {
  packedContext: string;
  documentsUsed: Array<Record<string, unknown>>;
  totalTokens: number;
  savedTokensEstimate: number;
}

export class FlashContextOptimizer {
  static estimateTokens(text: string): number;
  static reciprocalRankFusion(
    rankedLists: RRFInput[][],
    options?: { k?: number; weights?: number[] },
  ): RRFOutput[];
  static deduplicate<T extends { id: string; text: string }>(
    docs: T[],
    similarityThreshold?: number,
  ): T[];
  static optimizeTokenBudget(
    documents: RRFOutput[],
    options?: { maxTokens?: number; preserveTopK?: number },
  ): TokenBudgetResult;
}

// ============================================================================
// AI: FlashNLQueryEngine & FlashLLMAdapter & FlashAIDatabase
// ============================================================================

export interface NLQueryResult {
  filter: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
}

export class FlashNLQueryEngine {
  static parse(prompt: string): NLQueryResult;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export class FlashLLMAdapter {
  registerTool(tool: ToolDefinition): void;
  executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export class FlashAIDatabase {
  constructor(client: FlashClient, options?: { model?: string });
  ask(prompt: string): Promise<string>;
  semanticSearch(
    collection: string,
    query: string,
    topK?: number,
  ): Promise<Record<string, unknown>[]>;
}

// ============================================================================
// Tools: FlashETL, FlashFaker, FlashMigrator
// ============================================================================

export class FlashETL {
  static exportToNDJSON(
    collection: FlashCollection,
    destFilePath: string,
  ): Promise<{ exportedCount: number; filePath: string }>;
  static importFromNDJSON(
    collection: FlashCollection,
    sourceFilePath: string,
    batchSize?: number,
  ): Promise<{ importedCount: number }>;
  static exportToCSV(
    collection: FlashCollection,
    destFilePath: string,
    fields?: string[],
  ): Promise<{ exportedCount: number }>;
}

export class FlashFaker {
  static mockUser(id?: number): Record<string, unknown>;
  static generateBatch(count?: number): Array<Record<string, unknown>>;
}

export class FlashMigrator {
  constructor(db: FlashDatabase);
  register(
    version: number,
    name: string,
    up: (db: FlashDatabase) => Promise<void>,
    down?: (db: FlashDatabase) => Promise<void>,
  ): void;
  up(): Promise<Array<{ version: number; name: string; status: string }>>;
  rollback(): Promise<Array<{ version: number; name: string; status: string }>>;
}

// ============================================================================
// Tools: FlashSIMD
// ============================================================================

export class FlashSIMD {
  static cosineSimilarity(a: Float32Array, b: Float32Array): number;
  static euclideanDistance(a: Float32Array, b: Float32Array): number;
}

// ============================================================================
// Tools: FlashSearchEngine (BM25)
// ============================================================================

export interface SearchHit {
  docId: string;
  score: number;
}

export class FlashSearchEngine {
  constructor(options?: { k1?: number; b?: number });
  indexDocument(docId: string, text: string): void;
  search(query: string, limit?: number): SearchHit[];
}

// ============================================================================
// Cluster: FlashCluster & FlashDistributedTxCoordinator
// ============================================================================

export interface ShardInfo {
  shardId: string;
  db: FlashDatabase;
}

export interface TxCommitResult {
  success: boolean;
  state: string;
  shards: string[];
}

export class FlashCluster {
  constructor(options?: { virtualNodes?: number });
  addShard(shardId: string, dbInstance: FlashDatabase): void;
  removeShard(shardId: string): void;
  getShardForKey(docKey: string): ShardInfo;
  listShards(): string[];
  getTxCoordinator(): FlashDistributedTxCoordinator;
}

export class FlashDistributedTxCoordinator {
  constructor(cluster: FlashCluster);
  beginTransaction(customTxId?: string): string;
  stageOperation(
    dtxId: string,
    collection: string,
    docKey: string,
    type: "insert" | "update" | "delete",
    payload?: Record<string, unknown>,
  ): void;
  commitTransaction(dtxId: string): Promise<TxCommitResult>;
  abortTransaction(dtxId: string): Promise<void>;
}

// ============================================================================
// Consensus: FlashRaft
// ============================================================================

export interface ElectionResult {
  term: number;
  votes: number;
  elected: boolean;
}

export interface ReplicateResult {
  logIndex: number;
  committed: boolean;
}

export interface AppendEntriesResult {
  success: boolean;
  term: number;
}

export class FlashRaft {
  constructor(
    nodeId: string,
    peerIds?: string[],
    options?: { electionTimeoutMs?: number; heartbeatIntervalMs?: number },
  );
  startElection(): ElectionResult;
  replicate(command: Record<string, unknown>): ReplicateResult;
  handleAppendEntries(
    leaderId: string,
    term: number,
    entries?: Array<Record<string, unknown>>[],
    leaderCommit?: number,
  ): AppendEntriesResult;
}

// ============================================================================
// Protocol: FlashGRPCServer & FlashGraphQL
// ============================================================================

export class FlashGRPCServer {
  constructor(db: FlashDatabase, options?: { port?: number });
  start(): Promise<void>;
  stop(): void;
}

export interface GraphQLResult {
  data: Record<string, unknown>;
  errors?: string[];
}

export class FlashGraphQL {
  constructor(db: FlashDatabase);
  execute(queryStr: string): Promise<GraphQLResult>;
}

// ============================================================================
// Storage: FlashBrowserAdapter & FlashBlobStore
// ============================================================================

export class FlashBrowserAdapter {
  constructor(
    dbName?: string,
    options?: { driver?: "indexeddb" | "memory" | "opfs" },
  );
  set(collection: string, key: string, buffer: Buffer): Promise<boolean>;
  get(collection: string, key: string): Promise<Buffer | null>;
  delete(collection: string, key: string): Promise<boolean>;
  listKeys(collection: string): Promise<string[]>;
}

export class FlashBlobStore {
  constructor(options?: { chunkSizeBytes?: number });
  writeBlob(
    fileId: string,
    filename: string,
    buffer: Buffer,
    mimeType?: string,
  ): { fileId: string; totalChunks: number; sha256: string };
  readBlob(fileId: string): Buffer | null;
  deleteBlob(fileId: string): boolean;
}

// ============================================================================
// Graph: FlashGraph
// ============================================================================

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  fromId: string;
  toId: string;
  label: string;
  weight: number;
  properties: Record<string, unknown>;
}

export interface NeighborResult {
  node: GraphNode;
  edge: GraphEdge;
}

export interface PathResult {
  path: string[];
  distance: number;
}

export class FlashGraph {
  addNode(
    id: string,
    label: string,
    properties?: Record<string, unknown>,
  ): GraphNode;
  addEdge(
    fromId: string,
    toId: string,
    label: string,
    weight?: number,
    properties?: Record<string, unknown>,
  ): void;
  getNeighbors(nodeId: string, edgeLabel?: string): NeighborResult[];
  findShortestPath(startId: string, endId: string): PathResult | null;
}

// ============================================================================
// Security: FlashAuditVault, FlashDataMasker, FlashRBAC
// ============================================================================

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  chainHash: string;
}

export class FlashAuditVault {
  constructor(vaultSecret?: string);
  log(
    actor: string,
    action: string,
    target: string,
    metadata?: Record<string, unknown>,
  ): AuditEntry;
  verifyChain(): { valid: boolean; totalEntries: number; brokenAt?: number };
}

export class FlashDataMasker {
  static maskEmail(email: string): string;
  static maskCard(cardNumber: string): string;
  static maskDocument(
    doc: Record<string, unknown>,
    rules?: Record<string, "email" | "card" | "full" | "phone">,
  ): Record<string, unknown>;
}

export class FlashRBAC {
  createRole(roleName: string, permissions: string[]): void;
  assignRole(userId: string, roleName: string): void;
  can(
    userId: string,
    collection: string,
    action: "read" | "write" | "delete" | "admin",
  ): boolean;
}

// ============================================================================
// Spatial: FlashSpatialRTree & FlashSpatialPlugin
// ============================================================================

export interface SpatialPoint {
  id: string;
  distanceKm: number;
  point: { lat: number; lon: number };
  data: Record<string, unknown>;
}

export class FlashSpatialRTree {
  insertPoint(
    id: string,
    lat: number,
    lon: number,
    data?: Record<string, unknown>,
  ): void;
  searchBoundingBox(
    minLat: number,
    minLon: number,
    maxLat: number,
    maxLon: number,
  ): Array<{
    id: string;
    lat: number;
    lon: number;
    data: Record<string, unknown>;
  }>;
  searchNearest(
    lat: number,
    lon: number,
    k?: number,
    maxDistanceKm?: number,
  ): SpatialPoint[];
}

export class FlashSpatialPlugin {
  static filterNear(
    docs: Record<string, unknown>[],
    field: string,
    nearSpec: Record<string, unknown>,
  ): Record<string, unknown>[];
}

// ============================================================================
// Plugins: FlashTimeSeriesPlugin, FlashTextSearchPlugin, FlashCRDTSync
// ============================================================================

export interface TimeSeriesBucket {
  bucketStart: number;
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
}

export class FlashTimeSeriesPlugin {
  static bucket(
    docs: Record<string, unknown>[],
    timeField: string,
    interval: number,
    aggregations: Record<string, unknown>,
  ): TimeSeriesBucket[];
}

export class FlashTimeSeriesRollup {
  static rollup(
    dataPoints?: Array<{ timestamp: number; value: number }>,
    windowSizeMs?: number,
  ): TimeSeriesBucket[];
}

export class FlashTextSearchPlugin {
  indexDocument(docId: string, text: string): void;
  search(query: string, limit?: number): SearchHit[];
}

export class FlashCRDTSync {
  merge(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
  ): Record<string, unknown>;
}

// ============================================================================
// Scaling: FlashConnectionPool, FlashRateLimiter, FlashDistributedLock, FlashCDC, FlashFederation
// ============================================================================

export class FlashConnectionPool {
  constructor(
    serverEndpoints?: string[],
    options?: { maxConnectionsPerHost?: number },
  );
  acquire(): string;
  release(endpoint: string): void;
  setHealthy(endpoint: string, isHealthy: boolean): void;
}

export class FlashRateLimiter {
  constructor(options?: { capacity?: number; refillRatePerSec?: number });
  consume(
    clientId: string,
    cost?: number,
  ): { allowed: boolean; remainingTokens: number; retryAfterMs: number };
  reset(clientId: string): void;
}

export interface LockResult {
  acquired: boolean;
  leaseToken?: string;
  expiresAt?: number;
}

export class FlashDistributedLock {
  acquire(resourceKey: string, ownerId: string, ttlMs?: number): LockResult;
  release(resourceKey: string, leaseToken: string): boolean;
}

export interface CDCEvent {
  id: string;
  collection: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  docId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export class FlashCDC {
  recordChange(
    collection: string,
    op: "INSERT" | "UPDATE" | "DELETE",
    docId: string,
    payload?: Record<string, unknown>,
  ): CDCEvent;
  pollPending(batchSize?: number): CDCEvent[];
  ackEvents(eventIds: string[]): void;
  subscribe(callback: (event: CDCEvent) => void): () => void;
}

export class FlashFederation {
  registerMember(name: string, dbInstance: FlashDatabase): void;
  federatedFind(
    collectionName: string,
    queryEnvelope?: QueryEnvelope,
    options?: QueryOptions,
  ): Promise<Array<Record<string, unknown>>>;
}

// ============================================================================
// Cost Optimizer
// ============================================================================

export interface QueryPlan {
  plan: string;
  field?: string;
  estimatedCost: number;
}

export class FlashCostOptimizer {
  static planQuery(
    query?: Record<string, unknown>,
    availableIndexes?: Set<string>,
    totalDocuments?: number,
  ): QueryPlan;
}

// ============================================================================
// Time Travel
// ============================================================================

export class FlashTimeTravel {
  constructor(mvccInstance: FlashMVCC);
  recordCommit(commitTs: number, timestamp?: number): void;
  queryAsOf(docId: string, asOf: number | Date): Record<string, unknown> | null;
}

// ============================================================================
// SQL
// ============================================================================

export class FlashSQL {
  static execute(
    db: FlashDatabase,
    sqlQuery: string,
  ): Promise<Array<Record<string, unknown>>>;
  static parse(sql: string): Record<string, unknown>;
}

// ============================================================================
// Real-Time: FlashWebSocket & FlashWebSocketServer
// ============================================================================

export interface WebSocketOptions {
  path?: string;
  heartbeatInterval?: number;
  maxPayload?: number;
}

export class FlashWebSocket {
  readonly id: string;
  readonly rooms: Set<string>;
  readonly connected: boolean;
  send(data: string | Record<string, unknown>): void;
  sendBinary(data: Buffer): void;
  join(room: string): this;
  leave(room: string): this;
  ping(): void;
  close(code?: number, reason?: string): void;
  onmessage?: (data: Record<string, unknown>) => void;
  onclose?: () => void;
}

export class FlashWebSocketServer {
  readonly size: number;
  constructor(
    httpServer: import("node:http").Server,
    options?: WebSocketOptions,
  );
  on(event: "connection", listener: (ws: FlashWebSocket) => void): this;
  on(event: "disconnect", listener: (ws: FlashWebSocket) => void): this;
  on(
    event: "message",
    listener: (ws: FlashWebSocket, data: Record<string, unknown>) => void,
  ): this;
  on(event: "join", listener: (ws: FlashWebSocket, room: string) => void): this;
  on(
    event: "leave",
    listener: (ws: FlashWebSocket, room: string) => void,
  ): this;
  joinRoom(ws: FlashWebSocket, room: string): void;
  leaveRoom(ws: FlashWebSocket, room: string): void;
  to(
    room: string,
    data: string | Record<string, unknown>,
    exclude?: FlashWebSocket,
  ): void;
  broadcast(
    data: string | Record<string, unknown>,
    exclude?: FlashWebSocket,
  ): void;
  getRoomMembers(room: string): Set<FlashWebSocket>;
  close(): void;
}

// ============================================================================
// Real-Time: FlashPresence
// ============================================================================

export interface PresenceOptions {
  heartbeatTimeout?: number;
  cleanupInterval?: number;
}

export interface PresenceInfo {
  userId: string;
  status: string;
  lastSeen: number;
  connections: number;
  meta: Record<string, unknown>;
}

export class FlashPresence {
  constructor(options?: PresenceOptions);
  on(
    event: "online",
    listener: (userId: string, info: PresenceInfo) => void,
  ): this;
  on(
    event: "offline",
    listener: (userId: string, info: PresenceInfo) => void,
  ): this;
  on(
    event: "status",
    listener: (userId: string, status: string, info: PresenceInfo) => void,
  ): this;
  track(userId: string, meta?: Record<string, unknown>): PresenceInfo;
  heartbeat(userId: string): void;
  disconnect(userId: string): void;
  setStatus(userId: string, status: string): void;
  isOnline(userId: string): boolean;
  getStatus(userId: string): string;
  getOnlineUsers(): PresenceInfo[];
  getOnlineCount(): number;
  get(userId: string): PresenceInfo | null;
  getAll(): PresenceInfo[];
  destroy(): void;
}

// ============================================================================
// Cache: FlashLRUCache
// ============================================================================

export interface LRUCacheOptions {
  maxSize?: number;
  defaultTTL?: number;
  cleanupInterval?: number;
}

export interface LRUCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sets: number;
  deletes: number;
  size: number;
  maxSize: number;
}

export class FlashLRUCache {
  constructor(options?: LRUCacheOptions);
  set(key: string, value: unknown, ttl?: number): void;
  get(key: string): unknown;
  has(key: string): boolean;
  delete(key: string): boolean;
  peek(key: string): unknown;
  keys(): string[];
  values(): unknown[];
  entries(): Array<[string, unknown]>;
  clear(): void;
  readonly size: number;
  readonly stats: LRUCacheStats;
  destroy(): void;
}

// ============================================================================
// Real-Time: FlashEnhancedPubSub
// ============================================================================

export interface EnhancedPubSubOptions {
  maxHistory?: number;
  maxRetries?: number;
}

export interface PubSubMessage {
  id: string;
  topic: string;
  payload: unknown;
  timestamp: number;
  ttl: number;
  retryCount: number;
  status: string;
}

export type AckFn = (ack: boolean) => void;

export class FlashEnhancedPubSub {
  constructor(options?: EnhancedPubSubOptions);
  on(event: "publish", listener: (msg: PubSubMessage) => void): this;
  on(event: "dead-letter", listener: (msg: PubSubMessage) => void): this;
  publish(
    topic: string,
    payload: unknown,
    options?: { id?: string; ttl?: number },
  ): string;
  subscribe(
    topic: string,
    subscriberId: string,
    callback: (msg: PubSubMessage, ack: AckFn) => void,
  ): this;
  subscribeWildcard(
    pattern: string,
    subscriberId: string,
    callback: (msg: PubSubMessage, ack: AckFn) => void,
  ): this;
  unsubscribe(topic: string, subscriberId: string): this;
  unsubscribeAll(subscriberId: string): void;
  getHistory(topic: string, limit?: number): PubSubMessage[];
  getDeadLetter(): PubSubMessage[];
  retryDeadLetter(msgId: string): boolean;
  clearHistory(topic?: string): void;
  getTopics(): string[];
  getSubscriberCount(topic: string): number;
  destroy(): void;
}
