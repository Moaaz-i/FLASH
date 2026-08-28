/**
 * Automatic deprecation analysis — no manual version lists or tables.
 *
 * Marks version V only when the **next** published release (V+1) documents
 * or ships engine/security fixes that address problems in V.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const FIX_SECTION_RE =
  /^###\s+(Bug fixes?|Security fixes?|Security|Critical fixes?|Hotfixes?)\s*$/im;

const RELEASE_HEADING_RE = /^##\s+v(\d+\.\d+\.\d+)\b/im;

const CI_ONLY_FIX_RE =
  /\b(ci|test|tests|workflow|flaky|github actions|pages|npm publish|deprecat|benchmark)\b/i;

const NOISE_COMMIT_RE =
  /\b(docs?|chore|format|typo|comment|comments|test|tests|ci|readme|badge|deploy|pages|npm publish)\b/i;

const CRITICAL_PATHS = [
  "src/core/",
  "src/crypto/",
  "src/client/flash_client.mjs",
  "src/storage/",
  "src/engine/",
];

export function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], raw: version };
}

export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

function maxSemver(versions) {
  return versions.reduce((best, v) => (compareSemver(v, best) > 0 ? v : best));
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function tagExists(tag) {
  return Boolean(git(["rev-parse", "--verify", `refs/tags/${tag}`]));
}

function npmView(pkg, field) {
  try {
    return execFileSync("npm", ["view", pkg, field, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export function fetchPublishedVersions(pkgName) {
  const raw = npmView(pkgName, "versions");
  if (!raw) return [];
  return [...JSON.parse(raw)].sort(compareSemver);
}

export function fetchLatestVersion(pkgName) {
  try {
    return execFileSync("npm", ["view", pkgName, "version"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function parseIssuesFromBlock(block) {
  const issues = [];
  for (const line of block.split("\n")) {
    const row = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (row && row[1] !== "Issue" && !row[1].includes("---")) {
      issues.push(row[1].replace(/`/g, "").trim());
    }
  }
  return [...new Set(issues)].slice(0, 6);
}

export function parseReleaseNotes(filePath) {
  if (!existsSync(filePath)) return new Map();

  const text = readFileSync(filePath, "utf8");
  const sections = new Map();
  const parts = text.split(RELEASE_HEADING_RE);

  for (let i = 1; i < parts.length; i += 2) {
    const version = parts[i];
    const body = parts[i + 1] || "";
    const hasFixSection = FIX_SECTION_RE.test(body);
    const fixBlock = hasFixSection
      ? body.split(FIX_SECTION_RE)[2]?.split(/^###\s+/m)[0] || ""
      : "";

    sections.set(version, {
      hasFixSection,
      docsOnly:
        /\bno extra code\b|\bdocs-only\b|\bdocumentation-only\b|\bdocumentation only\b/i.test(
          body,
        ),
      issues: hasFixSection ? parseIssuesFromBlock(fixBlock) : [],
    });
  }

  return sections;
}

export function releaseTagSubject(version) {
  if (!tagExists(`v${version}`)) return "";
  return git(["log", "-1", "--format=%s", `v${version}`]);
}

export function engineFixCommitsBetween(older, newer) {
  if (!tagExists(`v${older}`) || !tagExists(`v${newer}`)) return [];

  const log = git([
    "log",
    `v${older}..v${newer}`,
    "--oneline",
    "-i",
    "--grep=fix",
    "--grep=bug",
    "--grep=security",
    "--grep=hotfix",
    "--grep=broken",
    "--",
    ...CRITICAL_PATHS,
  ]);

  return (log ? log.split("\n") : [])
    .filter(Boolean)
    .map((line) => line.replace(/^[a-f0-9]+\s+/, ""))
    .filter((subject) => !NOISE_COMMIT_RE.test(subject));
}

/**
 * True when this release documents or ships engine/security fixes (not CI-only).
 */
