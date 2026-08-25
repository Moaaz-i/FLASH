# What's New in FLASH 1.3.0

**FLASH `1.3.0` is the current release.** It adds **developer-owned key wrapping**, an **honest trust model**, and refreshed docs — without changing the crypto primitives from 1.2.0.

Full changelog: [Release Notes](/guide/release-notes).

::: warning Security remains yours
Key wrapping and docs do **not** move security responsibility to FLASH. There is still **no external audit**. Read [Trust Model & Audit Roadmap](/guide/trust-model) before production.
:::

---

## Key wrapping (`flashsh wrap-key`)

Seal your master `secretKey` so `.flash-take` can live in git while `.flash-wrap` stays local:

```bash
flashsh wrap-key
# Done. — secrets are not printed
```

| File | Role |
| ---- | ---- |
| `.flash-wrap` | `flash_wrap_…` — **you** gitignore this in your app repo |
| `.flash-take` | `FLASHTAKE1` + sealed master — safe to commit without the wrap file |

`FlashClient` with no `secretKey` unseals automatically when both files (or `FLASH_WRAP_KEY` + `.flash-take`) are present. **Only `FLASHTAKE1` is supported in 1.3.x.** Details: [flashsh CLI](/guide/flashsh-cli).

---

## Honest trust & documentation

- New [Trust Model & Audit Roadmap](/guide/trust-model) — limits, SSE leakage, audit phases A→E
- Tighter README / home copy — no “100% zero-knowledge” marketing; architectural ZK explained
- VitePress theme refresh (server-blind branding, showcase, dark-mode fixes)
- **198/198** tests including `key_wrap` coverage

---

## Still in effect from 1.2.0

Fail-closed defaults unchanged:

- `FlashServer` / remote `FlashClient` require strong `authKey`
- Console requires `token`; plaintext fields require `allowPlaintextFields: true`
- Weak secrets rejected; public bind is opt-in

See [Release Notes — v1.2.0](/guide/release-notes#v1-2-0-trust-defaults-fail-closed) for the full list.

---

## Upgrade from 1.2.0

No breaking API changes. Optional:

```bash
flashsh wrap-key --dir ./config
echo ".flash-wrap" >> .gitignore   # in YOUR project
```

Existing `secretKey` in env/code continues to work.

```javascript
import { FlashClient } from "flash-zk";

const client = new FlashClient({
  storagePath: "./flash_data",
  wrapKeyDir: "./config", // optional
});
```

Limits and audit roadmap: [Trust Model](/guide/trust-model).
