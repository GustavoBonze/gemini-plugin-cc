import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { makeTempDir, makeGitRepo, cleanupDir, REPO_ROOT, FAKE_GEMINI } from "./helpers.mjs";

const COMPANION = path.join(REPO_ROOT, "plugins", "gemini", "scripts", "gemini-companion.mjs");

function runCompanion(args, { cwd = process.cwd(), env = {} } = {}) {
  return spawnSync("node", [COMPANION, ...args], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
    timeout: 15000,
  });
}

let repoDir;

before(() => { repoDir = makeGitRepo(makeTempDir()); });
after(() => { cleanupDir(repoDir); });

describe("setup command", () => {
  it("returns JSON with ready field", () => {
    const result = runCompanion(["setup", "--json"], { cwd: repoDir });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.ok("ready" in data);
    assert.ok("node" in data);
    assert.ok("gemini" in data);
  });

  it("node is always available", () => {
    const result = runCompanion(["setup", "--json"], { cwd: repoDir });
    const data = JSON.parse(result.stdout);
    assert.equal(data.node.available, true);
  });
});

describe("status command", () => {
  it("returns empty job list gracefully", () => {
    const result = runCompanion(["status", "--json"], { cwd: repoDir });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.ok(Array.isArray(data));
  });
});

describe("task-resume-candidate command", () => {
  it("returns available:false when no completed tasks", () => {
    const result = runCompanion(["task-resume-candidate", "--json"], { cwd: repoDir });
    assert.equal(result.status, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal(data.available, false);
  });
});

describe("unknown command", () => {
  it("exits with non-zero status", () => {
    const result = runCompanion(["not-a-command"], { cwd: repoDir });
    assert.notEqual(result.status, 0);
  });
});
