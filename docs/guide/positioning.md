# FLASH Positioning

**FLASH** is a **standalone Zero-Knowledge Encrypted Intelligence Database** — local-first, server-blind, and built for private AI.

> _The storage engine never receives your keys, your plaintext, or your raw query values._

---

## One Sentence

**FLASH is its own database.** Encrypted by architecture. Intelligent by design. Independent of any other document store.

---

## The Central Question

Traditional databases assume the engine can read your data. FLASH assumes the opposite:

> _How do you store, query, and search when the engine must remain cryptographically blind?_

---

## Five Principles

| #   | Principle                   | Meaning                                                |
| --- | --------------------------- | ------------------------------------------------------ |
| 1   | **Server-blind by design**  | Encryption is the foundation — not a plugin            |
| 2   | **Intelligence-native**     | RAG, agent memory, and semantic search are first-class |
| 3   | **Local-first sovereignty** | Your key, your disk, your rules                        |
| 4   | **Honest performance**      | Batch writes, balanced durability — real numbers       |
| 5   | **Trust you can verify**    | Merkle roots, integrity proofs, sealed vaults          |

---

## When to Use FLASH

| Scenario                               | Why FLASH                                    |
| -------------------------------------- | -------------------------------------------- |
| Private RAG over sensitive documents   | Ingest and search without server plaintext   |
| AI agent memory (local or edge)        | Encrypted episodic recall with TTL           |
| Sealed secrets vault                   | Passphrase isolation + auto-lock             |
| Local-first apps with encrypted search | Blind indexes + ORE range queries            |
| Compliance-heavy workflows             | Integrity proofs, audit streams, GDPR export |

---

## When **Not** to Use FLASH

| Scenario                                            | Better Alternative                                                |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| General cloud document DB at massive scale          | A managed general-purpose database                                |
| Shared multi-tenant SaaS with server-side analytics | Application-layer encryption on SQL                               |
| Pure key-value cache                                | In-memory cache                                                   |
| Team already standardized on one SQL stack          | That stack, with FLASH beside it only if you need a private vault |

FLASH owns **private intelligence storage**. It is not a generic cloud document platform.

---

## FLASH vs “Encrypted SQLite + Vector DB”

|                      | SQLite + separate vector DB | FLASH                                    |
| -------------------- | --------------------------- | ---------------------------------------- |
| Encryption model     | App-layer or SQLCipher      | Zero-knowledge envelopes + blind indexes |
| Vector + documents   | Two systems                 | One engine                               |
| Agent memory         | Build yourself              | `FlashAgentMemory` built-in              |
| Private RAG pipeline | Glue code                   | `FlashPrivateRAG` built-in               |
| Integrity proofs     | Manual                      | Merkle + signed manifest                 |

---

## Identity

FLASH is a complete product:

```
Your app  →  FlashClient (holds the key, encrypts, decrypts)
                ↓ sealed envelopes + trapdoors only
             Flash engine / FlashServer (zero knowledge of plaintext)
```

- **FlashClient** is the only component that may decrypt.
- **FlashServer**, gRPC, and replication accept sealed records and blind query envelopes — never `secretKey`, never plaintext fields.
- **SQL and GraphQL** run on `FlashClient`, so evaluation happens after client-side decrypt.
- The **Intelligence Console** is a local FlashClient UI (the keyholder), not a blind remote admin.

See the [standalone vault example](https://github.com/Moaaz-i/FLASH/tree/main/examples/standalone-vault).

---

## Next Steps

- [5-Minute Intelligence Quick Start](/guide/getting-started#intelligence-in-5-minutes)
- [Zero-Knowledge Security](/guide/zero-knowledge-security)
- [FLASH-Exclusive Stack](/guide/flash-exclusive)
- [Engine Options & Durability](/guide/engine-options)
- [Why Server-Blind AI Storage](/guide/why-server-blind-ai)
