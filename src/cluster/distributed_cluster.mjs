import crypto from 'node:crypto';
import { FlashDistributedTxCoordinator } from './distributed_tx.mjs';

/**
 * FLASH Distributed Cluster Manager (FlashCluster)
 * Implements Consistent Hashing Ring with virtual nodes for Horizontal Sharding
 * and Zero-Knowledge multi-node replication without cluster nodes needing master keys.
 */
export class FlashCluster {
  /**
   * @param {object} [options]
   * @param {number} [options.virtualNodes=64]
   */
  constructor(options = {}) {
    this.virtualNodes = options.virtualNodes || 64;
    this.shards = new Map(); // shardId -> FlashDatabase
    this.ring = [];          // Array of { hash: number, shardId: string }
    this.coordinator = new FlashDistributedTxCoordinator(this);
  }

  /**
   * Adds a physical/logical shard node to the cluster
   * @param {string} shardId - e.g. 'shard_us_east', 'shard_eu_west'
   * @param {import('../core/database.mjs').FlashDatabase} dbInstance
   */
  addShard(shardId, dbInstance) {
    this.shards.set(shardId, dbInstance);

    for (let i = 0; i < this.virtualNodes; i++) {
      const vNodeKey = `${shardId}#vnode_${i}`;
      const hash = this._hashKey(vNodeKey);
      this.ring.push({ hash, shardId });
    }

    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Removes a shard from the cluster ring
   * @param {string} shardId
   */
  removeShard(shardId) {
    this.shards.delete(shardId);
    this.ring = this.ring.filter(n => n.shardId !== shardId);
  }

  /**
   * Hashes a key to a 32-bit unsigned integer
   * @param {string} key
   * @returns {number}
   */
  _hashKey(key) {
    const digest = crypto.createHash('md5').update(String(key)).digest();
    return digest.readUInt32BE(0);
  }

  /**
   * Finds the target shard for a given document key using binary search on the hash ring
   * @param {string} docKey
   * @returns {{ shardId: string, db: import('../core/database.mjs').FlashDatabase }}
   */
  getShardForKey(docKey) {
    if (this.ring.length === 0) {
      throw new Error('No shards available in the cluster ring');
    }

    const keyHash = this._hashKey(docKey);

    // Binary search on sorted ring
    let low = 0;
    let high = this.ring.length - 1;
    let targetIdx = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash >= keyHash) {
        targetIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const shardId = this.ring[targetIdx].shardId;
    return {
      shardId,
      db: this.shards.get(shardId)
    };
  }

  /**
   * Returns list of all active shards
   * @returns {string[]}
   */
  listShards() {
    return Array.from(this.shards.keys());
  }

  /**
   * Returns the distributed 2PC transaction coordinator
   * @returns {FlashDistributedTxCoordinator}
   */
  getTxCoordinator() {
    return this.coordinator;
  }
}

export { FlashDistributedTxCoordinator };

