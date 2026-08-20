# Built-In Intelligence Console

FLASH DB ships **FLASH Intelligence Console** — a local web UI for encrypted intelligence workflows (Private RAG, agent memory, sealed vault, trust tools), plus a minimal Data Explorer.

> Full reference: [Intelligence Console](/guide/intelligence-console)

---

## Launch

```javascript
import { FlashClient } from "@moaaz-yahia-zakaria/flash-db";

const client = new FlashClient({
  secretKey: "master_passphrase",
  storagePath: "./flash_data",
});

client.openDashboard({
  port: 3456,
  token: "my_admin_passcode_2026", // optional
});

console.log("⚡ Console: http://localhost:3456");
```

---

## Intelligence Panels

### Private RAG

- Ingest text (client-side encrypt + embed + index)
- Semantic ask — returns context pack + sources (not a chatbot)

### Agent Memory

- Remember facts with importance weighting
- Semantic recall and forget

### Sealed Vault

- Passphrase unlock, isolated key domain
- Store credentials; auto-lock after inactivity

### Trust & Safety

- Export signed integrity proof (Merkle + invariants)
- Prompt firewall — scan for PII/secrets before LLM egress

### Data Explorer

- Browse collections and documents
- Quick JSON insert for debugging

---

## Token Protection

When `token` is set, all `/api/*` routes require the `x-flash-token` header or `?token=` query param.
