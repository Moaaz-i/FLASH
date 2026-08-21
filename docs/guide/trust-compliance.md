# Trust, Compliance & Security Tools

---

## FlashIntegrityProof

Export signed Merkle root + invariant report for audit.

```javascript
const proof = await client.integrityProof('notes', { actor: 'auditor' });

import { FlashIntegrityProof } from '@moaaz-i/flash-db';
FlashIntegrityProof.verify(proof, client.secretKey); // true
```

---

## FlashComplianceExport

GDPR-style subject export and signed delete attestation.

```javascript
const compliance = client.complianceExport();

const export_ = await compliance.exportSubjectData('users', { email: 'user@example.com' });

const attestation = await compliance.eraseSubjectData(
  'users',
  { email: 'user@example.com' },
  'dpo',
);
// attestation.signature — HMAC proof of deletion
```

---

## FlashPromptFirewall

Scan prompts/responses for PII and secrets before sending to external LLMs.

```javascript
import { FlashPromptFirewall } from '@moaaz-i/flash-db';

const scan = FlashPromptFirewall.scan(userPrompt);
if (!scan.safe) {
  console.log(scan.violations);  // ['email', 'api_key']
  console.log(scan.redacted);      // redacted text
}

FlashPromptFirewall.assertSafe(prompt); // throws if unsafe
```

Detected patterns: email, phone, SSN, API keys, credit cards.

---

## FlashDifferentialPrivacy

Noisy aggregates for privacy-preserving analytics.

```javascript
import { FlashDifferentialPrivacy } from '@moaaz-i/flash-db';

const noisyCount = FlashDifferentialPrivacy.noisyCount(1000, 1.0);
const noisySum = FlashDifferentialPrivacy.noisySum(50000, 100, 0.5);
```

---

## FlashKeyCeremony

Split master key into XOR shards (all shards required to reconstruct).

```javascript
import { FlashKeyCeremony } from '@moaaz-i/flash-db';

const ceremony = new FlashKeyCeremony(3);
const shards = ceremony.split(masterKeyHex);
const restored = ceremony.combine(shards);
```

---

## FlashTimeSeal

Append-only tamper-evident timestamp chain for legal hold.

```javascript
const seal = client.timeSeal('./audit/time.seal.json');
seal.seal('document.ingest', { docId: 'abc' });
seal.seal('document.query', { collection: 'users' });
seal.verify(); // { valid: true, entries: 2 }
```

---

## FlashSealedVault

Passphrase-sealed vault with auto-lock and isolated key domain.

```javascript
const vault = client.sealedVault('credentials', { autoLockMs: 300_000 });
vault.unlock('my-passphrase');
await vault.put('openai_key', { value: 'sk-...' });
const record = await vault.get('openai_key');
vault.lock();
```

---

## FlashAuditStream

Change stream wired to tamper-proof audit chain.

```javascript
const audit = client.auditStream('users').watch('admin@corp');
// mutations emit signed audit entries
audit.verify();
audit.getAuditTrail();
```
