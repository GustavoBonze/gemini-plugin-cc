import fs from "node:fs";
import { resolveJobFile, resolveJobLogFile, upsertJob } from "./state.mjs";

export const SESSION_ID_ENV = "GEMINI_COMPANION_SESSION_ID";

export function nowIso() {
  return new Date().toISOString();
}

export function appendLogLine(logFile, message) {
  if (!logFile || !message) return;
  try { fs.appendFileSync(logFile, `[${nowIso()}] ${String(message).trim()}\n`, "utf8"); } catch {}
}

export function createJob(stateDir, jobId, fields = {}) {
  const record = {
    id: jobId,
    kind: fields.kind ?? "task",
    kindLabel: fields.kindLabel ?? fields.kind ?? "task",
    jobClass: fields.jobClass ?? "task",
    title: fields.title ?? null,
    request: fields.request ?? null,
    write: fields.write ?? false,
    status: "running",
    phase: "starting",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    startedAt: nowIso(),
    completedAt: null,
    workspace: fields.workspace ?? process.cwd(),
    logFile: resolveJobLogFile(stateDir, jobId),
    pid: null,
    sessionId: fields.sessionId ?? null,
    summary: null,
    rendered: null,
    exitCode: null,
  };
  const jobPath = resolveJobFile(stateDir, jobId);
  fs.writeFileSync(jobPath, JSON.stringify(record, null, 2) + "\n", "utf8");
  return record;
}

export function updateJob(stateDir, jobId, patch) {
  return upsertJob(stateDir, jobId, patch);
}

export function finalizeJob(stateDir, jobId, { rendered, summary, exitCode = 0 } = {}) {
  return upsertJob(stateDir, jobId, {
    status: exitCode === 0 ? "completed" : "failed",
    phase: exitCode === 0 ? "done" : "failed",
    completedAt: nowIso(),
    rendered: rendered ?? null,
    summary: summary ?? null,
    exitCode,
  });
}
