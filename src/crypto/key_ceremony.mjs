import crypto from "node:crypto";

/**
 * Multi-party key ceremony — split master key into XOR shards (all shards required).
 */
export class FlashKeyCeremony {
  /**
   * @param {number} totalShards
   */
  constructor(totalShards = 3) {
    if (totalShards < 2) throw new Error("totalShards must be >= 2");
    this.totalShards = totalShards;
  }

  /**
   * @param {string} masterKeyHex - 64-char hex (32 bytes)
   * @returns {Array<{ index: number, shard: string }>}
   */
  split(masterKeyHex) {
    const keyBuf = Buffer.from(
      masterKeyHex.padEnd(64, "0").slice(0, 64),
      "hex",
    );
    const shards = [];
    let xorAcc = Buffer.alloc(keyBuf.length);

    for (let i = 0; i < this.totalShards - 1; i++) {
      const shard = crypto.randomBytes(keyBuf.length);
      shards.push({ index: i + 1, shard: shard.toString("hex") });
      xorAcc = Buffer.from(xorAcc.map((b, j) => b ^ shard[j]));
    }

    const last = Buffer.from(keyBuf.map((b, j) => b ^ xorAcc[j]));
    shards.push({ index: this.totalShards, shard: last.toString("hex") });
    return shards;
  }

  /**
   * @param {Array<{ index: number, shard: string }>} shards - all shards required
   */
  combine(shards) {
    if (shards.length < this.totalShards) {
      throw new Error(`Need all ${this.totalShards} shards to reconstruct key`);
    }
    const len = Buffer.from(shards[0].shard, "hex").length;
    const out = Buffer.alloc(len);
    for (const s of shards) {
      const buf = Buffer.from(s.shard, "hex");
      for (let i = 0; i < len; i++) out[i] ^= buf[i];
    }
    return out.toString("hex");
  }
}
