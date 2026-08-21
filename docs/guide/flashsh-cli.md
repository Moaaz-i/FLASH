# flashsh CLI

The `flashsh` command is FLASH's **sovereign zero-knowledge shell** — optimized for private RAG, agent memory, and integrity proofs.

---

## Installation

```bash
npm install -g flash-zk
```

Or via npx:

```bash
npx flashsh init
```

---

## Commands

### Initialize workspace

```bash
flashsh init
```

Creates `./flash_data`, writes a welcome sample, and ingests it into Private RAG (`cli_knowledge`).

### Interactive REPL

```bash
flashsh
# flashsh> client.privateRAG('kb').ask('question')
```

### Ingest knowledge (Private RAG)

```bash
flashsh ingest ./notes.txt
echo "FLASH encrypts client-side" | flashsh ingest -
```

### Semantic search (not a chatbot)

```bash
flashsh ask "does the server see plaintext?"
```

`ask` searches **ingested documents** via semantic similarity. It returns the closest matching chunks — not a conversational LLM reply.

### Integrity proof

```bash
flashsh proof users
```

---

## Options

| Flag                      | Description                                 |
| ------------------------- | ------------------------------------------- |
| `--storage ./data`        | Storage directory (default: `./flash_data`) |
| `--key secret`            | Master secret key                           |
| `--uri flash://host:6742` | Remote FLASH server                         |
| `--quiet` / `-q`          | Suppress metadata output                    |

---

## Workflow

```bash
# 1. Bootstrap
flashsh init

# 2. Add documents
flashsh ingest medical-notes.txt
flashsh ingest legal-contract.txt

# 3. Search
flashsh ask "side effects"
flashsh ask "termination clause"
```

Collection used: `cli_knowledge` under `{storagePath}/flash_db/`.

---

## Related

- [Positioning & Identity](/guide/positioning)
- [Intelligence Console](/guide/intelligence-console)
- [Private RAG](/guide/private-rag)
