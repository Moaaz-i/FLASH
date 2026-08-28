# What's New in FLASH 1.3.1

**FLASH `1.3.1` is the current release. It is a documentation release — no extra code.**

This version exists to say, in advance and in public:

1. FLASH’s mission is **first-line privacy while AI is built**.
2. **Protection is the priority.**
3. **By default `flash-zk` is strong.** The developer can weaken it. It stays strongest when the developer **keeps the key** and leaves protection on.
4. **What comes next** is written now: [Security ahead](/guide/security-ahead) — so refusing plaintext, Merkle-off, and later floor-raises are not a surprise.

There is **no** new engine, cipher, API, CLI flag, or test in `1.3.1`. Crypto and fail-closed defaults are exactly `1.3.0`. If you already run `1.3.0`, you do not need to change application code.

| This release                                                                                   | Not this release                                                                |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Mission & responsibility](/guide/mission)                                                     | New encryption                                                                  |
| [Do this first](/guide/do-this-first)                                                          | Engine changes — **announced first** in [Security ahead](/guide/security-ahead) |
| [Security ahead](/guide/security-ahead) — what will be refused later, so you are not surprised | Closing those knobs **in this version** (no extra code here)                    |
| Honest split: default strong / developer can weaken / keep the key                             | New knobs, new modules, new dependencies                                        |

Full changelog: [Release Notes](/guide/release-notes).

::: warning Do this first (this week)
**Default `flash-zk` is strong.** You can weaken it; it stays strong if you keep the key and leave protection on. Seal the key with `flashsh wrap-key`, gitignore `.flash-wrap`, and do not use `allowPlaintextFields` or `disableMerkle`. Those knobs will be refused later — [Security ahead](/guide/security-ahead). [Mission](/guide/mission) · [Do this first](/guide/do-this-first). There is still **no external audit** — [Trust Model](/guide/trust-model).
:::

---

## Upgrade from 1.3.0

Nothing. Same package API. Same on-disk format. Same `flashsh wrap-key`. Read [Mission](/guide/mission), then [Do this first](/guide/do-this-first), then [Security ahead](/guide/security-ahead) so later refuses are not a surprise.

---

## Still in effect from 1.3.0 / 1.2.0

Key wrapping (`FLASHTAKE1`), fail-closed `authKey` / console `token`, weak-secret rejection, plaintext fields only via `allowPlaintextFields`. See [v1.3.0 notes](/guide/release-notes#v1-3-0--key-wrapping--earned-trust) and [v1.2.0](/guide/release-notes#v1-2-0-trust-defaults-fail-closed).
