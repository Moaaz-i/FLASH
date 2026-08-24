# Enterprise Security, RBAC & Compliance

**FLASH DB** delivers military-grade governance and compliance tools (SOC2, HIPAA, GDPR).

---

## 1. Cryptographic Audit Vault (`FlashAuditVault`)

Tamper-proof, HMAC-chained append-only logs for all sensitive database events:

```javascript
import { FlashAuditVault } from "flash-zk";

const vault = new FlashAuditVault("secure_vault_secret_2026");

// Log action
vault.log("dr_smith", "READ", "patient_record_456", { ip: "10.0.0.1" });

// Verify cryptographic chain
const check = vault.verifyChain();
console.log(check.valid); // true!
```

---

## 2. Role-Based Access Control (`FlashRBAC`)

````javascript
import { FlashRBAC } from 'flash-zk';

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
````

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
