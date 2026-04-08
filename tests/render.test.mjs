import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderReviewOutput, renderJobList, renderJobTable, extractJobSummary } from "../plugins/gemini/scripts/lib/render.mjs";

const sampleReview = {
  verdict: "needs-attention",
  summary: "Two issues found.",
  findings: [
    { severity: "low", file: "a.js", line_start: 1, line_end: 2, title: "Minor issue", body: "Details", recommendation: "Fix it", confidence: 0.8 },
    { severity: "critical", file: "b.js", line_start: 5, line_end: 5, title: "Critical bug", body: "Crash risk", recommendation: "Fix urgently", confidence: 1.0 },
  ],
  next_steps: ["Fix critical bug first"],
  artifacts: [],
};

describe("renderReviewOutput", () => {
  it("renders verdict as needs-attention", () => {
    const out = renderReviewOutput(JSON.stringify(sampleReview));
    assert.ok(out.includes("NEEDS ATTENTION"));
  });

  it("sorts findings critical first", () => {
    const out = renderReviewOutput(JSON.stringify(sampleReview));
    const criticalIdx = out.indexOf("CRITICAL");
    const lowIdx = out.indexOf("LOW");
    assert.ok(criticalIdx < lowIdx, "Critical should appear before Low");
  });

  it("renders approve verdict", () => {
    const data = { ...sampleReview, verdict: "approve", findings: [], next_steps: [] };
    const out = renderReviewOutput(JSON.stringify(data));
    assert.ok(out.includes("APPROVE"));
  });

  it("falls back gracefully on invalid JSON", () => {
    const out = renderReviewOutput("not valid json");
    assert.equal(out, "not valid json");
  });

  it("returns ERROR when required fields are missing", () => {
    const bad = JSON.stringify({ verdict: "approve", summary: "ok" }); // missing findings, next_steps
    const out = renderReviewOutput(bad);
    assert.ok(out.startsWith("ERROR:"), "should start with ERROR:");
    assert.ok(out.includes("findings"), "should mention missing field");
    assert.ok(out.includes("next_steps"), "should mention missing field");
  });

  it("returns ERROR on unrecognized verdict", () => {
    const bad = JSON.stringify({ verdict: "maybe", summary: "ok", findings: [], next_steps: [] });
    const out = renderReviewOutput(bad);
    assert.ok(out.startsWith("ERROR:"), "should start with ERROR:");
    assert.ok(out.includes("maybe"), "should include the bad verdict value");
  });

  it("returns ERROR when findings is not an array", () => {
    const bad = JSON.stringify({ verdict: "approve", summary: "ok", findings: "none", next_steps: [] });
    const out = renderReviewOutput(bad);
    assert.ok(out.startsWith("ERROR:"), "should start with ERROR:");
  });
});

describe("renderJobList", () => {
  it("shows message when no jobs", () => {
    const out = renderJobList([]);
    assert.ok(out.includes("No recent"));
  });

  it("renders job entries", () => {
    const jobs = [{ id: "job-123", status: "completed", kind: "review", kindLabel: "Review", phase: "done" }];
    const out = renderJobList(jobs);
    assert.ok(out.includes("job-123"));
  });
});

describe("renderJobTable", () => {
  it("shows message when no jobs", () => {
    const out = renderJobTable([]);
    assert.ok(out.includes("No recent"));
  });

  it("renders table with box-drawing characters", () => {
    const jobs = [{ id: "job-abc123", status: "completed", kind: "review", kindLabel: "Review", phase: "done", title: "Test review" }];
    const out = renderJobTable(jobs);
    assert.ok(out.includes("┌"), "should have top border");
    assert.ok(out.includes("└"), "should have bottom border");
    assert.ok(out.includes("Review"), "should show kind");
    assert.ok(out.includes("completed"), "should show status");
  });

  it("truncates long title with ellipsis", () => {
    const longTitle = "A".repeat(60);
    const jobs = [{ id: "job-1", status: "running", kind: "task", kindLabel: "task", phase: "working", title: longTitle }];
    const out = renderJobTable(jobs);
    assert.ok(out.includes("…"), "should truncate with ellipsis");
  });
});

describe("extractJobSummary", () => {
  it("extracts verdict from review JSON", () => {
    const summary = extractJobSummary(JSON.stringify(sampleReview), "review");
    assert.ok(summary.includes("needs-attention"));
  });

  it("extracts first line from task output", () => {
    const summary = extractJobSummary("Done.\nMore details here.", "task");
    assert.ok(summary.includes("Done"));
  });
});
