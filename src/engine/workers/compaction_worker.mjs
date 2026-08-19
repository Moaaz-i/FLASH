import { parentPort } from "node:worker_threads";
import {
  mergeSSTableFiles,
  flushEntriesToSSTable,
} from "../compaction_merge.mjs";

parentPort.on("message", async (msg) => {
  try {
    let result;
    if (msg.type === "merge") {
      result = await mergeSSTableFiles(msg.dir, msg.filePaths, msg.targetLevel);
    } else if (msg.type === "flush") {
      const entries = (msg.entries || []).map((entry) => ({
        key: entry.key,
        value: Buffer.from(entry.valueBase64, "base64"),
      }));
      result = await flushEntriesToSSTable(
        msg.sstPath,
        entries,
        msg.level ?? 0,
      );
    } else {
      throw new Error(`Unknown worker task: ${msg.type}`);
    }
    parentPort.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({
      id: msg.id,
      ok: false,
      error: err.message,
    });
  }
});
