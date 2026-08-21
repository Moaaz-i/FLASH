#!/usr/bin/env node
/**
 * Soft-deprecate npm releases with known engine bugs (≤1.3.0).
 * Uses npm deprecate — versions stay installable; npm shows a warning only.
 *
 * Usage: NODE_AUTH_TOKEN=<npm_token> node scripts/deprecate-problematic-versions.mjs
 * Dry run: DRY_RUN=1 node scripts/deprecate-problematic-versions.mjs
 * Verify:  VERIFY=1 node scripts/deprecate-problematic-versions.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
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
    if (!out || out === "undefined" || out === "null") return null;
    return out;
  } catch {
    return null;
  }
}

function deprecate(version) {
  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would deprecate ${PKG}@${version}`);
    return;
  }
  try {
    npm(["deprecate", `${PKG}@${version}`, MESSAGE]);
  } catch (err) {
    const msg = err.stderr?.toString?.() || err.message || String(err);
    console.error(`failed to deprecate ${PKG}@${version}: ${msg}`);
    process.exit(1);
  }
  const check = currentDeprecation(version);
  if (!check) {
    console.error(`deprecate call succeeded but ${PKG}@${version} is still active on npm`);
    process.exit(1);
  }
  console.log(`deprecated ${PKG}@${version}`);
}

function verifyAllDeprecated() {
  const missing = [];
  for (const version of PROBLEMATIC) {
    if (!isPublished(version)) continue;
    if (!currentDeprecation(version)) missing.push(version);
  }
  if (missing.length) {
    console.error(`VERIFY FAILED — still active on npm: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`VERIFY OK — ${PROBLEMATIC.length} legacy versions marked deprecated on npm.`);
}

if (process.env.VERIFY === "1") {
  verifyAllDeprecated();
  process.exit(0);
}

if (process.env.DRY_RUN !== "1" && !process.env.NODE_AUTH_TOKEN) {
  console.error("NODE_AUTH_TOKEN is required (set NPM_TOKEN in GitHub Actions secrets).");
  process.exit(1);
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
    console.log(`skip ${version} (already deprecated)`);
    skipped += 1;
    continue;
  }

  if (existing) {
    console.log(`update ${version} (refresh deprecation message)`);
  }

  deprecate(version);
  applied += 1;
}

console.log(
  `\nDone: ${applied} deprecated, ${skipped} skipped. Active releases: ${RECOMMENDED}, 1.3.1.`,
);

if (process.env.DRY_RUN !== "1") {
  verifyAllDeprecated();
}
