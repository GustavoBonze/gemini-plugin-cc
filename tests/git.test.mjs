import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { makeTempDir, makeGitRepo, cleanupDir } from "./helpers.mjs";
import { ensureGitRepository, getCurrentBranch, detectDefaultBranch, collectWorkingTreeContext } from "../plugins/gemini/scripts/lib/git.mjs";

let repoDir;

before(() => { repoDir = makeGitRepo(makeTempDir()); });
after(() => { cleanupDir(repoDir); });

describe("ensureGitRepository", () => {
  it("returns root for a valid git repo", () => {
    const root = ensureGitRepository(repoDir);
    assert.ok(root.length > 0);
  });

  it("throws for a non-git directory", () => {
    const tmp = makeTempDir("non-git-");
    try {
      assert.throws(() => ensureGitRepository(tmp));
    } finally {
      cleanupDir(tmp);
    }
  });
});

describe("getCurrentBranch", () => {
  it("returns a branch name string", () => {
    const branch = getCurrentBranch(repoDir);
    assert.ok(typeof branch === "string" && branch.length > 0);
  });
});

describe("detectDefaultBranch", () => {
  it("detects main or master", () => {
    const branch = detectDefaultBranch(repoDir);
    assert.ok(["main", "master"].includes(branch));
  });
});

describe("collectWorkingTreeContext", () => {
  it("returns context object with expected fields", () => {
    // Add an uncommitted change
    fs.writeFileSync(path.join(repoDir, "new-file.txt"), "test content\n");
    const ctx = collectWorkingTreeContext(repoDir);
    assert.ok(typeof ctx.branch === "string");
    assert.ok(typeof ctx.status === "string");
    assert.ok(typeof ctx.diff === "string");
    assert.ok(typeof ctx.commits === "string");
    assert.ok(typeof ctx.targetLabel === "string");
    // Cleanup
    fs.unlinkSync(path.join(repoDir, "new-file.txt"));
  });
});
