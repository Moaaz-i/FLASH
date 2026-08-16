/**
 * FLASH Client Connection Pool & Load Balancer (FlashConnectionPool)
 * Reusable socket/client connections with round-robin dispatch, health-checks, and failover.
 */
export class FlashConnectionPool {
  /**
   * @param {string[]} serverEndpoints - e.g. ['http://127.0.0.1:6742', 'http://127.0.0.1:6743']
   * @param {object} [options]
   * @param {number} [options.maxConnectionsPerHost=10]
   */
  constructor(serverEndpoints = [], options = {}) {
    this.endpoints = serverEndpoints.length > 0 ? serverEndpoints : ['http://127.0.0.1:6742'];
    this.maxConnections = options.maxConnectionsPerHost || 10;
    this.currentIndex = 0;
    // endpoint -> { activeCount: number, healthy: boolean }
    this.pool = new Map();

    for (const ep of this.endpoints) {
      this.pool.set(ep, { activeCount: 0, healthy: true });
    }
  }

  /**
   * Acquires the next available healthy server endpoint
   * @returns {string} Endpoint URL
   */
  acquire() {
    const healthyEndpoints = this.endpoints.filter(ep => this.pool.get(ep)?.healthy);
    if (healthyEndpoints.length === 0) {
      throw new Error('No healthy server endpoints available in ConnectionPool');
    }

    const endpoint = healthyEndpoints[this.currentIndex % healthyEndpoints.length];
    this.currentIndex++;

    const entry = this.pool.get(endpoint);
    if (entry) entry.activeCount++;

    return endpoint;
  }

  /**
   * Releases an endpoint connection back to the pool
   * @param {string} endpoint
   */
  release(endpoint) {
    const entry = this.pool.get(endpoint);
    if (entry && entry.activeCount > 0) {
      entry.activeCount--;
    }
  }

  /**
   * Marks an endpoint health state
   */
  setHealthy(endpoint, isHealthy) {
    if (this.pool.has(endpoint)) {
      this.pool.get(endpoint).healthy = isHealthy;
    }
  }
}
