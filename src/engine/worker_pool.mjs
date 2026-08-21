import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { mergeSSTableFiles } from "./compaction_merge.mjs";

const WORKER_SCRIPT = fileURLToPath(
  new URL("./workers/compaction_worker.mjs", import.meta.url),
);

/**
 * Pool of worker threads for CPU-heavy LSM compaction and flush tasks.
 */
export class FlashWorkerPool {
  /**
   * @param {object} [options]
   * @param {number} [options.size] - Worker count (default: min(4, cpus))
   * @param {boolean} [options.enabled=true]
   */
  constructor(options = {}) {
    this.size = options.size ?? Math.min(4, Math.max(1, os.cpus().length - 1));
    this.enabled = options.enabled !== false;
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = [];
    this.taskId = 0;
    this.pendingTasks = new Map();
    this._initialized = false;
  }

  static _defaultInstance = null;

  static getDefault() {
    if (!FlashWorkerPool._defaultInstance) {
      FlashWorkerPool._defaultInstance = new FlashWorkerPool();
    }
    return FlashWorkerPool._defaultInstance;
  }

  _initWorkers() {
    if (this._initialized || !this.enabled) return;
    this._initialized = true;
    for (let i = 0; i < this.size; i++) {
      this._spawnWorker();
    }
  }

  _spawnWorker() {
    const worker = new Worker(WORKER_SCRIPT, { type: "module" });
    worker.on("message", (msg) => this._onWorkerMessage(worker, msg));
    worker.on("error", (err) => this._onWorkerError(worker, err));
    worker.on("exit", () => {
      this.workers = this.workers.filter((w) => w !== worker);
      this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);
      if (this.enabled && this.workers.length < this.size) {
        this._spawnWorker();
      }
    });
    this.workers.push(worker);
    this.idleWorkers.push(worker);
  }

  _onWorkerMessage(worker, msg) {
    const pending = this.pendingTasks.get(msg.id);
    if (!pending) return;
    this.pendingTasks.delete(msg.id);
    this.idleWorkers.push(worker);
    this._pumpQueue();

    if (msg.ok) {
      pending.resolve(msg.result);
    } else {
      pending.reject(new Error(msg.error || "Worker task failed"));
    }

    if (this.taskQueue.length === 0 && this.pendingTasks.size === 0) {
      this._scheduleIdleShutdown();
    }
  }

  _scheduleIdleShutdown() {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (this.taskQueue.length === 0 && this.pendingTasks.size === 0) {
        this.shutdown().catch(() => {});
      }
    }, 250);
    if (this._idleTimer.unref) this._idleTimer.unref();
  }

  _onWorkerError(worker, err) {
    for (const [id, pending] of this.pendingTasks.entries()) {
      if (pending.worker === worker) {
        this.pendingTasks.delete(id);
        pending.reject(err);
      }
    }
    this.idleWorkers = this.idleWorkers.filter((w) => w !== worker);
  }

  _pumpQueue() {
    while (this.taskQueue.length > 0 && this.idleWorkers.length > 0) {
      const task = this.taskQueue.shift();
      const worker = this.idleWorkers.shift();
      this.pendingTasks.set(task.id, {
        resolve: task.resolve,
        reject: task.reject,
        worker,
      });
      worker.postMessage(task.payload);
    }
  }

  /**
   * @param {object} payload
   * @returns {Promise<object>}
   */
  runTask(payload) {
    if (!this.enabled) {
      return this._runInline(payload);
    }

    this._initWorkers();

    return new Promise((resolve, reject) => {
      const id = ++this.taskId;
      const task = {
        id,
        resolve,
        reject,
        payload: { ...payload, id },
      };

      if (this.idleWorkers.length > 0) {
        const worker = this.idleWorkers.shift();
        this.pendingTasks.set(id, { resolve, reject, worker });
        worker.postMessage(task.payload);
      } else {
        this.taskQueue.push(task);
      }
    });
  }

  async _runInline(payload) {
    if (payload.type === "merge") {
      return mergeSSTableFiles(
        payload.dir,
        payload.filePaths,
        payload.targetLevel,
      );
    }
    if (payload.type === "flush") {
      const { flushEntriesToSSTable } = await import("./compaction_merge.mjs");
      return flushEntriesToSSTable(
        payload.sstPath,
        payload.entries,
        payload.level ?? 0,
      );
    }
    throw new Error(`Unknown task type: ${payload.type}`);
  }

  /**
   * Merge SSTables off the main thread when possible.
   */
  async runMerge(dir, filePaths, targetLevel) {
    if (!filePaths || filePaths.length < 2) {
      return { compacted: false, path: null, count: 0 };
    }
    try {
      return await this.runTask({
        type: "merge",
        dir,
        filePaths,
        targetLevel,
      });
    } catch {
      return mergeSSTableFiles(dir, filePaths, targetLevel);
    }
  }

  /**
   * Flush memtable entries to SSTable in a worker.
   */
  async runFlush(sstPath, entries, level = 0) {
    const payloadEntries = entries.map((entry) => ({
      key: entry.key,
      valueBase64: Buffer.isBuffer(entry.value)
        ? entry.value.toString("base64")
        : Buffer.from(entry.value).toString("base64"),
    }));

    try {
      return await this.runTask({
        type: "flush",
        sstPath,
        entries: payloadEntries,
        level,
      });
    } catch {
      const { flushEntriesToSSTable } = await import("./compaction_merge.mjs");
      return flushEntriesToSSTable(sstPath, entries, level);
    }
  }

  async shutdown() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    this.enabled = false;
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.idleWorkers = [];
    this.taskQueue = [];
    this.pendingTasks.clear();
    this._initialized = false;
    if (FlashWorkerPool._defaultInstance === this) {
      FlashWorkerPool._defaultInstance = null;
    }
  }
}
