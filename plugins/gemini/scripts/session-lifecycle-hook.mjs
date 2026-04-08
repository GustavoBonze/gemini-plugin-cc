#!/usr/bin/env node
/**
 * session-lifecycle-hook.mjs
 * Handles SessionStart and SessionEnd events for the Gemini Companion plugin.
 *
 * SessionStart: injects GEMINI_COMPANION_SESSION_ID into the Claude session env.
 * SessionEnd:   marks any running jobs from this session as cancelled and cleans up.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const SESSION_ID_ENV = "GEMINI_COMPANION_SESSION_ID";
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";
const STATE_BASE = path.join(os.homedir(), ".gemini-companion");
const MAX_JOBS = 50;

// ---------------------------------------------------------------------------
// Helpers (duplicated from companion to keep hook self-contained)
// ---------------------------------------------------------------------------

function workspaceSlug(dir) {
  const hash = crypto.createHash("sha1").update(dir).digest("hex").slice(0, 12);
  const name = path.basename(dir).replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 20);
  return `${name}-${hash}`;
}

function stateDir(cwd) {
  const pluginDataDir = process.env[PLUGIN_DATA_ENV];
  const base = pluginDataDir ? path.join(pluginDataDir, "state") : STATE_BASE;
  return path.join(base, workspaceSlug(cwd));
}

function jobsDir(cwd) {
  return path.join(stateDir(cwd), "jobs");
}

function listJobFiles(cwd) {
  const dir = jobsDir(cwd);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
}

function readJob(cwd, file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(jobsDir(cwd), file), "utf8"));
  } catch { return null; }
}

function writeJob(cwd, file, job) {
  try {
    fs.writeFileSync(path.join(jobsDir(cwd), file), JSON.stringify(job, null, 2));
  } catch {}
}

// ---------------------------------------------------------------------------
// Hook input
// ---------------------------------------------------------------------------

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || value == null || value === "") return;
  fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export ${name}=${shellEscape(value)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// SessionStart
// ---------------------------------------------------------------------------

function handleSessionStart(input) {
  // Inject session ID so jobs can be tagged with it
  appendEnvVar(SESSION_ID_ENV, input.session_id);
  appendEnvVar(PLUGIN_DATA_ENV, process.env[PLUGIN_DATA_ENV]);
}

// ---------------------------------------------------------------------------
// SessionEnd
// ---------------------------------------------------------------------------

function handleSessionEnd(input) {
  const sessionId = input.session_id || process.env[SESSION_ID_ENV] || null;
  const cwd = input.cwd || process.cwd();

  if (!sessionId) return;

  const files = listJobFiles(cwd);
  for (const file of files) {
    const job = readJob(cwd, file);
    if (!job) continue;
    if (job.sessionId !== sessionId) continue;
    if (job.status !== "running" && job.status !== "queued") continue;

    // Kill process if still running
    if (job.pid) {
      try { process.kill(-job.pid, "SIGTERM"); } catch {}
      try { process.kill(job.pid, "SIGTERM"); } catch {}
    }

    writeJob(cwd, file, {
      ...job,
      status: "cancelled",
      phase: "cancelled",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const input = readHookInput();
  const eventName = process.argv[2] ?? input.hook_event_name ?? "";

  if (eventName === "SessionStart") {
    handleSessionStart(input);
    return;
  }

  if (eventName === "SessionEnd") {
    handleSessionEnd(input);
  }
}

main().catch(err => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
