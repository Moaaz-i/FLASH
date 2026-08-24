# FLASH-Exclusive Intelligence Stack

FLASH is an **encrypted intelligence database** — server-blind by architecture, local-first, and AI-native. The modules below are **FLASH-exclusive** and do not exist as a unified stack in traditional document databases.

---

## Module Map

| Module | Purpose |
|--------|---------|
| `FlashPrivateRAG` | Encrypted ingest → chunk → embed → ask (private RAG) |
| `FlashEmbeddingVault` | Server stores vectors + hashes only; plaintext stays client-side |
| `FlashAgentMemory` | Encrypted episodic memory for AI agents (TTL, importance) |
| `FlashSealedVault` | Passphrase-sealed vault with auto-lock |
| `FlashPortableBundle` | `.flashpack` encrypted portable bundles |
| `FlashCloudSync` | Push/pull bundles to cloud-synced folders |
| `FlashLangChainAdapter` | Vector store + memory adapter for AI frameworks |
| `FlashFederatedQuery` | Query multiple encrypted peers, merge client-side |
| `FlashMultiAgentSync` | Shared encrypted memory across AI agents |
| `FlashPromptFirewall` | PII/secret scan before LLM egress |
| `FlashDifferentialPrivacy` | Noisy aggregates for privacy-preserving analytics |
| `FlashComplianceExport` | GDPR export + signed delete attestation |
| `FlashIntegrityProof` | Signed Merkle + invariant manifest |
| `FlashKeyCeremony` | XOR key sharding ceremony |
| `FlashTimeSeal` | Tamper-evident timestamp chain |
| `FlashEncryptedCRDT` | Multi-master encrypted CRDT sync |
| `FlashBrowserVault` | Browser-local encrypted key-value vault |
| `FlashEdgeNode` | HTTP + FLASH wire edge daemon |
| `FlashAuditStream` | Change stream + tamper-proof audit chain |

All modules are available from `FlashClient` or direct imports from `flash-zk`.

---

## Quick Start

```javascript
import { FlashClient } from 'flash-zk';

const client = new FlashClient({
  secretKey: 'your-long-random-passphrase',
  storagePath: './flash_data',
});

// Private RAG
const rag = client.privateRAG('knowledge');
await rag.ingest({ title: 'Security', text: 'Long document...' });
const answer = await rag.ask('How does encryption work?');

// Agent memory
const memory = client.agentMemory('assistant');
await memory.remember('User prefers Arabic UI', { importance: 2 });
const facts = await memory.recall('What language?');

// Sealed vault
const vault = client.sealedVault('secrets');
vault.unlock('passphrase');
await vault.put('api_key', { service: 'openai', value: 'sk-...' });

// Integrity proof
const proof = await client.integrityProof('audit_log', { actor: 'auditor' });
```

See dedicated guides:

- [Private RAG & Agent Memory](/guide/private-rag)
- [Trust, Compliance & Security Tools](/guide/trust-compliance)
- [Portable Bundles & Sync](/guide/portable-sync)
- [flashsh CLI](/guide/flashsh-cli)
- [FLASH Wire Protocol](/guide/flash-wire)
- [Production Engine](/guide/production-engine)
