import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reportError,
  flattenErrors,
  exactSite,
  pinpoint,
} from "../src/core/report_error.mjs";
import { FlashClient } from "../src/client/flash_client.mjs";

function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write;
  process.stderr.write = (chunk, enc, cb) => {
    chunks.push(String(chunk));
    if (typeof enc === "function") enc();
    if (typeof cb === "function") cb();
    return true;
  };
  try {
    fn();
    return chunks.join("");
  } finally {
    process.stderr.write = orig;
  }
}

const SITE = / @ \S+\.(?:mjs|js|cjs|ts):(\d+):(\d+)\n$/;

test("reportError prints one line with message and exact file:line:column", () => {
  const out = captureStderr(() => {
    const err = reportError(
      new Error("Secret key is required to initialize FlashClient SDK"),
    );
    assert.equal(
      err.message,
      "Secret key is required to initialize FlashClient SDK",
    );
  });
  assert.match(
    out,
    /^FLASH ERROR: Secret key is required to initialize FlashClient SDK @ /,
  );
  assert.match(out, SITE);
  assert.match(out, /report_error\.test\.mjs:/);
  assert.doesNotMatch(out, /How to fix it/);
});

test("reportError prints a string error with exact site", () => {
  const out = captureStderr(() => {
    const err = reportError("disk is full");
    assert.equal(err.message, "disk is full");
  });
  assert.match(out, /^FLASH ERROR: disk is full @ /);
  assert.match(out, /report_error\.test\.mjs:/);
});

test("FlashClient points at the bad option line, not new FlashClient", () => {
  const out = captureStderr(() => {
    assert.throws(
      () =>
        new FlashClient({
          secretKey: "report_error_root_del_log!!!!",
          deletionLog: { enabled: true },
        }),
      /deletionLog must be engineOptions\.deletionLog/,
    );
  });
  assert.match(
    out,
    /^FLASH ERROR: deletionLog must be engineOptions\.deletionLog/,
  );
  assert.doesNotMatch(out, /config_guard\.mjs/);
  const site = out.match(/report_error\.test\.mjs:(\d+):(\d+)/);
  assert.ok(site);
  const src = fs
    .readFileSync(fileURLToPath(import.meta.url), "utf8")
    .split("\n");
  assert.match(src[Number(site[1]) - 1], /deletionLog\s*:/);
});

test("pinpoint reads the caller file and lands on the bad key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flash-pinpoint-"));
  const file = path.join(dir, "generate_1gb_knowledge.mjs");
  fs.writeFileSync(
    file,
    `import { FlashClient } from "flash-zk";

const flash = new FlashClient({
  dbName: "knowledge",
  enabled: true,
  engineOptions: {
    trash: { deletionLog: { enabled: true } },
  },
});
`,
  );
  const call = `${file}:3:15`;
  assert.equal(pinpoint(call, "enabled"), `${file}:5:3`);
  assert.equal(
    pinpoint(call, "engineOptions.trash.deletionLog"),
    `${file}:7:14`,
  );
});

test("exactSite skips FLASH library frames", () => {
  const stack = [
    "Error",
    "    at assertClientConfig (file:///Users/moaaz/Desktop/FLASH/src/client/config_guard.mjs:73:13)",
    "    at new FlashClient (file:///Users/moaaz/Desktop/FLASH/src/client/flash_client.mjs:91:5)",
    "    at file:///Users/moaaz/Desktop/velociradix-demo/generate_1gb_knowledge.mjs:3:15",
  ].join("\n");
  assert.equal(
    exactSite(stack),
    "/Users/moaaz/Desktop/velociradix-demo/generate_1gb_knowledge.mjs:3:15",
  );
});

test("flattenErrors walks cause and AggregateError so none are dropped", () => {
  const root = new Error("outer");
  root.cause = new Error("inner cause");
  const batch = new AggregateError([new Error("a"), new Error("b")], "batch");
  assert.equal(
    flattenErrors(root)
      .map((e) => e.message)
      .join(","),
    "outer,inner cause",
  );
  assert.deepEqual(
    flattenErrors(batch).map((e) => e.message),
    ["batch", "a", "b"],
  );
});

test("reportError prints the full chain on one line with site", () => {
  reportError.clear();
  const inner = new Error("disk write failed");
  const outer = new Error("backup failed");
  outer.cause = inner;
  const out = captureStderr(() => {
    reportError(outer);
  });
  assert.match(out, /^FLASH ERROR: backup failed \| disk write failed @ /);
  assert.match(out, /report_error\.test\.mjs:/);
  assert.equal(reportError.list().length, 2);
});

test("reportError.all prints every item on one line with site", () => {
  const out = captureStderr(() => {
    reportError.all([
      new Error("first"),
      new Error("second"),
      new Error("third"),
    ]);
  });
  assert.match(out, /^FLASH ERROR: first \| second \| third @ /);
  assert.match(out, /report_error\.test\.mjs:/);
});
