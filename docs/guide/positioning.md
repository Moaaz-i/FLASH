# FLASH Positioning

**FLASH** is the **Zero-Knowledge Encrypted Intelligence Database** — a local-first, server-blind data layer for private AI.

> _The server never sees your keys, your queries, or your plaintext._

---

## One Sentence

**FLASH is the database that powers private AI — encrypted by architecture, intelligent by design.**

---

## The Central Question

Traditional databases assume the engine can read your data. FLASH assumes the opposite:

> _How do you store, query, and search when the engine must remain cryptographically blind?_

---

## Five Principles

| # | Principle | Meaning |
|---|-----------|---------|
| 1 | **Server-blind by design** | Encryption is the foundation — not a plugin |
| 2 | **Intelligence-native** | RAG, agent memory, and semantic search are first-class |
| 3 | **Local-first sovereignty** | Your key, your disk, your rules |
| 4 | **Honest performance** | Batch writes, balanced durability — real numbers |
| 5 | **Trust you can verify** | Merkle roots, integrity proofs, sealed vaults |

---

## When to Use FLASH

| Scenario | Why FLASH |
|----------|-----------|
| Private RAG over sensitive documents | Ingest and search without server plaintext |
| AI agent memory (local or edge) | Encrypted episodic recall with TTL |
| Sealed secrets vault | Passphrase isolation + auto-lock |
| Local-first apps with encrypted search | Blind indexes + ORE range queries |
| Compliance-heavy workflows | Integrity proofs, audit streams, GDPR export |

---

## When **Not** to Use FLASH

| Scenario | Better Alternative |
|----------|-------------------|
| General cloud document DB at massive scale | Managed document databases |
| Shared multi-tenant SaaS with server-side analytics | Postgres + application-layer encryption |
| Pure key-value cache | Redis / in-memory cache |
| Team already standardized on one SQL stack | Postgres with extensions |

FLASH is **not** trying to replace your general-purpose database. It owns **private intelligence storage**.

---

## FLASH vs “Encrypted SQLite + Vector DB”

| | SQLite + separate vector DB | FLASH |
|---|---------------------------|-------|
| Encryption model | App-layer or SQLCipher | Zero-knowledge envelopes + blind indexes |
| Vector + documents | Two systems | One engine |
| Agent memory | Build yourself | `FlashAgentMemory` built-in |
| Private RAG pipeline | Glue code | `FlashPrivateRAG` built-in |
| Integrity proofs | Manual | Merkle + signed manifest |

---

## Identity Map

```
MongoDB  →  "Your default document database"
FLASH    →  "Your private AI data layer"
```

---

## Next Steps

- [5-Minute Intelligence Quick Start](/guide/getting-started#intelligence-in-5-minutes)
- [FLASH-Exclusive Stack](/guide/flash-exclusive)
- [Engine Options & Durability](/guide/engine-options)
- [Why Server-Blind AI Storage](/guide/why-server-blind-ai)
