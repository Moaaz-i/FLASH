import fs from "node:fs";
import readline from "node:readline";

/**
 * Generic data pipeline: NDJSON ↔ collections (streaming batches).
 */
export class FlashPipeline {
  /**
   * @param {import('../client/flash_client.mjs').FlashClient} client
   */
  constructor(client) {
    this.client = client;
    this._source = null;
    this._dest = null;
    this._batchSize = 500;
  }

  fromNDJSON(filePath) {
    this._source = { type: "ndjson", path: filePath };
    return this;
  }

  fromCollection(name, query = {}) {
    this._source = { type: "collection", name, query };
    return this;
  }

  toCollection(name) {
    this._dest = { type: "collection", name };
    return this;
  }

  toNDJSON(filePath) {
    this._dest = { type: "ndjson", path: filePath };
    return this;
  }

  batchSize(n) {
    this._batchSize = Math.max(1, Number(n) || 500);
    return this;
  }

  async run() {
    if (!this._source || !this._dest) {
      throw new Error("FlashPipeline requires source and destination");
    }

    if (this._source.type === "ndjson" && this._dest.type === "collection") {
      return await this._importNDJSON();
    }
    if (this._source.type === "collection" && this._dest.type === "ndjson") {
      return await this._exportNDJSON();
    }
    if (
      this._source.type === "collection" &&
      this._dest.type === "collection"
    ) {
      return await this._copyCollection();
    }
    throw new Error("Unsupported pipeline route");
  }

  async _importNDJSON() {
    const col = this.client.collection(this._dest.name);
    await col.init();
    const stream = fs.createReadStream(this._source.path);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let batch = [];
    let importedCount = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;
      batch.push(JSON.parse(line));
      if (batch.length >= this._batchSize) {
        const res = await col.insertMany(batch);
        importedCount += res.insertedCount;
        batch = [];
      }
    }
    if (batch.length > 0) {
      const res = await col.insertMany(batch);
      importedCount += res.insertedCount;
    }
    return { importedCount, destination: this._dest.name };
  }

  async _exportNDJSON() {
    const col = this.client.collection(this._source.name);
    await col.init();
    const docs = await col.find(this._source.query || {}).exec();
    const ws = fs.createWriteStream(this._dest.path, { encoding: "utf8" });
    for (const doc of docs) {
      ws.write(`${JSON.stringify(doc)}\n`);
    }
    await new Promise((resolve, reject) => {
      ws.end(resolve);
      ws.on("error", reject);
    });
    return { exportedCount: docs.length, filePath: this._dest.path };
  }

  async _copyCollection() {
    const src = this.client.collection(this._source.name);
    const dst = this.client.collection(this._dest.name);
    await src.init();
    await dst.init();
    const docs = await src.find(this._source.query || {}).exec();
    let copied = 0;
    for (let i = 0; i < docs.length; i += this._batchSize) {
      const batch = docs.slice(i, i + this._batchSize);
      const res = await dst.insertMany(batch);
      copied += res.insertedCount;
    }
    return { copied, from: this._source.name, to: this._dest.name };
  }
}
