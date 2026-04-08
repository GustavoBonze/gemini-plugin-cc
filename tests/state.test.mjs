import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeTempDir, makeGitRepo, cleanupDir } from "./helpers.mjs";
import { resolveStateDir, getConfig, updateConfig, listJobs, readJobFile, writeJobFile, upsertJob, pruneOldJobs } from "../plugins/gemini/scripts/lib/state.mjs";

let tmpDir;

before(() => { tmpDir = makeGitRepo(makeTempDir()); });
after(() => { cleanupDir(tmpDir); });

describe("resolveStateDir", () => {
  it("returns a string path", () => {
    const dir = resolveStateDir(tmpDir);
    assert.equal(typeof dir, "string");
  });

  it("creates the jobs subdirectory", () => {
    const dir = resolveStateDir(tmpDir);
    assert.ok(fs.existsSync(path.join(dir, "jobs")));
  });

  it("is deterministic for the same cwd", () => {
    assert.equal(resolveStateDir(tmpDir), resolveStateDir(tmpDir));
  });
});

describe("config", () => {
  it("reads default config", () => {
    const config = getConfig(tmpDir);
    assert.equal(typeof config, "object");
  });

  it("updates config", () => {
    updateConfig(tmpDir, { reviewGateEnabled: true });
    const config = getConfig(tmpDir);
    assert.equal(config.reviewGateEnabled, true);
    updateConfig(tmpDir, { reviewGateEnabled: false });
  });
});

describe("job file ops", () => {
  it("writes and reads a job file", () => {
    const stateDir = resolveStateDir(tmpDir);
    const jobId = "test-job-001";
    const data = { id: jobId, status: "running", kind: "review" };
    writeJobFile(stateDir, jobId, data);
    const read = readJobFile(stateDir, jobId);
    assert.equal(read.id, jobId);
    assert.equal(read.status, "running");
  });

  it("upserts job with updatedAt", () => {
    const stateDir = resolveStateDir(tmpDir);
    const jobId = "test-job-002";
    writeJobFile(stateDir, jobId, { id: jobId, status: "running" });
    const updated = upsertJob(stateDir, jobId, { status: "completed" });
    assert.equal(updated.status, "completed");
    assert.ok(updated.updatedAt);
  });

  it("lists jobs", () => {
    const stateDir = resolveStateDir(tmpDir);
    const jobs = listJobs(stateDir, { all: true });
    assert.ok(Array.isArray(jobs));
  });
});
