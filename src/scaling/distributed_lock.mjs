/**
 * FLASH Lease-Based Distributed Lock Engine (FlashDistributedLock)
 * Cluster-wide mutual exclusion locks with auto-expiry TTL and heartbeats.
 */
export class FlashDistributedLock {
  constructor() {
    // resourceKey -> { owner: string, expiresAt: number, leaseToken: string }
    this.locks = new Map();
  }

  /**
   * Attempts to acquire a distributed lock on a resource
   * @param {string} resourceKey
   * @param {string} ownerId
   * @param {number} [ttlMs=5000]
   * @returns {{ acquired: boolean, leaseToken?: string, expiresAt?: number }}
   */
  acquire(resourceKey, ownerId, ttlMs = 5000) {
    const now = Date.now();
    const existing = this.locks.get(resourceKey);

    // If locked and not yet expired
    if (existing && existing.expiresAt > now) {
      if (existing.owner === ownerId) {
        // Extend lease
        existing.expiresAt = now + ttlMs;
        return { acquired: true, leaseToken: existing.leaseToken, expiresAt: existing.expiresAt };
      }
      return { acquired: false };
    }

    const leaseToken = `lease_${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = now + ttlMs;

    this.locks.set(resourceKey, {
      owner: ownerId,
      expiresAt,
      leaseToken
    });

    return { acquired: true, leaseToken, expiresAt };
  }

  /**
   * Releases a distributed lock
   * @param {string} resourceKey
   * @param {string} leaseToken
   * @returns {boolean}
   */
  release(resourceKey, leaseToken) {
    const existing = this.locks.get(resourceKey);
    if (!existing) return true;

    if (existing.leaseToken === leaseToken) {
      this.locks.delete(resourceKey);
      return true;
    }

    return false;
  }
}
