# What's New in FLASH 1.2.0

**FLASH `1.2.0` is the current release.** It is fail-closed: insecure defaults that used to start anyway now refuse to start.

Full changelog: [Release Notes](/guide/release-notes).

---

## Trust by default

The engine no longer hopes you notice a missing key or an open bind. It stops.

| If you…                                           | FLASH now…                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Start `FlashServer` without `authKey`             | Refuses to start                                                        |
| Bind `0.0.0.0` without `allowPublicBind: true`    | Refuses to start                                                        |
| Connect with `uri` and no `authKey`               | Refuses to construct the client                                         |
| Open the Intelligence Console without `token`     | Refuses to start the UI                                                 |
| Use `fieldPolicy: plaintext` without opt-in       | Refuses — set `allowPlaintextFields: true` only if you accept that leak |
| Use a short or well-known `secretKey` / `authKey` | Refuses (16+ bytes in apps; common weak strings are blocked)            |
| Hit HTTP routes other than `/health`              | Requires header `x-flash-server-key`                                    |
| Call `GET /api/docs` on the console               | Requires `allowDataExplorer: true` (off by default)                     |

gRPC and replication daemons also require `authKey`. Replica sets mint a cluster key automatically.

CLI:

- `flash-server` listens on `127.0.0.1` and exits without `FLASH_AUTH_KEY` or `--authKey`.
- `flash-console` requires `FLASH_MASTER_KEY` or `--key`, then prints a dashboard token (`x-flash-token`).

Blind additive counters now carry an HMAC tag so tampered hex is not mixed into sums blindly.

---

## Speed (without weaker crypto)

AES-256-GCM, AAD binding, and PBKDF2 (100000 iterations) are unchanged. FLASH got faster by not repeating work:

- **Key derivation cache** — the same passphrase + salt is stretched once per process.
- **Lazy trash / deletion-log ciphers** — PBKDF2 for those vaults runs on first archive, not on every `FlashClient` construct.
- **Sealed-record checks** look up `_enc` in the binary table without JSON-parsing ciphertext.
- **New `.farc` frames (`FAR2`)** use CRC-32 for crash-recovery checksums. Document authenticity is still AES-GCM. Legacy `FARC` files still replay.

---

## Still new if you are on 1.0.x — architectural zero-knowledge (1.1.0)

These landed in **1.1.0** and remain the core of 1.2.0:

- **`FlashZKKernel`** — network daemons reject unsealed records and plaintext query fields. The server never takes `secretKey`.
- **SQL and GraphQL** run only through `FlashClient`. The storage engine does not evaluate those languages over plaintext.
- **`FlashRBAC`** on `FlashServer` (`x-flash-user`) authorizes operations without reading document contents.
- FLASH is a **standalone** encrypted database — not a sidecar to another store. `FlashClient.uri` accepts only `flash://`, `http://`, and `https://`.
- Example: `examples/standalone-vault`.

**Breaking from 1.0:** `FlashSQL.execute` and `FlashGraphQL` no longer accept `FlashDatabase`. Pass `FlashClient`.

---

## Upgrade checklist

```javascript
import { FlashClient, FlashServer } from "flash-zk";

const client = new FlashClient({
  secretKey: process.env.FLASH_MASTER_SECRET, // 16+ unique bytes
  storagePath: "./flash_data",
});

const server = FlashServer.start({
  port: 6742,
  host: "127.0.0.1",
  storagePath: "/var/data/flash",
  authKey: process.env.FLASH_AUTH_KEY, // required
});

client.openDashboard({
  port: 3456,
  token: process.env.FLASH_CONSOLE_TOKEN, // required
  // allowDataExplorer: true, // only if you need HTTP document listing
});
```

Remote clients must send the same `authKey` used by the daemon (`x-flash-server-key` on HTTP).

This is fail-closed engineering, not a zk-SNARK suite or an external pentest. Limits and the public audit roadmap: [Trust Model](/guide/trust-model). Related primitives: [Zero-Knowledge Security](/guide/zero-knowledge-security).
