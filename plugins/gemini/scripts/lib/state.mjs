import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 1;
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";
const FALLBACK_STATE_ROOT = path.join(os.homedir(), ".gemini-companion");
const MAX_JOBS = 50;

function nowIso() {
  return new Date().toISOString();
}

export function resolveStateDir(cwd) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonical = workspaceRoot;
  try { canonical = fs.realpathSync.native(workspaceRoot); } catch {}

  const slug = path.basename(workspaceRoot).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 8);

  const pluginData = process.env[PLUGIN_DATA_ENV];
  const base = pluginData ? path.join(pluginData, "state") : FALLBACK_STATE_ROOT;
  const dir = path.join(base, `${slug}-${hash}`);

  fs.mkdirSync(path.join(dir, "jobs"), { recursive: true });
  return dir;
}

function stateFile(stateDir) {
  return path.join(stateDir, "state.json");
}

function readStateRaw(stateDir) {
  try { return JSON.parse(fs.readFileSync(stateFile(stateDir), "utf8")); }
  catch { return { version: STATE_VERSION, config: { reviewGateEnabled: false }, jobs: [] }; }
}

function writeStateRaw(stateDir, data) {
  fs.writeFileSync(stateFile(stateDir), JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function getConfig(cwd) {
  const dir = resolveStateDir(cwd);
  return readStateRaw(dir).config ?? {};
}

export function updateConfig(cwd, patch) {
  const dir = resolveStateDir(cwd);
  const state = readStateRaw(dir);
  state.config = { ...state.config, ...patch };
  writeStateRaw(dir, state);
}

export function resolveJobFile(stateDir, jobId) {
  return path.join(stateDir, "jobs", `${jobId}.json`);
}

export function resolveJobLogFile(stateDir, jobId) {
  return path.join(stateDir, "jobs", `${jobId}.log`);
}

export function readJobFile(stateDir, jobId) {
  try { return JSON.parse(fs.readFileSync(resolveJobFile(stateDir, jobId), "utf8")); }
  catch { return null; }
}

export function writeJobFile(stateDir, jobId, data) {
  fs.writeFileSync(resolveJobFile(stateDir, jobId), JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function upsertJob(stateDir, jobId, patch) {
  const existing = readJobFile(stateDir, jobId) ?? {};
  const updated = { ...existing, ...patch, updatedAt: nowIso() };
  writeJobFile(stateDir, jobId, updated);
  return updated;
}

export function listJobs(stateDir, { all = false, sessionId = null } = {}) {
  const dir = path.join(stateDir, "jobs");
  try {
    let jobs = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""));

    if (!all && sessionId) {
      const session = jobs.filter(j => j.sessionId === sessionId);
      if (session.length > 0) jobs = session;
    }

    return jobs.slice(0, all ? MAX_JOBS : 20);
  } catch { return []; }
}

export function pruneOldJobs(stateDir) {
  const dir = path.join(stateDir, "jobs");
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const { f } of files.slice(MAX_JOBS)) {
      const id = f.replace(".json", "");
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
      try { fs.unlinkSync(path.join(dir, `${id}.log`)); } catch {}
    }
  } catch {}
}
