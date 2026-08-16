# Architecture & Storage Engine

FLASH DB is engineered from the ground up as a **Lock-Free Log-Structured Merge-Tree (LSM-Tree)** combined with an **Offset-Based Zero-Copy Binary Document Engine**.

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FLASH Client SDK & Query Layer                  │
│   ├── Key Derivation (PBKDF2 / Argon2 + Master Secret)                │
│   ├── Adaptive Field Encryption (AES-256-GCM / ChaCha20-Poly1305)      │
│   ├── Blind Index Tokenizer (HMAC-SHA256 with Salted Trapdoors)        │
│   └── Client Streaming Aggregation Pipeline ($group, $sum, $sort)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Memory / Direct In-Process Engine
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     FLASH Database Core Engine                         │
│                                                                        │
│  [1] FlashBinary (Zero-Copy Document Layout)                           │
│      - Constant O(1) field lookup via FNV-1a Hash Offset Table         │
│      - Zero-Allocation field extraction without full parsing           │
│                                                                        │
│  [2] Blind Index & Search Engine                                       │
│      - Cryptographic Hash Indexing for exact matches                   │
│      - Compressed Radix Buckets for Range Queries ($gt, $lt)           │
│      - Merkle Proof Generator for Tamper-Proof Audit Verification      │
│                                                                        │
│  [3] FlashMemTable & Storage (LSM-Tree + WAL)                          │
│      - Lock-Free In-Memory SkipList (<100µs point access)              │
│      - Asynchronous Append-Only Write-Ahead-Log (WAL) with CRC32       │
│      - Segmented SSTables with Bloom Filters & Deflate Block Store     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. FlashBinary: The Zero-Copy Document Format

Traditional databases serialize JSON into BSON or text buffers. When querying a specific field (e.g. `doc.email`), the entire document buffer must be deserialized and allocated into heap memory.

**FlashBinary** solves this with a binary header and pre-computed Offset Table:

```
[0..4]   Magic: 0x46424442 ("FBDB")
[4..6]   Field Count (uint16)
[6..10]  Total Payload Length (uint32)
------------------------------------------------------------------
[Offset Table]
  Each Entry:
  - KeyHash (4 bytes - FNV-1a 32-bit hash)
  - Type (1 byte: NULL, BOOL, INT32, DOUBLE, STRING, BINARY, JSON)
  - DataOffset (4 bytes - Absolute pointer to payload start)
  - DataLength (4 bytes - Exact byte length)
  - KeyNameLength (1 byte)
  - KeyName (UTF-8 bytes)
------------------------------------------------------------------
[Payload Segment]
  Raw value bytes located at precise offset addresses.
```

### Why is this 10x - 30x faster?
When `FlashBinary.getField(buffer, "email")` is invoked:
1. It hashes `"email"` in nanoseconds using FNV-1a.
2. Scans the compact offset table until matching the 4-byte hash.
3. Reads the raw string directly from `[DataOffset .. DataOffset + DataLength]`.
4. **Zero memory allocation for any other field in the document.**

---

## 2. FlashMemTable: Lock-Free SkipList

Active in-memory mutations are stored in `FlashMemTable`, implemented as a concurrent, probabilistic **SkipList** with $O(\log N)$ point search, insertion, and ordered range scanning.

- **Latency:** Reads and writes complete in `< 100 microseconds`.
- **Ordering:** Keys remain permanently sorted in memory for instant range iterators.

---

## 3. Write-Ahead Log (FlashWAL)

To ensure ACID durability, every write is immediately written to an Append-Only Write-Ahead Log before mutating the MemTable.

- **Frame Layout:** `[PayloadLength (4B) | CRC32 (4B) | OpCode (1B) | KeyLen (2B) | Key | Data]`
- **Crash Recovery:** Upon collection initialization, the WAL is replayed and validated against CRC32 checksums to rebuild un-flushed memory states.

---

## 4. SSTable Segments & Bloom Filters

When the MemTable reaches its threshold (default `64 KB`), it triggers an automatic **Flush to SSTable**:

1. In-memory sorted entries are written to a permanent `.sst` file.
2. A **Bloom Filter** is built to allow $O(1)$ microsecond negative lookups.
3. Data chunks are compressed using fast Deflate blocks.
4. The MemTable is cleared and the WAL is truncated to keep disk usage lean.
