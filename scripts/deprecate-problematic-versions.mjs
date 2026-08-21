#!/usr/bin/env node
/**
 * Soft-deprecate only npm releases explicitly marked as affected in release-notes.
 *
 * Usage:
 *   NODE_AUTH_TOKEN=<token> node scripts/deprecate-problematic-versions.mjs
 *   DRY_RUN=1 node scripts/deprecate-problematic-versions.mjs
 *   ANALYZE=1 node scripts/deprecate-problematic-versions.mjs
 *   VERIFY=1 node scripts/deprecate-problematic-versions.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeDeprecations } from "./lib/analyze-deprecations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const PKG = pkgJson.name;
const RECOMMENDED = pkgJson.version;

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

function deprecate(version, message) {
  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would deprecate ${PKG}@${version}`);
    console.log(`          ${message}`);
    return;
  }
  try {
    npm(["deprecate", `${PKG}@${version}`, message]);
  } catch (err) {
    const msg = err.stderr?.toString?.() || err.message || String(err);
    console.error(`failed to deprecate ${PKG}@${version}: ${msg}`);
    process.exit(1);
  }
  if (!currentDeprecation(version)) {
    console.error(
      `deprecate succeeded but ${PKG}@${version} still active on npm`,
    );
    process.exit(1);
  }
  console.log(`deprecated ${PKG}@${version}`);
}

function clearDeprecation(version) {
  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would clear deprecation on ${PKG}@${version}`);
    return;
  }
  try {
    // npm 10 (Node 22 CI): no `undeprecate` — empty message clears deprecation.
    npm(["deprecate", `${PKG}@${version}`, ""]);
  } catch (err) {
    const msg = err.stderr?.toString?.() || err.message || String(err);
    console.error(`failed to clear deprecation on ${PKG}@${version}: ${msg}`);
    process.exit(1);
  }
  if (currentDeprecation(version)) {
    console.error(`clear failed — ${PKG}@${version} still deprecated`);
    process.exit(1);
  }
  console.log(`undeprecated ${PKG}@${version}`);
}

const analysis = analyzeDeprecations({
  pkgName: PKG,
  recommended: RECOMMENDED,
});

console.log(analysis.report);
console.log("");

if (process.env.ANALYZE === "1") {
  process.exit(0);
}

const deprecateSet = new Set(analysis.toDeprecate.map((d) => d.version));

function verifyAnalysis() {
  const missing = analysis.toDeprecate
    .filter(
      ({ version }) => isPublished(version) && !currentDeprecation(version),
    )
    .map(({ version }) => version);

  const wronglyDeprecated = analysis.published.filter(
    (v) =>
      !deprecateSet.has(v) &&
      v !== analysis.latest &&
      isPublished(v) &&
      currentDeprecation(v),
  );

  if (missing.length) {
    console.error(
      `VERIFY FAILED — should be deprecated: ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  if (wronglyDeprecated.length) {
    console.error(
      `VERIFY FAILED — should NOT be deprecated: ${wronglyDeprecated.join(", ")}`,
    );
    process.exit(1);
  }
  console.log(
    `VERIFY OK — ${analysis.toDeprecate.length} affected version(s) deprecated; keeping ${analysis.toKeep.join(", ")}.`,
  );
}

if (process.env.VERIFY === "1") {
  verifyAnalysis();
  process.exit(0);
}

if (process.env.DRY_RUN !== "1" && !process.env.NODE_AUTH_TOKEN) {
  console.error(
    "NODE_AUTH_TOKEN is required (map NPM_TOKEN in GitHub Actions).",
  );
  process.exit(1);
}

let applied = 0;
let skipped = 0;
let restored = 0;

for (const { version, message } of analysis.toDeprecate) {
  if (!isPublished(version)) {
    console.log(`skip ${version} (not on npm)`);
    skipped += 1;
    continue;
  }

  const existing = currentDeprecation(version);
  if (existing === message) {
    console.log(`skip ${version} (already deprecated)`);
    skipped += 1;
    continue;
  }

  if (existing) {
    console.log(`update ${version} (refresh message)`);
  }

  deprecate(version, message);
  applied += 1;
}

for (const version of analysis.published) {
  if (deprecateSet.has(version) || version === analysis.latest) continue;
  if (!currentDeprecation(version)) continue;
  console.log(`restore ${version} (no longer affected)`);
  clearDeprecation(version);
  restored += 1;
}

if (!applied && !restored) {
  console.log("No registry changes needed.");
} else {
  console.log(
    `\nDone: ${applied} deprecated, ${restored} restored, ${skipped} skipped. Recommended: v${analysis.recommended}.`,
  );
}

if (process.env.DRY_RUN !== "1") {
  verifyAnalysis();
}
