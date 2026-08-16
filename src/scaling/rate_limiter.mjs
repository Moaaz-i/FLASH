/**
 * FLASH Distributed Token Bucket Rate Limiter (FlashRateLimiter)
 * High-throughput sliding token bucket algorithm for API throttling and client request quotas.
 */
export class FlashRateLimiter {
  /**
   * @param {object} [options]
   * @param {number} [options.capacity=100] - Max burst tokens
   * @param {number} [options.refillRatePerSec=50] - Token replenish rate
   */
  constructor(options = {}) {
    this.capacity = options.capacity || 100;
    this.refillRate = options.refillRatePerSec || 50;
    // clientId -> { tokens: number, lastRefill: number }
    this.buckets = new Map();
  }

  /**
   * Attempts to consume tokens for a given client key
   * @param {string} clientId - IP or API Key
   * @param {number} [cost=1]
   * @returns {{ allowed: boolean, remainingTokens: number, retryAfterMs: number }}
   */
  consume(clientId, cost = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(clientId, bucket);
    } else {
      // Refill tokens based on elapsed time
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      const refilled = elapsedSec * this.refillRate;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remainingTokens: Math.floor(bucket.tokens), retryAfterMs: 0 };
    }

    const missingTokens = cost - bucket.tokens;
    const retryAfterMs = Math.ceil((missingTokens / this.refillRate) * 1000);
    return { allowed: false, remainingTokens: 0, retryAfterMs };
  }

  /**
   * Resets rate limit for a client
   */
  reset(clientId) {
    this.buckets.delete(clientId);
  }
}
