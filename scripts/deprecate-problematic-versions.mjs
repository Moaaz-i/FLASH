#!/usr/bin/env node
/**
 * Soft-deprecate npm releases detected automatically from release notes + git.
 *
 * Usage:
 *   NODE_AUTH_TOKEN=<token> node scripts/deprecate-problematic-versions.mjs
 *   DRY_RUN=1 node scripts/deprecate-problematic-versions.mjs
 *   ANALYZE=1 node scripts/deprecate-problematic-versions.mjs
 *   VERIFY=1 node scripts/deprecate-problematic-versions.mjs
 */

import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeDeprecations } from "./lib/analyze-deprecations.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const PKG = pkgJson.name;
const RECOMMENDED = pkgJson.version;

const npmEnv = () => ({ ...process.env });

function npm(args) {
  return execFileSync("npm", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: npmEnv(),
  }).trim();
}

function spec(version) {
  return `${PKG}@${version}`;
}

function isPublished(version) {
  try {
    npm(["view", spec(version), "version"]);
    return true;
  } catch {
    return false;
  }
}

function currentDeprecation(version) {
  try {
    const out = npm(["view", spec(version), "deprecated", "--prefer-online"]);
    if (!out || out === "undefined" || out === "null") return null;
    return out;
  } catch {
    return null;
  }
}

function npmHasUndeprecate() {
  try {
    execFileSync("npm", ["help", "undeprecate"], {
      stdio: "ignore",
      env: npmEnv(),
    });
    return true;
  } catch {
    return false;
  }
}

function deprecate(version, message) {
  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would deprecate ${spec(version)}`);
    console.log(`          ${message}`);
    return;
  }
  try {
    npm(["deprecate", spec(version), message]);
  } catch (err) {
    const msg = err.stderr?.toString?.() || err.message || String(err);
    console.error(`failed to deprecate ${spec(version)}: ${msg}`);
    process.exit(1);
  }
  if (!currentDeprecation(version)) {
    console.error(`deprecate succeeded but ${spec(version)} still active on npm`);
    process.exit(1);
  }
  console.log(`deprecated ${spec(version)}`);
}

function sleepMs(ms) {
  execSync(`sleep ${Math.ceil(ms / 1000)}`, { stdio: "ignore" });
}

function sendClearDeprecation(target) {
  let lastErr = null;
  if (npmHasUndeprecate()) {
    try {
      execFileSync("npm", ["undeprecate", target], {
        stdio: ["ignore", "pipe", "pipe"],
        env: npmEnv(),
      });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  try {
    execSync(`npm deprecate ${JSON.stringify(target)} ""`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: npmEnv(),
    });
  } catch (err) {
    const msg = lastErr?.stderr?.toString?.() || err.stderr?.toString?.() || err.message;
    throw new Error(msg || String(err));
  }
}

/** @returns {boolean} */
function clearDeprecation(version) {
  const target = spec(version);

  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would clear deprecation on ${target}`);
    return true;
  }

  try {
    sendClearDeprecation(target);
  } catch (err) {
    console.error(`failed to clear deprecation on ${target}: ${err.message}`);
    return false;
  }

  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (!currentDeprecation(version)) {
      console.log(`undeprecated ${target}`);
      return true;
    }
    if (attempt > 0 && attempt % 3 === 0) {
      try {
        sendClearDeprecation(target);
      } catch {
        // registry may still be catching up
      }
    }
    if (attempt < 14) sleepMs(3000);
  }

  console.warn(`warn: ${target} still shows deprecated locally — will retry later in run`);
  return false;
}

function versionsNeedingRestore() {
  return analysis.published.filter(
    (version) =>
      !deprecateSet.has(version) &&
      version !== analysis.latest &&
      isPublished(version) &&
      currentDeprecation(version),
  );
}

function restoreDeprecatedVersions() {
  let restored = 0;
  let pending = versionsNeedingRestore();

  for (let pass = 1; pass <= 2 && pending.length; pass += 1) {
    if (pass > 1) {
      console.log(`\nRetry restore pass ${pass} (${pending.length} version(s))…`);
      sleepMs(5000);
    }

    const failed = [];
    for (const version of pending) {
      console.log(`restore ${version} (no longer affected)`);
      if (clearDeprecation(version)) {
        restored += 1;
      } else {
        failed.push(version);
      }
      sleepMs(2000);
    }
    pending = failed;
  }

  return restored;
}

const analysis = analyzeDeprecations({
  pkgName: PKG,
  recommended: RECOMMENDED,
});

const deprecateSet = new Set(analysis.toDeprecate.map((d) => d.version));

console.log(analysis.report);
console.log("");

if (process.env.ANALYZE === "1") {
  process.exit(0);
}

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

restored = restoreDeprecatedVersions();

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
