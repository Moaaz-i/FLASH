# Mission & responsibility

**FLASH’s mission is to be the first line of privacy protection while AI is being built — anywhere in the world.**

`1.3.1` **documents this. It adds no extra code.** Engine, crypto, and APIs are unchanged from `1.3.0`. [What's new](/guide/whats-new).

Not a plugin after the model ships. Not encryption bolted onto a database that can read you. The store that RAG, agent memory, and sealed intelligence sit on must be **blind by architecture**, so creating AI does not require surrendering the documents, memories, and prompts that train it.

This is **architectural hiding**, not a zk-SNARK suite and not a completed external audit. Limits stay in the [Trust Model](/guide/trust-model).

---

## The rule (this is the responsibility)

**By default, `flash-zk` is strong.** Sealed envelopes, a blind engine, fail-closed network secrets. Protection is on.

**The developer can weaken it.** Plaintext field policies, Merkle-off, a leaked key, decrypt on the server, a public bind without intent. Those are capabilities on `1.3.0`, not the default.

**`flash-zk` is strongest when the developer keeps the key and leaves protection on.** Lose the key, or turn the knobs, and the default cannot save the data. FLASH does not hold the key for you — that would make the engine the reader of the world’s private AI.

> Privacy first, while AI is created. The default is strong. You keep the key. You do not weaken the engine.

---

## Who is responsible for what

| You are | You own | You can break |
| -------- | ------- | ------------- |
| **`flash-zk` (default)** | Protection as shipped: AES envelopes, blindness, trapdoors, fail-closed daemons. Never the master key. | Nothing by itself. Strength assumes the key is kept. |
| **The application developer** | The app: schema, deploy, features — **and whether protection stays at default.** Keep `.flash-wrap`. Do not ship weakening knobs. | Yes: `allowPlaintextFields`, `fieldPolicy: plaintext`, `disableMerkle`, server-side decrypt, leaking the key. |
| **The keyholder (often the same person)** | Who can unseal: `.flash-wrap`, `FLASH_WRAP_KEY`, the device, process memory. | Yes: sharing the wrap file or the passphrase. |
| **The end user of an app** | Their account and whatever the app made them the keyholder of. | Only if the app made them the keyholder and they leak it. |
| **Cloud, assistants, the network daemon** | None of the plaintext. | They must never receive `secretKey`. |

Order of strength:

1. **Default `flash-zk`** — protection is on.
2. **Developer keeps the key and does not weaken** — that default actually holds.
3. **Developer weakens** — `flash-zk` is no longer the strong party. That choice is the developer’s.

FLASH cannot protect the key from its owner. That is how blindness works, not a gap in the mission.

---

## What this means while you build AI

- Ingest, chunk, embed, recall, and tool-call **on sealed data**. The engine answers trapdoors and vector IDs, not “what did the user write?”
- Keep the key (`flashsh wrap-key`, gitignore `.flash-wrap`). The default is only as strong as that.
- Do not ship `allowPlaintextFields`, `fieldPolicy: plaintext`, or Merkle-off. Those knobs exist; using them is you weakening FLASH. They are going away. [Do this first](/guide/do-this-first).

---

## What FLASH does not claim

- That ciphertext is unbreakable, or that searchable indexes leak nothing
- That a stolen `.flash-wrap` or a compromised client still hides data
- That `pqcHardened` is NIST post-quantum confidentiality
- That an independent audit is done
- That the engine stays strong after the developer turns protection down

Honesty is part of the mission. Inflated guarantees would be a privacy failure of a different kind.

---

## Start

1. [Do this first (this week)](/guide/do-this-first) — keep the key; do not weaken the default
2. [Security ahead](/guide/security-ahead) — what FLASH will refuse next; no surprise
3. [Getting Started](/guide/getting-started) — private RAG, agent memory, vault
4. [Why server-blind AI](/guide/why-server-blind-ai) — the workload this mission is for
5. [Trust Model](/guide/trust-model) — limits and audit roadmap
