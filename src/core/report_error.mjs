/**
 * Print errors as they are, one line, with the exact user file:line:column.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HISTORY_LIMIT = 200;
/** @type {Array<{ at: string, name: string, message: string, atFile: string }>} */
const history = [];
const alreadyReported = new WeakSet();
let watching = false;

function asError(value) {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim()) return new Error(value);
  if (value && typeof value === "object" && typeof value.message === "string") {
    const err = new Error(value.message);
    err.name = value.name || "Error";
    return err;
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function normalizeFile(raw) {
  let file = raw;
  if (file.startsWith("file://")) {
    try {
      file = fileURLToPath(file);
    } catch {
      file = file.slice("file://".length);
    }
  }
  return file;
}

function isLibraryFrame(file) {
  const n = file.replace(/\\/g, "/");
  return (
    n.includes("/FLASH/src/") ||
    n.includes("/flash-zk/src/") ||
    n.includes("/node_modules/flash-zk/") ||
    n.includes("node:internal") ||
    n.includes("node:modules") ||
    n.includes("node:test")
  );
}

const SITE_RE = /\(?((?:file:\/\/)?[^)\s]+):(\d+):(\d+)\)?/;

/**
 * First stack frame that is the caller's file — not FLASH internals.
 * @param {string} [stack]
 * @returns {string} path:line:column or ""
 */
export function exactSite(stack) {
  if (!stack) return "";
  for (const line of String(stack).split("\n")) {
    if (!line.includes(":")) continue;
    const m = line.match(SITE_RE);
    if (!m) continue;
    const file = normalizeFile(m[1]);
    if (isLibraryFrame(file)) continue;
    if (!/\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".mjs")) continue;
    return `${file}:${m[2]}:${m[3]}`;
  }
  return "";
}

function offsetOfLine(source, lineNumber) {
  if (lineNumber <= 1) return 0;
  let line = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      if (line === lineNumber) return i + 1;
    }
  }
  return source.length;
}

function lineColAt(source, index) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < index; i++) {
    if (source[i] === "\n") {
      line++;
      lastNl = i;
    }
  }
  return { line, column: index - lastNl };
}

