import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Append-only time-sealed chain for legal hold and tamper-evident timestamps.
 */
export class FlashTimeSeal {
  /**
   * @param {string} sealPath
   * @param {string} secretKey
   */
  constructor(sealPath, secretKey) {
    this.sealPath = sealPath;
    this.secretKey = secretKey;
    this.chain = [];
    if (fs.existsSync(sealPath)) {
      try {
        this.chain = JSON.parse(fs.readFileSync(sealPath, "utf-8"));
      } catch {
        this.chain = [];
      }
    }
  }

  seal(event, payload = {}) {
    const prevHash = this.chain.length
      ? this.chain[this.chain.length - 1].hash
      : "0".repeat(64);
    const ts = Date.now();
    const body = { event, payload, ts, prevHash };
    const hash = crypto
      .createHmac("sha256", this.secretKey)
      .update(JSON.stringify(body))
      .digest("hex");
    const entry = { ...body, hash };
    this.chain.push(entry);
    fs.mkdirSync(path.dirname(this.sealPath), { recursive: true });
    fs.writeFileSync(this.sealPath, JSON.stringify(this.chain, null, 2));
    return entry;
  }

  verify() {
    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const expectedPrev =
        i > 0 ? this.chain[i - 1].hash : "0".repeat(64);
      if (entry.prevHash !== expectedPrev) {
        return { valid: false, brokenAt: i };
      }
      const { hash, ...body } = entry;
      void hash;
      const expected = crypto
        .createHmac("sha256", this.secretKey)
        .update(JSON.stringify(body))
        .digest("hex");
      if (entry.hash !== expected) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true, entries: this.chain.length };
  }
}
