# Enterprise Security, RBAC & Compliance Tools

**FLASH DB** ships governance helpers for access control, audit trails, and PII masking. These are **application controls**, not a claim that your deployment is SOC 2, HIPAA, or GDPR certified.

For what FLASH cryptographically promises — and does not — see [Trust Model & Audit Roadmap](/guide/trust-model).

---

## 1. Cryptographic Audit Vault (`FlashAuditVault`)

HMAC-chained append-only logs for sensitive database events (tamper-evident within the vault’s threat model):

```javascript
import { FlashAuditVault } from "flash-zk";

const vault = new FlashAuditVault("secure_vault_secret_2026");

// Log action
vault.log("dr_smith", "READ", "patient_record_456", { ip: "10.0.0.1" });

// Verify cryptographic chain
const check = vault.verifyChain();
console.log(check.valid); // true
```

---

## 2. Role-Based Access Control (`FlashRBAC`)

Pass the same instance into `FlashServer` so network operations are authorized without the server reading documents:

```javascript
import { FlashRBAC, FlashServer } from "flash-zk";

const rbac = new FlashRBAC();
rbac.createRole("doctor", ["patients:read", "prescriptions:write"]);
rbac.assignRole("user_123", "doctor");

FlashServer.start({
  authKey: "cluster-secret-16b+",
  rbac,
});
// Clients send header x-flash-user: user_123 (and x-flash-server-key)
```

---

## 3. Dynamic PII Data Masking (`FlashDataMasker`)

```javascript
import { FlashDataMasker } from "flash-zk";

const masked = FlashDataMasker.maskDocument(
  { name: "John Doe", email: "john.doe@company.com", card: "4111222233334444" },
  { email: "email", card: "card" },
);

console.log(masked.email); // 'j******e@company.com'
console.log(masked.card); // '****-****-****-4444'
```

---

## 4. Key wrapping (`.flash-wrap` / `.flash-take`)

Seal the master `secretKey` under a local wrap key so the sealed blob can live in git.

::: warning Keep the key (v1.3.0)
Key wrapping is sealing, not a certification. Default `flash-zk` is strong **if** you gitignore `.flash-wrap`, rotate keys, and protect CI. Leaking the wrap file weakens FLASH. Only format **`FLASHTAKE1`** is supported in this release.
:::

```bash
npx flashsh wrap-key
# Done. — secrets are not printed
```

- **`.flash-wrap`** — `flash_wrap_…` (keep out of git in **your** project; or `FLASH_WRAP_KEY` in CI)
- **`.flash-take`** — `FLASHTAKE1` + AES-GCM sealed master — commit-safe without the wrap file

Full CLI flow: [flashsh CLI](/guide/flashsh-cli).