function skipWsComments(source, i) {
  while (i < source.length) {
    const c = source[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function skipValue(source, i) {
  let depth = 0;
  let str = null;
  for (; i < source.length; i++) {
    const c = source[i];
    if (str) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end < 0 ? source.length - 1 : end + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return i;
      depth--;
      continue;
    }
    if (c === "," && depth === 0) return i;
  }
  return i;
}

function findObjectStart(source, hintLine) {
  const hintOffset = offsetOfLine(source, hintLine);
  const before = source.slice(0, Math.min(source.length, hintOffset + 120));
  let lastFc = -1;
  const re = /FlashClient\s*\(/g;
  let m;
  while ((m = re.exec(before))) lastFc = m.index;
  if (lastFc >= 0) {
    const brace = source.indexOf("{", lastFc);
    if (brace >= 0) return brace;
  }
  const lineEnd = source.indexOf("\n", hintOffset);
  const line = source.slice(hintOffset, lineEnd < 0 ? source.length : lineEnd);
  const inLine = line.indexOf("{");
  if (inLine >= 0) return hintOffset + inLine;
  return source.lastIndexOf("{", hintOffset);
}

function walkObjectForPath(source, objStart, parts) {
  let i = objStart + 1;
  const stack = [];
  const want = parts.join(".");

  while (i < source.length) {
    i = skipWsComments(source, i);
    if (i >= source.length) break;
    const c = source[i];
    if (c === "}") {
      if (stack.length === 0) break;
      stack.pop();
      i++;
      i = skipWsComments(source, i);
      if (source[i] === ",") i++;
      continue;
    }

    let key;
    let keyIndex;
    if (c === '"' || c === "'") {
      const q = c;
      keyIndex = i + 1;
      i++;
      let k = "";
      while (i < source.length && source[i] !== q) {
        if (source[i] === "\\") i++;
        k += source[i];
        i++;
      }
      key = k;
      if (source[i] === q) i++;
    } else if (/[A-Za-z_$]/.test(c)) {
      keyIndex = i;
      let j = i;
      while (j < source.length && /[\w$]/.test(source[j])) j++;
      key = source.slice(i, j);
      i = j;
    } else if (c === "." && source[i + 1] === ".") {
      i = skipValue(source, i);
      if (source[i] === ",") i++;
      continue;
    } else {
      i++;
      continue;
    }

    i = skipWsComments(source, i);
    if (source[i] !== ":") continue;
    i++;
    i = skipWsComments(source, i);

    if ([...stack, key].join(".") === want) {
      return lineColAt(source, keyIndex);
    }

    if (source[i] === "{") {
      stack.push(key);
      i++;
      continue;
    }
    i = skipValue(source, i);
    if (source[i] === ",") i++;
  }
  return null;
}

/**
 * Property path from a config-guard fact, e.g. `enabled` or `engineOptions.trash.deletionLog`.
 * @param {string} message
 * @returns {string}
 */
export function keyFromMessage(message) {
  const msg = String(message);
  let m = msg.match(/^unknown FlashClient option: (\S+)$/);
  if (m) return m[1];
  m = msg.match(/^unknown (engineOptions(?:\.\w+)+)$/);
  if (m) return m[1];
  m = msg.match(/^(\w+) must be engineOptions\.\1/);
  if (m) return m[1];
  m = msg.match(/^(engineOptions\.trash\.deletionLog) is invalid/);
  if (m) return m[1];
  return "";
}

/**
 * Move a stack site from `new FlashClient` to the bad option's line:column.
 * @param {string} site path:line:column
 * @param {string} [keyPath]
 * @returns {string}
 */
export function pinpoint(site, keyPath) {
  if (!site || !keyPath) return site || "";
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(keyPath)) return site;
  const m = String(site).match(/^(.*):(\d+):(\d+)$/);
  if (!m) return site;
  const file = m[1];
  const hintLine = Number(m[2]);
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return site;
  }
  const objStart = findObjectStart(source, hintLine);
  if (objStart < 0) return site;
  const found = walkObjectForPath(source, objStart, keyPath.split("."));
  if (!found) return site;
  return `${file}:${found.line}:${found.column}`;
}

/**
 * Walk cause, AggregateError.errors, and `.errors` — skip cycles.
 * @param {unknown} value
 * @param {Set<unknown>} [seen]
 * @returns {Error[]}
 */
export function flattenErrors(value, seen = new Set()) {
  if (value == null) return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const err = asError(value);
  const out = [err];

  if (value && typeof value === "object") {
    const nested = [];
    if ("cause" in value && value.cause != null) nested.push(value.cause);
    if (Array.isArray(value.errors)) nested.push(...value.errors);
    for (const item of nested) {
      out.push(...flattenErrors(item, seen));
    }
  }

  return out;
}

function remember(err, atFile) {
  history.push({
    at: new Date().toISOString(),
    name: err.name,
    message: err.message,
    atFile,
  });
  if (history.length > HISTORY_LIMIT) history.shift();
}

function markReported(err) {
  if (err && typeof err === "object") alreadyReported.add(err);
}

function wasReported(err) {
  return Boolean(err && typeof err === "object" && alreadyReported.has(err));
}

function locate(chain) {
  const stacks = [...chain.map((err) => err.stack), new Error().stack];
  for (const stack of stacks) {
    const site = exactSite(stack);
    if (site) return site;
  }
  return "";
}

function siteFor(err, fallback) {
  const key =
    (err && typeof err === "object" && err.flashKey) ||
    keyFromMessage(err.message);
  return pinpoint(fallback, key) || fallback;
}

function printChain(chain) {
  const rows = chain.length > 0 ? chain : [asError("unknown error")];
  const fallback = locate(rows);
  const sites = rows.map((err) => siteFor(err, fallback));
  for (let i = 0; i < rows.length; i++) {
    remember(rows[i], sites[i]);
    markReported(rows[i]);
  }

  const unique = [...new Set(sites.filter(Boolean))];
  let line;
  if (unique.length <= 1) {
    const text = rows.map((err) => err.message).join(" | ");
    line = unique[0]
      ? `FLASH ERROR: ${text} @ ${unique[0]}`
      : `FLASH ERROR: ${text}`;
  } else {
    line = `FLASH ERROR: ${rows
      .map((err, i) =>
        sites[i] ? `${err.message} @ ${sites[i]}` : err.message,
      )
      .join(" | ")}`;
  }
  process.stderr.write(`${line}\n`);
  return rows[0];
}

/**
 * Print the error on one line with exact user file:line:column.
 * @param {unknown} error
 * @returns {Error}
 */
export function reportError(error) {
  reportError.watch();
  const chain = flattenErrors(error);
  const first = printChain(chain);
  markReported(asError(error));
  return first;
}

reportError.all = function all(errors) {
  reportError.watch();
  const list = Array.isArray(errors) ? errors : [errors];
  const seen = new Set();
  const chain = [];
  for (const item of list) {
    chain.push(...flattenErrors(item, seen));
  }
  return printChain(chain);
};

reportError.list = function list() {
  return history.slice();
};

reportError.clear = function clear() {
  history.length = 0;
};

reportError.watch = function watch() {
  if (watching) return reportError;
  watching = true;

  process.on("uncaughtException", (err) => {
    if (!wasReported(err)) reportError(err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    const err = asError(reason);
    if (!wasReported(err) && !wasReported(reason)) reportError(reason);
    process.exit(1);
  });

  return reportError;
};
