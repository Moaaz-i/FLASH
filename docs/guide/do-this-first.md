# Do this first (this week)

**Mission:** FLASH is the first line of privacy protection while AI is built. [Who is responsible](/guide/mission).

**By default `flash-zk` is strong.** You can weaken it. It stays strong if you **keep the key** and do not use the knobs below.

On `1.3.x` a few switches still exist that weaken the model. Use none of them. They are going away. Do the list below before new features.

---

## 1. Seal the master key today

Do not put `secretKey` in source, in npm, or in chat logs.

```bash
npm install flash-zk
flashsh wrap-key
echo ".flash-wrap" >> .gitignore
```

| File          | Commit?                             |
| ------------- | ----------------------------------- |
| `.flash-take` | Yes — sealed master (`FLASHTAKE1`)  |
| `.flash-wrap` | **Never** — this unwraps the master |

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  storagePath: "./flash_data",
});
```

If you still pass `secretKey`, keep it in a secret manager or env — never hardcoded. Prefer wrap files.

Details: [flashsh CLI](/guide/flashsh-cli).

---

## 2. Do not disable protection

These are valid on `1.3.x` and **wrong for production**. Stop using them now so a later engine release does not break you.

| Stop                                          | Use instead                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `allowPlaintextFields: true`                  | Encrypted fields only                                                                                  |
| `fieldPolicy: { …: "plaintext" }`             | `"encrypted"` · `"exact"` · `"searchable"` · `"counter"`                                               |
| `engineOptions: { disableMerkle: true }`      | Leave Merkle on                                                                                        |
| `performanceProfile: "turbo"` with Merkle off | `turbo` is throughput only — set `disableMerkle: false` until the default changes                      |
| Binding `0.0.0.0` without `allowPublicBind`   | Bind localhost, or set `allowPublicBind: true` **only** if you mean a public daemon + strong `authKey` |

FLASH will refuse these knobs. Migrating this week is cheaper than migrating on the cut. The full list of planned raises: [Security ahead](/guide/security-ahead).

---

## 3. Strong secrets on every network surface

Minimum **16 bytes**, not `changeme` / `secret` / `password`.

- Remote `FlashClient` → `authKey`
- `FlashServer` / gRPC / replication → `authKey`
- Intelligence Console → `token`

Weak values already fail closed. Do not look for a bypass.

---

## 4. You hold the key — protect the holder

FLASH cannot decrypt without you. That is the point. It also means:

- Whoever can read `.flash-wrap` or the process memory can read data.
- The Intelligence Console is a local keyholder, not a blind remote admin.
- Searchable indexes still leak patterns (trapdoors, ranges). Design as if an observer sees structure, not plaintext.

Full limits: [Trust Model](/guide/trust-model).

---

## Not this week

Do not wait for a post-quantum rename, ORAM, or an external audit before doing the four items above.

Do not add a server-side decrypt “for ops.” That is a backdoor. Query and SQL stay on `FlashClient`.

Do not invent a second encryption layer on the daemon. The engine is already blind; a second key on the server undoes it.

---

## Next

- [Mission & responsibility](/guide/mission) — first-line privacy while AI is created; your real job
- [Security ahead](/guide/security-ahead) — what FLASH will tighten next; no surprise
- [Getting Started](/guide/getting-started) — Private RAG, agent memory, vault in five minutes
- [What's New in 1.3.1](/guide/whats-new) — this release is docs only; no extra code
- [Trust Model & Audit Roadmap](/guide/trust-model)
