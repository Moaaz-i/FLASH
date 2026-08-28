# Why Server-Blind AI Storage?

FLASH’s mission is to be the **first line of privacy protection while AI is created**. Most “AI databases” store **embeddings in the cloud** and send **prompts to remote LLMs**. The server — or the vendor — can see your documents, queries, and agent memory.

FLASH inverts this model. **Default `flash-zk` is strong.** You keep the key; you can weaken the engine if you choose to. [Mission & responsibility](/guide/mission).

---

## The Problem

```
Your documents  →  Cloud vector DB  →  Plaintext embeddings + metadata visible
Your questions  →  Remote LLM API    →  Query + context logged
Agent memory    →  SaaS memory layer →  Third-party retention policies
```

Even with “encryption at rest,” the **service operator** typically holds keys or sees decrypted payloads at query time.

---

## The FLASH Model

```
Your documents  →  Client encrypts  →  Server stores ciphertext + trapdoors only
Your RAG query  →  Client embeds      →  Similarity over encrypted vectors
Agent memory    →  Local FLASH vault  →  Encrypted episodic recall
```

The engine answers: _“Which trapdoor / vector ID matches?”_ — never _“What does the user’s document say?”_

---

## Three Workloads, One Layer

### 1. Private RAG

Ingest PDFs, notes, or medical records. Ask questions semantically. The storage layer never holds plaintext.

```javascript
const rag = client.privateRAG("clinical");
await rag.ingest({ title: "Protocol", text: "..." });
const ctx = await rag.ask("contraindications?");
```

### 2. Agent Memory

Agents need persistent context. FLASH stores memories encrypted with importance scores and TTL — not in a vendor’s conversation log.

```javascript
const memory = client.agentMemory("assistant");
await memory.remember("User prefers Arabic UI", { importance: 2 });
```

### 3. Sealed Vault

API keys and secrets in an isolated domain with passphrase lock — separate from general collections.

```javascript
const vault = client.sealedVault("secrets");
vault.unlock("passphrase");
await vault.put("openai_key", { value: "sk-..." });
```

---

## When Server-Blind Matters

| Industry    | Risk without server-blind storage         |
| ----------- | ----------------------------------------- |
| Healthcare  | PHI exposure in vector indexes            |
| Legal       | Privileged documents in cloud RAG         |
| Finance     | Client data in LLM context logs           |
| Personal AI | Notes and journals on third-party servers |

---

## What FLASH Is Not

- Not a chatbot — `flashsh ask` retrieves encrypted chunks, it does not call OpenAI
- Not “encryption optional” — zero-knowledge envelopes are architectural
- Not a plugin for another database — FLASH is a standalone engine

---

## Get Started

1. [Mission & responsibility](/guide/mission) — who owns protection, the app, and the key
2. [Do this first](/guide/do-this-first) — seal the key this week
3. [Positioning](/guide/positioning) — when to choose FLASH
4. [Private RAG](/guide/private-rag) — ingest + ask workflow
5. [LangChain Integration](/guide/langchain-integration) — connect AI frameworks
6. [Intelligence Console](/guide/intelligence-console) — local web UI
