# FLASH Intelligence Console

The **Intelligence Console** is a local web UI focused on FLASH-exclusive capabilities — not a generic database admin panel.

---

## Launch

**Recommended (1.3.0)** — seal keys first, no master secret in the shell:

```bash
flashsh wrap-key
npx flash-console
# → http://127.0.0.1:3456  (prints x-flash-token)
```

**Alternative** — explicit env secret:

```bash
FLASH_MASTER_KEY="your-long-random-passphrase" npx flash-console
```

Or programmatically (after `flashsh wrap-key`):

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  storagePath: "./flash_data",
});

client.openDashboard({ port: 3456, token: "console-token-at-least-16" });
// → http://localhost:3456
```

---

## Panels

| Panel              | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| **Private RAG**    | Ingest knowledge, semantic ask, view source chunks   |
| **Agent Memory**   | Remember facts, recall by meaning, forget            |
| **Sealed Vault**   | Unlock with passphrase, store credentials, auto-lock |
| **Trust & Safety** | Integrity proofs, prompt firewall PII scan           |
| **Data Explorer**  | Minimal collection/document inspection               |

---

## Security

- Binds **127.0.0.1** by default.
- Requires a dashboard **`token`** (`x-flash-token` header).
- **`GET /api/docs`** is off unless `allowDataExplorer: true`.
- The console is a **local FlashClient** — it holds the master key after unsealing `.flash-take`. Security remains your responsibility: [Trust Model](/guide/trust-model).

---

## Related

- [flashsh CLI](/guide/flashsh-cli)
- [Private RAG](/guide/private-rag)
- [GUI Dashboard](/guide/gui-dashboard)
