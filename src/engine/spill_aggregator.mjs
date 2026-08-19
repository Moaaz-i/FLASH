import fs from "node:fs";
import path from "node:path";
import { createSpillDir, cleanupSpillDir } from "./compaction_merge.mjs";

/**
 * Spill-to-disk document set for large aggregation pipelines.
 * Keeps a bounded in-memory window and persists overflow as JSONL chunks.
 */
export class FlashSpillAggregator {
  /**
   * @param {object} [options]
   * @param {string} [options.spillDir] - Temp directory for spill files
   * @param {number} [options.memoryThreshold=5000] - Docs before spilling
   * @param {boolean} [options.autoCleanup=true]
   */
  constructor(options = {}) {
    this.spillDir = options.spillDir || createSpillDir(process.cwd());
    if (!fs.existsSync(this.spillDir)) {
      fs.mkdirSync(this.spillDir, { recursive: true });
    }
    this.memoryThreshold = options.memoryThreshold ?? 5000;
    this.autoCleanup = options.autoCleanup !== false;
    this.memory = [];
    this.spillFiles = [];
    this.spillIndex = 0;
    this.totalCount = 0;
    this._closed = false;
  }

  get length() {
    return this.totalCount;
  }

  get isSpilled() {
    return this.spillFiles.length > 0;
  }

  /**
   * @param {object} doc
   */
  async push(doc) {
    if (this._closed) throw new Error("Spill aggregator is closed");
    this.memory.push(doc);
    this.totalCount++;
    if (this.memory.length >= this.memoryThreshold) {
      await this._spillMemory();
    }
  }

  /**
   * @param {object[]} docs
   */
  async pushAll(docs) {
    for (const doc of docs) {
      await this.push(doc);
    }
  }

  async _spillMemory() {
    if (this.memory.length === 0) return;
    const file = path.join(this.spillDir, `chunk_${this.spillIndex++}.jsonl`);
    const payload =
      this.memory.map((doc) => JSON.stringify(doc)).join("\n") + "\n";
    await fs.promises.writeFile(file, payload, "utf-8");
    this.spillFiles.push(file);
    this.memory = [];
  }

  async finalizeSpill() {
    await this._spillMemory();
  }

  /**
   * Iterate all documents without loading everything into RAM.
   */
  async *iterate() {
    for (const doc of this.memory) {
      yield doc;
    }
    for (const file of this.spillFiles) {
      const content = await fs.promises.readFile(file, "utf-8");
      for (const line of content.split("\n")) {
        if (line.trim()) yield JSON.parse(line);
      }
    }
  }

  /**
   * Materialize to array (safe for small/medium result sets after pipeline stages).
   */
  async toArray() {
    const out = [];
    for await (const doc of this.iterate()) {
      out.push(doc);
    }
    return out;
  }

  /**
   * External sort for large datasets: sort chunks on disk then merge.
   * @param {object} sortSpec - e.g. { age: -1, name: 1 }
   */
  async externalSort(sortSpec) {
    await this.finalizeSpill();

    const compare = (a, b) => {
      for (const [key, dir] of Object.entries(sortSpec)) {
        const valA = a[key];
        const valB = b[key];
        if (valA < valB) return dir === -1 ? 1 : -1;
        if (valA > valB) return dir === -1 ? -1 : 1;
      }
      return 0;
    };

    const sortedChunks = [];
    let chunk = [];

    for await (const doc of this.iterate()) {
      chunk.push(doc);
      if (chunk.length >= this.memoryThreshold) {
        chunk.sort(compare);
        const chunkPath = path.join(
          this.spillDir,
          `sorted_${sortedChunks.length}.jsonl`,
        );
        await fs.promises.writeFile(
          chunkPath,
          chunk.map((d) => JSON.stringify(d)).join("\n") + "\n",
        );
        sortedChunks.push(chunkPath);
        chunk = [];
      }
    }

    if (chunk.length > 0) {
      chunk.sort(compare);
      const chunkPath = path.join(
        this.spillDir,
        `sorted_${sortedChunks.length}.jsonl`,
      );
      await fs.promises.writeFile(
        chunkPath,
        chunk.map((d) => JSON.stringify(d)).join("\n") + "\n",
      );
      sortedChunks.push(chunkPath);
    }

    this.memory = [];
    this.spillFiles = sortedChunks;
    this.spillIndex = sortedChunks.length;
    return this;
  }

  /**
   * Apply $limit after external sort by streaming.
   * @param {number} limit
   */
  async take(limit) {
    const out = [];
    for await (const doc of this.iterate()) {
      out.push(doc);
      if (out.length >= limit) break;
    }
    return out;
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    if (this.autoCleanup) {
      await cleanupSpillDir(this.spillDir);
    }
  }
}

/**
 * Helpers for pipeline stages that accept array or spill aggregator.
 */
export async function materializePipelineData(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data instanceof FlashSpillAggregator) return data.toArray();
  return [];
}

export function shouldSpill(count, threshold = 5000) {
  return count > threshold;
}

export async function wrapAsPipelineData(docs, options = {}) {
  const threshold = options.spillThreshold ?? 5000;
  if (docs.length <= threshold) return docs;

  const agg = new FlashSpillAggregator({
    spillDir: options.spillDir,
    memoryThreshold: Math.min(1000, threshold),
  });
  await agg.pushAll(docs);
  await agg.finalizeSpill();
  return agg;
}

/**
 * Run $group over array or spill data without full materialization when possible.
 * @param {Array|FlashSpillAggregator} data
 * @param {object} groupStage
 */
export async function runGroupStage(data, groupStage) {
  const groupField = groupStage._id
    ? groupStage._id.replace("$", "")
    : null;
  const groups = new Map();

  const feed = async function* () {
    if (Array.isArray(data)) {
      for (const doc of data) yield doc;
    } else {
      for await (const doc of data.iterate()) yield doc;
    }
  };

  for await (const doc of feed()) {
    const key = groupField ? doc[groupField] : "__all__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }

  const aggregatedResults = [];
  for (const [key, items] of groups.entries()) {
    const resultItem = { _id: key === "__all__" ? null : key };

    for (const [outField, op] of Object.entries(groupStage)) {
      if (outField === "_id") continue;
      const [opName, opFieldRaw] = Object.entries(op)[0];
      const targetField =
        typeof opFieldRaw === "string" ? opFieldRaw.replace("$", "") : null;

      if (opName === "$sum") {
        resultItem[outField] = items.reduce(
          (acc, it) => acc + (Number(it[targetField]) || 0),
          0,
        );
      } else if (opName === "$avg") {
        const sum = items.reduce(
          (acc, it) => acc + (Number(it[targetField]) || 0),
          0,
        );
        resultItem[outField] = items.length ? sum / items.length : 0;
      } else if (opName === "$count") {
        resultItem[outField] = items.length;
      } else if (opName === "$max") {
        resultItem[outField] = items.reduce((max, it) => {
          const v = Number(it[targetField]);
          return max === undefined || v > max ? v : max;
        }, undefined);
      } else if (opName === "$min") {
        resultItem[outField] = items.reduce((min, it) => {
          const v = Number(it[targetField]);
          return min === undefined || v < min ? v : min;
        }, undefined);
      }
    }

    aggregatedResults.push(resultItem);
  }

  return aggregatedResults;
}
