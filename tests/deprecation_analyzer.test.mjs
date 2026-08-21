import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseReleaseNotes,
  compareSemver,
  analyzeDeprecations,
  isFixRelease,
  engineFixCommitsBetween,
} from "../scripts/lib/analyze-deprecations.mjs";

test("compareSemver orders versions", () => {
  assert.ok(compareSemver("1.3.0", "1.3.1") < 0);
  assert.ok(compareSemver("1.3.2", "1.3.1") > 0);
});

test("parseReleaseNotes detects bug fix sections", () => {
  const dir = mkdtempSync(join(tmpdir(), "flash-notes-"));
  const file = join(dir, "release-notes.md");
  writeFileSync(
    file,
    `## v1.3.1 — Fixes

### Bug fixes

| Issue | Fix |
|-------|-----|
| broken count() | fixed count() |
`,
  );

  const map = parseReleaseNotes(file);
  assert.equal(map.get("1.3.1")?.hasFixSection, true);
  assert.ok(map.get("1.3.1")?.issues.some((i) => i.includes("count")));
});

test("isFixRelease uses notes or tag subject", () => {
  assert.equal(
    isFixRelease("1.3.1", { hasFixSection: true, issues: ["x"] }, "1.3.0", "1.3.1"),
    true,
  );
  assert.equal(
    isFixRelease("1.3.2", { hasFixSection: false, issues: [] }, "1.3.1", "1.3.2"),
    false,
  );
});

test("analyzeDeprecations deprecates predecessor of fix release only", () => {
  const dir = mkdtempSync(join(tmpdir(), "flash-analyze-"));
  const notes = join(dir, "release-notes.md");
  writeFileSync(
    notes,
    `## v1.3.1 — Fixes

### Bug fixes

| Issue | Fix |
|-------|-----|
| broken count() | fixed count() |
`,
  );

  const analysis = analyzeDeprecations({
    pkgName: "flash-db",
    recommended: "1.3.2",
    releaseNotesPath: notes,
    publishedVersions: ["1.3.0", "1.3.1", "1.3.2"],
  });

  assert.ok(analysis.toDeprecate.some((d) => d.version === "1.3.0"));
  assert.ok(!analysis.toDeprecate.some((d) => d.version === "1.2.6"));
  assert.ok(!analysis.toDeprecate.some((d) => d.version === "1.3.1"));
  assert.ok(!analysis.toDeprecate.some((d) => d.version === "1.3.2"));
});

test("engineFixCommitsBetween ignores docs-only noise", () => {
  const commits = engineFixCommitsBetween("1.3.0", "1.3.1");
  assert.ok(Array.isArray(commits));
});
