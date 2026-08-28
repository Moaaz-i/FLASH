# Security ahead (so you are not surprised)

`1.3.1` adds **no extra code**. This page is what `flash-zk` intends to do **next** to raise protection. Read it now so a later engine release is not a shock.

**Default `flash-zk` is already strong.** What follows is closing ways to weaken it, then raising the floor. Dates are not promised. Order is.

Full mission: [Mission & responsibility](/guide/mission). What to do on today’s runtime: [Do this first](/guide/do-this-first).

---

## Prepare now — these knobs will be refused

On `1.3.x` they still compile. Using them is you weakening FLASH. A later release will **reject** them (or reject new writes). Migrate while it is still optional.

| Today (`1.3.x`) | Later engine |
| --------------- | ------------ |
| `allowPlaintextFields: true` | Refused. New writes are encrypted. Old plaintext may still **read** for migration, then that path closes too. |
| `fieldPolicy: { …: "plaintext" }` | Same. Use `"encrypted"` · `"exact"` · `"searchable"` · `"counter"`. |
| `disableMerkle: true` | Refused outside tests. Integrity is not a speed switch. |
| `performanceProfile: "turbo"` turning Merkle off by default | `turbo` stays throughput (larger memtable, deferred Merkle). Merkle stays **on**. Set `disableMerkle: false` now if you use turbo. |
| Weak / missing `authKey` or console `token` | Already refused. No bypass coming. |
| Decrypt or plaintext merge on `FlashServer` / gRPC / wire | Already refused. No “ops backdoor” will be added. |

If your app depends on plaintext fields or Merkle-off, change it **this week**. Waiting for the refuse is the surprise we are warning you about.

---

## After the knobs close — raising the floor

Still **not in `1.3.1`**. Planned so the default gets harder without asking you to invent crypto:

1. **Honest KDF** — scrypt or Argon2id as the main stretch; `pqcHardened` renamed or made default. It is **not** NIST ML-KEM. Do not build a “we are post-quantum” story on today’s flag.
2. **`flashsh wrap-key` helps keep the key** — e.g. writing `.flash-wrap` into `.gitignore` when missing. FLASH still does not hold the wrap secret.
3. **Stricter AAD** — ciphertext bound to tenant, key version, collection, record, field. Legacy envelopes without AAD: read for a while, **new writes refused**.
4. **KEK / DEK** — per-record or per-collection data keys wrapped by the tenant key, so one stolen file is not the whole vault.
5. **Less searchable leakage** — stronger honey padding, fixed-size envelopes (hide length). Optional “volume-blind” query path later (more I/O, less pattern leak). Vector indexes in the hard path stay on the client or stay tokenized — not raw embeddings on a blind server.

Independent audit remains the [Trust Model](/guide/trust-model) roadmap (Phases B–E). Hardening the product and paying a reviewer are not the same work.

---

## Later, not a surprise either

These are **possible**, not scheduled, and will be announced the same way — in docs **before** code:

- Hybrid wrap with a real KEM (ML-KEM) **when** it exists in FLASH — today’s `FlashPQC` is classical ECDH + stretching.
- Threshold / hardware-backed keys (Shamir, TPM). Optional. FLASH will not silently become the keyholder.

---

## What will not appear without warning

You should **not** wake up to:

- A server-side decrypt “for support” or “for compliance”
- Encryption turned into an opt-in plugin
- A claim that indexes leak nothing, or that ciphertext is unbreakable
- zk-SNARKs as a requirement to open a collection
- A second “citadel” mode whose only job is to put protection back on a switch (the default **is** the strong path; weakening is what goes away)

---

## What you do not wait for

Do not delay [Do this first](/guide/do-this-first) until Argon2, ML-KEM, or an audit. Keep the key. Leave protection on. The next engine change is easier if you already live on the default.

---

## See also

- [What's new in 1.3.1](/guide/whats-new) — this version is docs only
- [Trust Model](/guide/trust-model) — limits and external audit phases
- [Zero-Knowledge Security](/guide/zero-knowledge-security) — primitives as they ship today