export function isFixRelease(version, notesMeta, older, newer) {
  if (notesMeta?.hasFixSection) return true;

  const msg = releaseTagSubject(version);
  if (
    /^Release v\d+\.\d+\.\d+:\s*.*\b(fix|fixes|bug|bugs|security|hotfix)\b/i.test(
      msg,
    )
  ) {
    if (CI_ONLY_FIX_RE.test(msg) && !/\bengine\b/i.test(msg)) return false;
    return true;
  }

  return engineFixCommitsBetween(older, newer).length > 0;
}

function summarizeIssues(issues, maxLen = 180) {
  if (!issues.length) return "documented engine or security fixes in the next release";
  let text = issues.join("; ");
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 3)}…`;
  return text;
}

function buildMessage({ version, reasons, recommended }) {
  const fixedIn = reasons
    .map((r) => r.fixedIn)
    .sort(compareSemver)
    .at(-1);
  const issueText = summarizeIssues(reasons.flatMap((r) => r.issues || []));

  return (
    `Known issues in v${version} (${issueText}). ` +
    `Fixed in v${fixedIn}. Upgrade to v${recommended} when convenient — still installable, not removed.`
  );
}

function addCandidate(candidates, version, reason) {
  if (!candidates.has(version)) candidates.set(version, { reasons: [] });
  candidates.get(version).reasons.push(reason);
}

/**
 * Deprecate V only if V+1 is a fix release (notes, tag message, or engine git fixes).
 */
export function analyzeDeprecations({
  pkgName,
  recommended,
  releaseNotesPath = join(REPO_ROOT, "docs/guide/release-notes.md"),
  publishedVersions = null,
}) {
  const published = publishedVersions ?? fetchPublishedVersions(pkgName);
  const latest =
    (publishedVersions ? maxSemver(publishedVersions) : fetchLatestVersion(pkgName)) ||
    recommended;
  const notes = parseReleaseNotes(releaseNotesPath);
  const candidates = new Map();

  for (let i = 0; i < published.length - 1; i += 1) {
    const older = published[i];
    const newer = published[i + 1];
    const newerNotes = notes.get(newer);
    if (newerNotes?.docsOnly) continue;

    const gitFixes = engineFixCommitsBetween(older, newer);

    const notesSayFix = isFixRelease(newer, newerNotes, older, newer);
    const gitSaysFix = gitFixes.length > 0;

    if (!notesSayFix && !gitSaysFix) continue;

    const issues = [
      ...(newerNotes?.issues || []),
      ...gitFixes.slice(0, 4),
    ];

    addCandidate(candidates, older, {
      kind: [notesSayFix && "release-notes", gitSaysFix && "git"]
        .filter(Boolean)
        .join("+"),
      fixedIn: newer,
      issues: [...new Set(issues)],
    });
  }

  const latestOnly = maxSemver([latest, recommended].filter(Boolean));
  const protectedVersions = new Set([latestOnly]);

  const toDeprecate = [];
  for (const [version, { reasons }] of candidates) {
    if (protectedVersions.has(version)) continue;
    toDeprecate.push({
      version,
      reasons,
      message: buildMessage({ version, reasons, recommended }),
    });
  }

  toDeprecate.sort((a, b) => compareSemver(a.version, b.version));

  const toKeep = published.filter(
    (v) => !toDeprecate.some((d) => d.version === v),
  );

  return {
    pkgName,
    recommended,
    latest,
    published,
    toDeprecate,
    toKeep,
    report: formatReport({ published, toDeprecate, toKeep, latestOnly }),
  };
}

function formatReport({ published, toDeprecate, toKeep, latestOnly }) {
  return [
    "=== Automatic deprecation analysis ===",
    `Published (${published.length}): ${published.join(", ")}`,
    `Rule: deprecate V only when V+1 ships documented/engine fixes`,
    `Protected latest: ${latestOnly}`,
    `Keep: ${toKeep.join(", ") || "none"}`,
    `Deprecate (${toDeprecate.length}):`,
    ...toDeprecate.map(
      (d) =>
        `  - ${d.version} ← fixed in ${d.reasons[0]?.fixedIn} [${d.reasons[0]?.kind}]`,
    ),
  ].join("\n");
}
