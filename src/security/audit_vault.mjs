import crypto from 'node:crypto';

/**
 * FLASH Cryptographic Audit Vault (FlashAuditVault)
 * Tamper-proof, append-only compliance audit trail with Merkle hash chaining (SOC2 / HIPAA / GDPR).
 */
export class FlashAuditVault {
  /**
   * @param {string} [vaultSecret]
   */
  constructor(vaultSecret = 'flash_audit_secret_2026') {
    this.secret = vaultSecret;
    // Array of { id: string, action: string, actor: string, target: string, timestamp: number, prevHash: string, hash: string }
    this.chain = [];
  }

  /**
   * Appends an immutable audit log entry
   * @param {string} actor - User / Service ID
   * @param {string} action - 'READ' | 'WRITE' | 'DELETE' | 'KEY_ROTATION'
   * @param {string} target - Collection or Document ID
   * @param {object} [metadata]
   * @returns {object} The appended audit entry
   */
  log(actor, action, target, metadata = {}) {
    const prevHash = this.chain.length > 0 ? this.chain[this.chain.length - 1].hash : '0'.repeat(64);
    const timestamp = Date.now();
    const id = `audit_${this.chain.length + 1}`;

    const payload = `${id}:${actor}:${action}:${target}:${timestamp}:${prevHash}:${JSON.stringify(metadata)}`;
    const hash = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');

    const entry = {
      id,
      actor,
      action,
      target,
      timestamp,
      metadata,
      prevHash,
      hash
    };

    this.chain.push(entry);
    return entry;
  }

  /**
   * Verifies the cryptographic integrity of the entire audit trail
   * @returns {{ valid: boolean, totalEntries: number, brokenAt?: number }}
   */
  verifyChain() {
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const expectedPrevHash = i > 0 ? this.chain[i - 1].hash : '0'.repeat(64);

      if (entry.prevHash !== expectedPrevHash) {
        return { valid: false, totalEntries: this.chain.length, brokenAt: i };
      }

      const payload = `${entry.id}:${entry.actor}:${entry.action}:${entry.target}:${entry.timestamp}:${entry.prevHash}:${JSON.stringify(entry.metadata)}`;
      const recomputedHash = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');

      if (entry.hash !== recomputedHash) {
        return { valid: false, totalEntries: this.chain.length, brokenAt: i };
      }
    }

    return { valid: true, totalEntries: this.chain.length };
  }
}
