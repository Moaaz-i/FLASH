# Trust Model & Audit Roadmap

FLASH aims for **earned trust**, not absolute claims. The mission is [first-line privacy while AI is built](/guide/mission). This page states what the architecture does, what it does **not** do, **who is responsible for what**, and how independent verification is planned.

---

## Who is responsible

**Default `flash-zk` is strong.** The developer can weaken it. Strength holds when the developer **keeps the key** and leaves protection on.

| Party | True responsibility |
| ----- | ------------------- |
| **`flash-zk` (default)** | Protection as shipped: sealed envelopes, blind engine, fail-closed daemons. Not the master key. |
| **Developer** | Keep the key. Do not use weakening knobs (`allowPlaintextFields`, Merkle-off, server-side decrypt). The app: schema, deploy, features. |
| **Keyholder** | `.flash-wrap` / wrap secret / device. FLASH cannot hide the key from its owner. |
| **Network, cloud, assistants** | None of the plaintext. They must never receive `secretKey`. |

Full text: [Mission & responsibility](/guide/mission). What to do this week: [Do this first](/guide/do-this-first).

---

## What you can verify today

| Signal                             | Status                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Open source (Apache-2.0)           | Yes — full engine and crypto path are readable                                               |
| Automated tests                    | Yes — run `npm test` (suite size published on the README badge)                              |
| Fail-closed defaults (since 1.2.0) | Yes — missing/`weak` secrets, open binds, and plaintext fields refuse                        |
| Key wrapping (`FLASHTAKE1`, 1.3.0) | Yes — `flashsh wrap-key`; the wrap secret stays with the **keyholder**, not the engine |
| Architectural blind storage        | Yes — sealed envelopes + trapdoors; see [Zero-Knowledge Security](./zero-knowledge-security) |
| Independent security audit         | **Not yet** — see roadmap below                                                              |
| Formal zk-SNARK / proof system     | **No** — FLASH does not claim circuit proofs                                                 |

---

## What “zero-knowledge” means here

In FLASH docs, **zero-knowledge** means **architectural hiding**: the engine and network daemons are designed so they never receive your `secretKey` or document plaintext.

It does **not** mean:

- a zk-SNARK / zk-STARK proof system
- a third-party guarantee that the implementation is bug-free
- that searchable encryption leaks nothing (trapdoors and ORE tokens still reveal structure — see limits)

---

## Known limits (read before production)

Be explicit with yourself and your users:

1. **Client compromise = data compromise.** Whoever holds `secretKey` (or a derived tenant key) can decrypt. Protect the keyholder like a root of trust. Prefer sealing the master key with [`flashsh wrap-key`](./flashsh-cli) (`.flash-take` + local `.flash-wrap`) so the wrap secret never ships to npm.
2. **Searchable encryption leaks patterns.** Exact trapdoors, n-grams, bucket/ORE range tokens, and honey padding reduce — but do not eliminate — frequency and range leakage.
3. **Metadata is visible.** Record IDs, collection names, sizes, timing, and network auth headers are not hidden by envelope encryption.
4. **The Intelligence Console holds the key.** It is a local privileged client, not a blind remote admin.
5. **Opt-in plaintext is possible today.** `allowPlaintextFields` and related flags exist for migration — using them weakens the model. They will be **refused** in a later engine release. See [Security ahead](./security-ahead) so that cut is not a surprise.
6. **No external audit yet.** Production use with regulated or high-value data should wait for independent review or your own assessment.
7. **The keyholder is the root of trust.** `flashsh wrap-key` uses **`FLASHTAKE1` only** (see [flashsh CLI](./flashsh-cli)). Protect `.flash-wrap` / `FLASH_WRAP_KEY` — FLASH does not hold that secret for you. That is your responsibility, not a hole in the engine.
8. **Performance claims are workload-specific.** “1M+ ops/sec” on marketing pages refers to **FlashBinary field lookup** paths — not full encrypted insert+index+fsync. Prefer [Benchmarks](/api/benchmarks).

---

## Honest positioning for adopters

| Audience                          | Reasonable expectation                                 |
| --------------------------------- | ------------------------------------------------------ |
| Prototypes / local-first apps     | Suitable to evaluate now                               |
| Private RAG experiments           | Suitable with known SSE leakage                        |
| Regulated production (HIPAA/etc.) | Requires your threat model + preferably external audit |
| “Guaranteed unbreakable privacy”  | **Not** what FLASH claims                              |

Compliance helper APIs (audit vault, GDPR export, masking) are **tools**, not a certificate that your deployment is SOC 2 or HIPAA compliant.

---

## Public audit roadmap

| Phase | Goal                                                                 | Status      |
| ----- | -------------------------------------------------------------------- | ----------- |
| **A** | Threat model doc + this trust page + tightened public claims         | **Current** |
| **B** | Crypto/surface inventory (cipher, SSE, ORE, network auth, console)   | Planned     |
| **C** | Independent code review (scoped: crypto + `FlashZKKernel` + server)  | Planned     |
| **D** | Publish findings + remediations; keep an open issues tracker         | Planned     |
| **E** | Optional formal verification or specialized SSE review for hot paths | Future      |

No timeline dates are promised until a reviewer is engaged. When an audit starts or completes, this page will be updated with scope, vendor (if public), and a link to the report.

Product hardening (refusing weakening knobs, KDF, AAD, leakage) is separate and listed in [Security ahead](./security-ahead) — also without dates, so you can prepare.

### How to help

- File security findings via responsible disclosure on the GitHub repository.
- Prefer concrete PoCs against stated guarantees over marketing debates.
- If you sponsor or run a review, open an issue so Phase C can be marked in progress.

---

## Related docs

- [Mission & responsibility](./mission) — first-line privacy while AI is built; who owns what
- [Do this first (this week)](./do-this-first) — what to do on 1.3.x before anything else
- [Security ahead](./security-ahead) — planned protection raises; no surprise cuts
- [Zero-Knowledge Security](./zero-knowledge-security) — primitives and architecture
- [Security, RBAC & Audit](./security-compliance) — product controls (not a compliance certificate)
- [What's New in 1.3.1](./whats-new) — docs only; no extra code
- [Positioning](./positioning) — when to use / not use FLASH
