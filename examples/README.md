# FLASH Examples

Three minimal examples showing FLASH's core identity: **private intelligence storage**.

| Example | What it demonstrates |
|---------|---------------------|
| [private-rag-cli](./private-rag-cli/) | Ingest text → semantic ask (server-blind RAG) |
| [agent-memory-bot](./agent-memory-bot/) | Encrypted episodic agent memory |
| [sealed-vault-secrets](./sealed-vault-secrets/) | Passphrase-sealed secret vault |

## Run from repo root

```bash
node examples/private-rag-cli/index.mjs
node examples/agent-memory-bot/index.mjs
node examples/sealed-vault-secrets/index.mjs
```

Each example uses a temp directory under `./examples/.data/` and cleans up on exit.
