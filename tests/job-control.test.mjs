import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeTempDir, makeGitRepo, cleanupDir, REPO_ROOT } from "./helpers.mjs";
import { sortJobsNewestFirst, durationLabel, inferPhase, resolveJob, getRecentJobs, cancelJob } from "../plugins/gemini/scripts/lib/job-control.mjs";
import { resolveStateDir, upsertJob, readJobFile } from "../plugins/gemini/scripts/lib/state.mjs";
import { createJob } from "../plugins/gemini/scripts/lib/tracked-jobs.mjs";

let repoDir;
let stateDir;

before(() => {
  repoDir = makeGitRepo(makeTempDir());
  stateDir = resolveStateDir(repoDir);
});

after(() => { cleanupDir(repoDir); });

describe("sortJobsNewestFirst", () => {
  it("sorts by updatedAt descending", () => {
    const jobs = [
      { id: "a", updatedAt: "2026-01-01T10:00:00Z" },
      { id: "b", updatedAt: "2026-01-03T10:00:00Z" },
      { id: "c", updatedAt: "2026-01-02T10:00:00Z" },
    ];
    const sorted = sortJobsNewestFirst(jobs);
    assert.equal(sorted[0].id, "b");
    assert.equal(sorted[1].id, "c");
    assert.equal(sorted[2].id, "a");
  });

  it("does not mutate the original array", () => {
    const jobs = [
      { id: "a", updatedAt: "2026-01-01T00:00:00Z" },
      { id: "b", updatedAt: "2026-01-02T00:00:00Z" },
    ];
    sortJobsNewestFirst(jobs);
    assert.equal(jobs[0].id, "a");
  });
});

describe("durationLabel", () => {
  it("returns seconds for short jobs", () => {
    const start = new Date(Date.now() - 30_000).toISOString();
    const end = new Date().toISOString();
    const label = durationLabel({ status: "completed", startedAt: start, completedAt: end });
    assert.ok(label.endsWith("s"), `expected seconds, got: ${label}`);
  });

  it("returns minutes for longer jobs", () => {
    const start = new Date(Date.now() - 90_000).toISOString();
    const end = new Date().toISOString();
    const label = durationLabel({ status: "completed", startedAt: start, completedAt: end });
    assert.ok(label.includes("m"), `expected minutes, got: ${label}`);
  });

  it("returns dash when timestamps missing", () => {
    const label = durationLabel({ status: "completed" });
    assert.equal(label, "-");
  });

  it("uses current time for running jobs", () => {
    const start = new Date(Date.now() - 5_000).toISOString();
    const label = durationLabel({ status: "running", startedAt: start });
    assert.ok(label !== "-", "should not return dash for running job with startedAt");
  });
});

describe("inferPhase", () => {
  it("returns done for completed jobs", () => {
    assert.equal(inferPhase({ status: "completed" }), "done");
  });

  it("returns cancelled for cancelled jobs", () => {
    assert.equal(inferPhase({ status: "cancelled" }), "cancelled");
  });

  it("returns failed for failed jobs", () => {
    assert.equal(inferPhase({ status: "failed" }), "failed");
  });

  it("returns starting when no log file present", () => {
    const phase = inferPhase({ status: "running", logFile: "/nonexistent/path/log.txt" });
    assert.equal(phase, "starting");
  });

  it("falls back to job.phase if set", () => {
    assert.equal(inferPhase({ status: "running", phase: "reviewing" }), "reviewing");
  });
});

describe("resolveJob", () => {
  it("returns null for empty list", () => {
    assert.equal(resolveJob([], null), null);
  });

  it("finds job by id prefix", () => {
    const jobs = [
      { id: "job-abc123", status: "completed" },
      { id: "job-def456", status: "running" },
    ];
    const found = resolveJob(jobs, "job-abc");
    assert.equal(found.id, "job-abc123");
  });

  it("prefers running job when no idHint", () => {
    const jobs = [
      { id: "job-1", status: "completed" },
      { id: "job-2", status: "running" },
    ];
    const found = resolveJob(jobs, null);
    assert.equal(found.id, "job-2");
  });

  it("falls back to first job when none running", () => {
    const jobs = [
      { id: "job-1", status: "completed" },
      { id: "job-2", status: "failed" },
    ];
    const found = resolveJob(jobs, null);
    assert.equal(found.id, "job-1");
  });
});

describe("cancelJob", () => {
  it("fails when job not found", () => {
    const result = cancelJob(stateDir, "job-nonexistent");
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes("not found"));
  });

  it("fails when job is not running", () => {
    const id = "job-test-cancel-completed";
    createJob(stateDir, id, { kind: "review", status: "completed", sessionId: null, workspace: repoDir });
    upsertJob(stateDir, id, { status: "completed" });
    const result = cancelJob(stateDir, id);
    assert.equal(result.ok, false);
    assert.ok(result.reason.includes("not running"));
  });

  it("succeeds for a running job and marks it as cancelled on disk", () => {
    const id = "job-test-cancel-running";
    createJob(stateDir, id, { kind: "review", status: "running", sessionId: null, workspace: repoDir });
    upsertJob(stateDir, id, { status: "running" });
    const result = cancelJob(stateDir, id);
    assert.equal(result.ok, true);
    const saved = readJobFile(stateDir, id);
    assert.equal(saved.status, "cancelled");
  });

  it("succeeds for a queued job", () => {
    const id = "job-test-cancel-queued";
    createJob(stateDir, id, { kind: "review", status: "queued", sessionId: null, workspace: repoDir });
    upsertJob(stateDir, id, { status: "queued" });
    const result = cancelJob(stateDir, id);
    assert.equal(result.ok, true);
  });
});
