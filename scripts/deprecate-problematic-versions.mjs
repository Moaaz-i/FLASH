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

function clearDeprecation(version) {
  const target = spec(version);

  if (process.env.DRY_RUN === "1") {
    console.log(`[dry-run] would clear deprecation on ${target}`);
    return;
  }

  const runners = [];
  if (npmHasUndeprecate()) {
    runners.push(() => {
      execFileSync("npm", ["undeprecate", target], {
        stdio: ["ignore", "pipe", "pipe"],
        env: npmEnv(),
      });
    });
  }
  runners.push(() => {
    execSync(`npm deprecate ${JSON.stringify(target)} ""`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: npmEnv(),
    });
  });

  let lastErr = null;
  for (const run of runners) {
    try {
      run();
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    const msg = lastErr.stderr?.toString?.() || lastErr.message || String(lastErr);
    console.error(`failed to clear deprecation on ${target}: ${msg}`);
    process.exit(1);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!currentDeprecation(version)) {
      console.log(`undeprecated ${target}`);
      return;
    }
    if (attempt < 5) sleepMs(2000);
  }

  console.error(`clear failed — ${target} still deprecated after registry sync`);
  process.exit(1);
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
