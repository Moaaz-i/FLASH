#!/usr/bin/env node
/**
 * Soft-deprecate npm releases with known engine bugs (≤1.3.0).
 * Uses npm deprecate — versions stay installable; npm shows a warning only.
 *
 * Usage: NODE_AUTH_TOKEN=<npm_token> node scripts/deprecate-problematic-versions.mjs
 * Dry run: DRY_RUN=1 node scripts/deprecate-problematic-versions.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).name;

const RECOMMENDED = "1.3.2";

/** Versions with documented engine bugs (fixed in 1.3.1). */
const PROBLEMATIC = [
  "1.0.0",
  "1.0.1",
  "1.1.0",
  "1.1.1",
  "1.1.2",
  "1.2.0",
  "1.2.4",
  "1.2.5",
  "1.2.6",
  "1.3.0",
];

const MESSAGE =
  `Known engine issues in this release (TTL not applied to SSTables, count() full scan, Merkle proof async bug, missing beforeUpdate hooks). ` +
  `Upgrade to ${RECOMMENDED} when convenient — this version remains installable and is not removed.`;

function npm(args) {
  return execFileSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function isPublished(version) {
  try {
    npm(["view", `${PKG}@${version}`, "version"]);
    return true;
  } catch {
    return false;
  }
}

function currentDeprecation(version) {
  try {
    const out = npm(["view", `${PKG}@${version}`, "deprecated"]);
    return out === "undefined" || out === "" ? null : out;
  } catch {
    return null;
  }
}

function deprecate(version) {
  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would deprecate ${PKG}@${version}`);
    return;
  }
  npm(["deprecate", `${PKG}@${version}`, MESSAGE]);
  console.log(`deprecated ${PKG}@${version}`);
}

let skipped = 0;
let applied = 0;

for (const version of PROBLEMATIC) {
  if (!isPublished(version)) {
    console.log(`skip ${version} (not on npm)`);
    skipped += 1;
    continue;
  }

  const existing = currentDeprecation(version);
  if (existing === MESSAGE) {
    console.log(`skip ${version} (already deprecated with same message)`);
    skipped += 1;
    continue;
  }
  if (existing) {
    console.log(`skip ${version} (already deprecated: ${existing.slice(0, 60)}…)`);
    skipped += 1;
    continue;
  }

  deprecate(version);
  applied += 1;
}

console.log(`\nDone: ${applied} deprecated, ${skipped} skipped. Active releases: ${RECOMMENDED}, 1.3.1.`);
