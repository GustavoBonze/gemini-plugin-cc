import fs from "node:fs";
import { listJobs, readJobFile, resolveJobFile, resolveJobLogFile, upsertJob } from "./state.mjs";
import { SESSION_ID_ENV } from "./tracked-jobs.mjs";

export const DEFAULT_MAX_STATUS_JOBS = 8;

export function sortJobsNewestFirst(jobs) {
  return [...jobs].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export function getRecentJobs(stateDir, options = {}) {
  const sessionId = process.env[SESSION_ID_ENV] ?? null;
  return sortJobsNewestFirst(listJobs(stateDir, { all: options.all ?? false, sessionId }))
    .slice(0, options.limit ?? DEFAULT_MAX_STATUS_JOBS);
}

export function resolveJob(jobs, idHint) {
  if (idHint) return jobs.find(j => j.id === idHint || j.id.startsWith(idHint)) ?? null;
  return jobs.find(j => j.status === "running") ?? jobs[0] ?? null;
}

export function durationLabel(job) {
  const isActive = job.status === "running" || job.status === "queued";
  const start = new Date(job.startedAt ?? job.createdAt).getTime();
  const end = isActive ? Date.now() : job.completedAt ? new Date(job.completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "-";
  const s = Math.max(0, Math.floor((end - start) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

export function inferPhase(job) {
  if (job.status === "completed") return "done";
  if (job.status === "cancelled") return "cancelled";
  if (job.status === "failed") return "failed";
  const lf = job.logFile;
  if (!lf || !fs.existsSync(lf)) return job.phase ?? "starting";
  try {
    const lines = fs.readFileSync(lf, "utf8")
      .split("\n").map(l => l.replace(/^\[[^\]]+\]\s*/, "").toLowerCase().trim()).filter(Boolean).slice(-30);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.includes("context:") || l.includes("scope:")) return "analyzing";
      if (l.includes("calling") || l.includes("model:")) return "reviewing";
      if (l.includes("completed")) return "finalizing";
      if (l.includes("starting")) return "starting";
      if (l.includes("error:")) return "failed";
    }
  } catch {}
  return job.phase ?? "running";
}

export function progressPreview(logFile) {
  try {
    return fs.readFileSync(logFile, "utf8")
      .split("\n").map(l => l.replace(/^\[[^\]]+\]\s*/, "").trim())
      .filter(l => l && !l.startsWith("{") && l.length < 200).slice(-4).join("\n");
  } catch { return ""; }
}

export function cancelJob(stateDir, jobId) {
  const job = readJobFile(stateDir, jobId);
  if (!job) return { ok: false, reason: `Job ${jobId} not found.` };
  if (job.status !== "running" && job.status !== "queued") return { ok: false, reason: `Job ${jobId} is not running (status: ${job.status}).` };
  if (job.pid) {
    try { process.kill(job.pid, "SIGTERM"); } catch {}
  }
  upsertJob(stateDir, jobId, { status: "cancelled", phase: "cancelled", completedAt: new Date().toISOString() });
  return { ok: true };
}
