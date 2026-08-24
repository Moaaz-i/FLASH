# Built-In Intelligence Console

FLASH DB ships **FLASH Intelligence Console** — a local web UI for encrypted intelligence workflows (Private RAG, agent memory, sealed vault, trust tools), plus a minimal Data Explorer.

> Full reference: [Intelligence Console](/guide/intelligence-console)

## Console Preview 🎥

<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 2rem 0; width: 100%;">
  <video width="100%" style="max-width: 800px; border-radius: 12px; border: 1px solid var(--vp-c-divider); box-shadow: 0 8px 24px rgba(0,0,0,0.1); outline: none;" controls autoplay muted loop playsinline>
    <source src="/FLASH_DB.mp4" type="video/mp4">
    Your browser does not support the video tag.
  </video>
</div>

---

## Launch

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  secretKey: "master_passphrase",
  storagePath: "./flash_data",
});

client.openDashboard({
  port: 3456,
  token: "console-token-at-least-16",
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
