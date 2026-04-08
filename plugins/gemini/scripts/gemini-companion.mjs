#!/usr/bin/env node
/**
 * gemini-companion.mjs
 * Entry point for the Gemini Claude Code plugin companion script.
 * All logic lives in ./lib — this file is the command router only.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/args.mjs";
import { binaryAvailable } from "./lib/process.mjs";
import { callGeminiSDK, isSdkAvailable, imageFileToPart } from "./lib/gemini-client.mjs";
import { resolveStateDir, getConfig, updateConfig, listJobs, readJobFile, resolveJobFile, resolveJobLogFile, pruneOldJobs } from "./lib/state.mjs";
import { createJob, updateJob, finalizeJob, appendLogLine, SESSION_ID_ENV } from "./lib/tracked-jobs.mjs";
import { resolveScope, collectWorkingTreeContext, collectBranchContext, detectDefaultBranch, ensureGitRepository } from "./lib/git.mjs";
import { buildReviewPrompt, buildDepthInstructions } from "./lib/prompts.mjs";
import { renderReviewOutput, renderJobStatus, renderJobList, renderJobTable, renderSetupOutput, extractJobSummary } from "./lib/render.mjs";
import { progressPreview, durationLabel, inferPhase, resolveJob, getRecentJobs, cancelJob } from "./lib/job-control.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT_DIR = path.resolve(fileURLToPath(new URL(".", import.meta.url)));
const PLUGIN_DATA_ENV = "CLAUDE_PLUGIN_DATA";
const DEFAULT_MODEL = "gemini-3.1-pro-preview";

const MODEL_ALIASES = {
  flash:    "gemini-2.5-flash",
  pro:      "gemini-3.1-pro-preview",
  thinking: "gemini-2.5-flash",
};

const DEPTH_MODELS = {
  low:    "gemini-2.5-flash",
  medium: DEFAULT_MODEL,
  high:   DEFAULT_MODEL,
};

const EFFORT_MODELS = {
  none:    "gemini-2.5-flash",
  minimal: "gemini-2.5-flash",
  low:     "gemini-2.5-flash",
  medium:  DEFAULT_MODEL,
  high:    DEFAULT_MODEL,
  xhigh:   DEFAULT_MODEL,
};

const IS_WIN = process.platform === "win32";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) { process.stderr.write(`[gemini] ${msg}\n`); }

function resolveModel(model) { return MODEL_ALIASES[model] || model || DEFAULT_MODEL; }
function resolveDepth(depth, explicitModel) {
  if (explicitModel) return resolveModel(explicitModel);
  return DEPTH_MODELS[depth] || DEFAULT_MODEL;
}
function resolveEffort(effort) { return EFFORT_MODELS[effort] || DEFAULT_MODEL; }

function generateJobId() {
  return `job-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

function getSessionId() { return process.env[SESSION_ID_ENV] || null; }

function getStateDir() { return resolveStateDir(process.cwd()); }

function jobLogFile(jobId) { return resolveJobLogFile(getStateDir(), jobId); }

function appendLog(logFile, msg) { appendLogLine(logFile, msg); }

function extractReasoningSummary(raw) {
  if (!raw) return null;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join(" ") : raw?.text ?? null;
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 600 ? clean.slice(0, 600) + "…" : clean;
}

// ---------------------------------------------------------------------------
// Gemini runner — SDK first, CLI fallback
// ---------------------------------------------------------------------------

/**
 * Calls Gemini via the @google/generative-ai SDK (no spawn, no CLI overhead).
 * Falls back to the CLI if the SDK is unavailable or the call fails.
 */
async function runGemini(args, { timeout = 300000, logFile = null, thinkingBudget = null, imagePaths = [] } = {}) {
  // Extract model and prompt from args array ("-m", model, "-p", prompt, ...)
  const modelIdx = args.indexOf("-m");
  const promptIdx = args.indexOf("-p");
  const model = modelIdx !== -1 ? args[modelIdx + 1] : DEFAULT_MODEL;
  const prompt = promptIdx !== -1 ? args[promptIdx + 1] : null;

  if (prompt && await isSdkAvailable()) {
    const budgetLabel = thinkingBudget !== null ? `, thinking-budget: ${thinkingBudget}` : "";
    log(`Calling ${model} via SDK${budgetLabel}...`);
    appendLog(logFile, `SDK call: ${model}${budgetLabel}`);
    try {
      return await Promise.race([
        callGeminiSDK(model, prompt, { thinkingBudget, imagePaths }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Gemini SDK timed out after ${timeout / 1000}s`)), timeout)),
      ]);
    } catch (sdkErr) {
      if (sdkErr.message !== "SDK_UNAVAILABLE") {
        log(`SDK error (${sdkErr.message}), falling back to CLI...`);
        appendLog(logFile, `SDK failed: ${sdkErr.message} — retrying via CLI`);
      }
    }
  }

  // CLI fallback
  if (imagePaths.length > 0) {
    log("Warning: --image is only supported via SDK (GOOGLE_API_KEY). Images will be ignored in CLI fallback.");
    appendLog(logFile, "Warning: images ignored — SDK unavailable, falling back to CLI without image context.");
  }
  return new Promise((resolve, reject) => {
    const fullArgs = [...args, "-o", "json"];
    log(`Calling ${model} via CLI...`);
    const proc = spawn("gemini", fullArgs, {
      env: { ...process.env },
      shell: IS_WIN,
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => {
      const line = d.toString();
      stderr += line;
      for (const raw of line.split("\n")) {
        const clean = raw.replace(/\u001b\[[0-9;]*m/g, "").trim();
        if (!clean) continue;
        if (!clean.match(/MCP|cred|refresh|Sched|Execut|complete/i)) log(clean);
        appendLog(logFile, clean);
      }
    });

    const timer = setTimeout(() => { proc.kill(); reject(new Error(`Gemini timed out after ${timeout / 1000}s`)); }, timeout);

    proc.on("error", err => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new Error("Gemini CLI not found. Run: npm install -g @google/gemini-cli") : err);
    });

    proc.on("close", code => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) return reject(new Error(stderr.trim() || `Gemini exited with code ${code}`));
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return resolve({ response: stdout.trim(), sessionId: null, reasoningSummary: null });
      try {
        const data = JSON.parse(jsonMatch[0]);
        const rawThinking = data.thinking || data.reasoning || data.thought || null;
        resolve({ response: data.response || stdout.trim(), sessionId: data.session_id || null, reasoningSummary: extractReasoningSummary(rawThinking) });
      } catch {
        resolve({ response: stdout.trim(), sessionId: null, reasoningSummary: null });
      }
    });
  });
}

function spawnGeminiBackground(args, jobId, { kind = "job", model = DEFAULT_MODEL, thinkingBudget = null, imagePaths = [] } = {}) {
  const lf = jobLogFile(jobId);
  appendLog(lf, `Starting Gemini ${kind}...`);
  appendLog(lf, `Model: ${model}`);
  updateJob(getStateDir(), jobId, { geminiArgs: args, thinkingBudget, imagePaths });

  const workerScript = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [workerScript, "background-worker", "--job-id", jobId], {
    env: { ...process.env },
    shell: false,
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return child.pid;
}

// ---------------------------------------------------------------------------
// Command: setup
// ---------------------------------------------------------------------------

async function cmdSetup({ flags }) {
  const asJson = flags["json"] === true;

  if (flags["enable-review-gate"]) {
    updateConfig(process.cwd(), { reviewGateEnabled: true });
    process.stdout.write("Review gate enabled. Gemini will self-review before stopping.\n");
    return;
  }
  if (flags["disable-review-gate"]) {
    updateConfig(process.cwd(), { reviewGateEnabled: false });
    process.stdout.write("Review gate disabled.\n");
    return;
  }

  const node = { available: true, detail: process.version };
  const npm = binaryAvailable("npm");
  const gemini = binaryAvailable("gemini");
  const auth = gemini.available ? getGeminiAuthStatus() : { loggedIn: false, detail: "gemini CLI not installed" };
  const config = (() => { try { return getConfig(resolveWorkspaceRoot(process.cwd())); } catch { return {}; } })();

  const ready = gemini.available && auth.loggedIn;
  const nextSteps = [];
  if (!gemini.available) nextSteps.push("Install Gemini CLI: npm install -g @google/gemini-cli");
  if (gemini.available && !auth.loggedIn) nextSteps.push("Authenticate: run `gemini` once and complete sign-in (or set GOOGLE_API_KEY)");
  if (ready) nextSteps.push("Optional: run `/gemini:setup --enable-review-gate` to require a fresh review before stop.");

  const sdkActive = await isSdkAvailable();
  const payload = {
    ready, node, npm, gemini, auth,
    sessionRuntime: sdkActive
      ? { mode: "sdk", label: "SDK (persistent)", detail: "Calling Gemini API via @google/generative-ai SDK. No CLI spawn — client is reused across calls.", endpoint: null }
      : { mode: "direct", label: "direct startup", detail: "No GOOGLE_API_KEY found. Each command spawns a new Gemini CLI process.", endpoint: null },
    reviewGateEnabled: config.reviewGateEnabled ?? false,
    actionsTaken: [],
    nextSteps,
  };

  process.stdout.write(asJson ? JSON.stringify(payload, null, 2) + "\n" : renderSetupOutput(payload) + "\n");
}

function getGeminiAuthStatus() {
  if (process.env.GOOGLE_API_KEY) return { loggedIn: true, detail: "authenticated via GOOGLE_API_KEY" };
  const credDirs = [path.join(os.homedir(), ".gemini"), path.join(os.homedir(), ".config", "gemini"), path.join(os.homedir(), ".config", "gemini-cli")];
  for (const dir of credDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => f.includes("cred") || f.includes("auth") || f.includes("token") || f.endsWith(".json"));
      if (files.length > 0) return { loggedIn: true, detail: "authenticated" };
    }
  }
  return { loggedIn: false, detail: "not authenticated — run: gemini (complete sign-in) or set GOOGLE_API_KEY" };
}

// ---------------------------------------------------------------------------
// Command: review / adversarial-review
// ---------------------------------------------------------------------------

async function cmdReview(rawArgs, { adversarial = false } = {}) {
  const { flags, positional } = parseArgs(rawArgs);
  const base = flags["base"] || null;
  const scope = flags["scope"] || "auto";
  const isBackground = flags["background"] === true;
  const isWait = flags["wait"] === true;
  const isThinking = flags["thinking"] === true;
  const _rawBudget = flags["thinking-budget"] != null ? parseInt(flags["thinking-budget"], 10) : null;
  if (_rawBudget !== null && isNaN(_rawBudget)) { process.stderr.write("Warning: --thinking-budget value is not a valid number; ignoring.\n"); }
  const thinkingBudget = (_rawBudget !== null && !isNaN(_rawBudget)) ? _rawBudget : null;
  const imagePaths = (Array.isArray(flags["image"]) ? flags["image"] : (flags["image"] ? [flags["image"]] : [])).filter(p => typeof p === "string");
  for (const imgPath of imagePaths) {
    if (!fs.existsSync(path.resolve(imgPath))) { process.stderr.write(`Error: image file not found: ${imgPath}\n`); process.exit(1); }
  }
  const depth = flags["depth"] || "medium";
  const cwd = flags["cwd"] || null;
  const promptFile = flags["prompt-file"] || null;
  let focus = positional.join(" ");
  if (promptFile) {
    try { focus = fs.readFileSync(path.resolve(promptFile), "utf8").trim(); }
    catch (e) { process.stderr.write(`Error reading --prompt-file: ${e.message}\n`); process.exit(1); }
  }

  const rawModel = flags["model"] || (isThinking ? "thinking" : null);
  const effort = flags["effort"] || null;
  const model = rawModel ? resolveModel(rawModel) : effort ? resolveEffort(effort) : resolveDepth(depth, null);
  const kind = adversarial ? "adversarial" : "review";
  const label = adversarial ? "Adversarial Review" : "Review";

  if (cwd) { try { process.chdir(cwd); } catch (e) { process.stderr.write(`Error: cannot chdir to ${cwd}: ${e.message}\n`); process.exit(1); } }

  log(`Starting ${kind}...`);
  let context;
  try { ensureGitRepository(process.cwd()); }
  catch (e) { process.stderr.write(`Error: ${e.message}\n`); process.exit(1); }

  const resolvedScope = resolveScope(scope, base);
  log(`Scope: ${resolvedScope}`);
  context = resolvedScope === "branch"
    ? collectBranchContext(base || detectDefaultBranch(process.cwd()), process.cwd())
    : collectWorkingTreeContext(process.cwd());

  const diffLines = context.diff.split("\n").length;
  log(`Context: ${diffLines} diff lines, model: ${model}${effort ? `, effort: ${effort}` : ""}, depth: ${depth}`);

  let adversarialTemplate = null;
  if (adversarial) {
    try { adversarialTemplate = fs.readFileSync(path.join(ROOT_DIR, "..", "prompts", "adversarial-review.md"), "utf8"); } catch {}
  }

  const prompt = buildReviewPrompt(context, { adversarial, focus, depth, adversarialTemplate });
  const geminiArgs = ["-m", model, "-p", prompt];
  const jobRequest = [`scope:${resolvedScope}`, base ? `base:${base}` : null, focus ? `focus:${focus.slice(0, 120)}` : null].filter(Boolean).join(", ");
  const stateDir = getStateDir();

  if (isBackground && !isWait) {
    const id = generateJobId();
    pruneOldJobs(stateDir);
    createJob(stateDir, id, { kind, kindLabel: label, jobClass: "review", title: `Gemini ${label}`, request: jobRequest, sessionId: getSessionId(), workspace: process.cwd() });
    const pid = spawnGeminiBackground(geminiArgs, id, { kind: label, model, thinkingBudget, imagePaths });
    updateJob(stateDir, id, { pid, phase: "reviewing" });
    process.stdout.write(`Gemini ${label} started in background.\nJob ID: \`${id}\`\nUse /gemini:status to check progress.\n`);
    return;
  }

  const waitId = isWait ? generateJobId() : null;
  if (waitId) {
    pruneOldJobs(stateDir);
    createJob(stateDir, waitId, { kind, kindLabel: label, jobClass: "review", title: `Gemini ${label}`, request: jobRequest, sessionId: getSessionId(), workspace: process.cwd() });
    appendLog(jobLogFile(waitId), `Starting Gemini ${label}...`);
    appendLog(jobLogFile(waitId), `Model: ${model}, depth: ${depth}`);
    updateJob(stateDir, waitId, { phase: "reviewing" });
  }

  try {
    const { response, reasoningSummary } = await runGemini(geminiArgs, { logFile: waitId ? jobLogFile(waitId) : null, thinkingBudget, imagePaths });
    const rendered = renderReviewOutput(response, kind, { reasoningSummary });
    const summary = extractJobSummary(response, kind);
    if (waitId) {
      appendLog(jobLogFile(waitId), `Job ${waitId} completed.`);
      finalizeJob(stateDir, waitId, { rendered, summary, exitCode: 0 });
    }
    process.stdout.write(rendered + "\n");
  } catch (e) {
    if (waitId) finalizeJob(stateDir, waitId, { rendered: null, summary: e.message, exitCode: 1 });
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Command: task (rescue)
// ---------------------------------------------------------------------------

async function cmdTask(rawArgs) {
  const { flags, positional } = parseArgs(rawArgs);
  const isBackground = flags["background"] === true;
  const isWait = flags["wait"] === true;
  const isWrite = flags["write"] === true;
  // --resume and --fresh are routing controls handled by rescue.md; companion ignores them.
  const depth = flags["depth"] || "medium";
  const cwd = flags["cwd"] || null;
  const promptFile = flags["prompt-file"] || null;
  const rawModel = flags["model"] || null;
  const effort = flags["effort"] || null;
  const model = rawModel ? resolveModel(rawModel) : effort ? resolveEffort(effort) : resolveDepth(depth, null);
  const _rawBudgetTask = flags["thinking-budget"] != null ? parseInt(flags["thinking-budget"], 10) : null;
  if (_rawBudgetTask !== null && isNaN(_rawBudgetTask)) { process.stderr.write("Warning: --thinking-budget value is not a valid number; ignoring.\n"); }
  const thinkingBudget = (_rawBudgetTask !== null && !isNaN(_rawBudgetTask)) ? _rawBudgetTask : null;
  const imagePaths = (Array.isArray(flags["image"]) ? flags["image"] : (flags["image"] ? [flags["image"]] : [])).filter(p => typeof p === "string");
  for (const imgPath of imagePaths) {
    if (!fs.existsSync(path.resolve(imgPath))) { process.stderr.write(`Error: image file not found: ${imgPath}\n`); process.exit(1); }
  }

  if (cwd) { try { process.chdir(cwd); } catch (e) { process.stderr.write(`Error: cannot chdir to ${cwd}: ${e.message}\n`); process.exit(1); } }

  let taskText = positional.join(" ").trim();
  if (promptFile) {
    try { taskText = fs.readFileSync(path.resolve(promptFile), "utf8").trim(); }
    catch (e) { process.stderr.write(`Error reading --prompt-file: ${e.message}\n`); process.exit(1); }
  }
  if (!taskText) { process.stderr.write("Error: provide a task description.\n"); process.exit(1); }

  const depthInstructions = buildDepthInstructions(depth);
  const prompt = `<task>\n${taskText}\n</task>${depthInstructions}`;
  // -y: auto-approve all tool calls (always required for non-interactive mode).
  // --write is a semantic flag for the subagent; the CLI always runs non-interactively.
  const geminiArgs = ["-m", model, "-p", prompt, "-y"];
  const stateDir = getStateDir();

  if (isBackground && !isWait) {
    const id = generateJobId();
    pruneOldJobs(stateDir);
    createJob(stateDir, id, { kind: "task", kindLabel: "rescue", jobClass: "task", title: "Gemini Task", request: taskText.slice(0, 120), sessionId: getSessionId(), workspace: process.cwd(), write: isWrite });
    const pid = spawnGeminiBackground(geminiArgs, id, { kind: "task", model, thinkingBudget, imagePaths });
    updateJob(stateDir, id, { pid, phase: "working" });
    process.stdout.write(`Gemini task started in background.\nJob ID: \`${id}\`\nUse /gemini:status to check progress.\n`);
    return;
  }

  const waitId = isWait ? generateJobId() : null;
  if (waitId) {
    pruneOldJobs(stateDir);
    createJob(stateDir, waitId, { kind: "task", kindLabel: "rescue", jobClass: "task", title: "Gemini Task", request: taskText.slice(0, 120), sessionId: getSessionId(), workspace: process.cwd(), write: isWrite });
    appendLog(jobLogFile(waitId), `Starting Gemini task...`);
    appendLog(jobLogFile(waitId), `Model: ${model}`);
    updateJob(stateDir, waitId, { phase: "working" });
  }

  try {
    const { response } = await runGemini(geminiArgs, { logFile: waitId ? jobLogFile(waitId) : null, thinkingBudget, imagePaths });
    if (waitId) {
      const summary = extractJobSummary(response, "task");
      finalizeJob(stateDir, waitId, { rendered: response, summary, exitCode: 0 });
    }
    process.stdout.write(response + "\n");
  } catch (e) {
    if (waitId) finalizeJob(stateDir, waitId, { rendered: null, summary: e.message, exitCode: 1 });
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Command: status
// ---------------------------------------------------------------------------

async function cmdStatus(rawArgs) {
  const { flags, positional } = parseArgs(rawArgs);
  const idHint = positional[0] || null;
  const all = flags["all"] === true;
  const asJson = flags["json"] === true;
  const isWait = flags["wait"] === true;
  const timeoutMs = Math.max(0, parseInt(flags["timeout-ms"] || "60000", 10) || 60000);
  const pollMs = Math.max(100, parseInt(flags["poll-interval-ms"] || "2000", 10) || 2000);
  const stateDir = getStateDir();
  const sessionId = getSessionId();

  // Polling mode: --wait + job-id polls until job finishes or timeout
  if (isWait && idHint) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const jobs = listJobs(stateDir, { all: true, sessionId });
      const job = jobs.find(j => j.id === idHint || j.id.startsWith(idHint));
      if (!job) { process.stdout.write(`Job ${idHint} not found.\n`); return; }
      const done = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
      if (done || Date.now() >= deadline) {
        if (asJson) { process.stdout.write(JSON.stringify(job, null, 2) + "\n"); return; }
        const phase = inferPhase(job);
        const preview = job.logFile ? progressPreview(job.logFile) : "";
        let out = renderJobStatus({ ...job, phase }, { showPreview: true, logPreview: preview });
        if (job.status === "completed") out += `\nNext: /gemini:result ${job.id}`;
        else if (job.status === "failed") out += `\nFailed${job.summary ? `: ${job.summary}` : ""}. Retry: /gemini:review`;
        else if (!done) out += `\nTimeout after ${Math.round(timeoutMs / 1000)}s. Job still ${job.status}: /gemini:status ${job.id}`;
        process.stdout.write(out + "\n");
        return;
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
  }

  const jobs = listJobs(stateDir, { all, sessionId });

  if (idHint) {
    const job = jobs.find(j => j.id === idHint || j.id.startsWith(idHint));
    if (!job) { process.stdout.write(`Job ${idHint} not found.\n`); return; }
    if (asJson) { process.stdout.write(JSON.stringify(job, null, 2) + "\n"); return; }
    const phase = inferPhase(job);
    const preview = job.logFile ? progressPreview(job.logFile) : "";
    let out = renderJobStatus({ ...job, phase }, { showPreview: true, logPreview: preview });
    if (job.status === "completed") {
      out += `\nNext: /gemini:result ${job.id}`;
    } else if (job.status === "running" || job.status === "queued") {
      out += `\nStill ${job.status}. Check again: /gemini:status ${job.id}`;
    } else if (job.status === "failed") {
      out += `\nFailed${job.summary ? `: ${job.summary}` : ""}. Retry: /gemini:review`;
    } else if (job.status === "cancelled") {
      out += `\nCancelled. Start a new review: /gemini:review`;
    }
    process.stdout.write(out + "\n");
    return;
  }

  if (asJson) { process.stdout.write(JSON.stringify(jobs, null, 2) + "\n"); return; }
  const enriched = jobs.map(j => ({ ...j, phase: inferPhase(j) }));
  let out = renderJobTable(enriched);

  const running = enriched.filter(j => j.status === "running" || j.status === "queued");
  const completed = enriched.filter(j => j.status === "completed");
  const hints = [
    ...running.slice(0, 3).map(j => `- /gemini:cancel ${j.id}  — stop this job`),
    ...completed.slice(0, 3).map(j => `- /gemini:result ${j.id}  — retrieve output`),
  ];
  if (hints.length > 0) out += "\n\nActions:\n" + hints.join("\n");

  process.stdout.write(out + "\n");
}

// ---------------------------------------------------------------------------
// Command: result
// ---------------------------------------------------------------------------

async function cmdResult(rawArgs) {
  const { flags, positional } = parseArgs(rawArgs);
  const idHint = positional[0] || null;
  const asJson = flags["json"] === true;
  const stateDir = getStateDir();
  const sessionId = getSessionId();
  const jobs = listJobs(stateDir, { all: true, sessionId });
  const job = idHint ? jobs.find(j => j.id === idHint || j.id.startsWith(idHint)) : jobs.find(j => j.status === "completed") ?? jobs[0];

  if (!job) { process.stdout.write("No job found.\n"); return; }
  if (job.status === "running") { process.stdout.write(`Job \`${job.id}\` is still running. Use /gemini:status ${job.id} to check progress.\n`); return; }
  if (asJson) { process.stdout.write(JSON.stringify(job, null, 2) + "\n"); return; }
  const out = job.rendered || job.summary || "(no output stored)";
  process.stdout.write(out + "\n\nNext: /gemini:status · /gemini:review\n");
}

// ---------------------------------------------------------------------------
// Command: cancel
// ---------------------------------------------------------------------------

async function cmdCancel(rawArgs) {
  const { positional } = parseArgs(rawArgs);
  const idHint = positional[0] || null;
  const stateDir = getStateDir();
  const sessionId = getSessionId();
  const jobs = listJobs(stateDir, { all: false, sessionId });
  const job = idHint ? jobs.find(j => j.id === idHint || j.id.startsWith(idHint)) : jobs.find(j => j.status === "running");

  if (!job) { process.stdout.write("No running job found to cancel.\n"); return; }
  const result = cancelJob(stateDir, job.id);
  process.stdout.write(result.ok ? `Job \`${job.id}\` cancelled.\n` : `Error: ${result.reason}\n`);
}

// ---------------------------------------------------------------------------
// Command: task-resume-candidate
// ---------------------------------------------------------------------------

async function cmdTaskResumeCandidate({ flags }) {
  const stateDir = getStateDir();
  const sessionId = getSessionId();
  const jobs = listJobs(stateDir, { all: false, sessionId });
  const candidate = jobs.find(j => j.status === "completed" && j.jobClass === "task") ?? null;
  const payload = { available: !!candidate, jobId: candidate?.id ?? null, summary: candidate?.summary ?? null };
  if (flags["json"]) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  else process.stdout.write(payload.available ? `Resumable: ${payload.jobId} — ${payload.summary}\n` : "No resumable task found.\n");
}

// ---------------------------------------------------------------------------
// Background worker (internal)
// ---------------------------------------------------------------------------

async function runBackgroundWorker({ flags }) {
  const jobId = flags["job-id"];
  if (!jobId) { process.stderr.write("Error: --job-id required for background-worker.\n"); process.exit(1); }

  const stateDir = getStateDir();
  const job = readJobFile(stateDir, jobId);
  if (!job) { process.stderr.write(`Error: job ${jobId} not found.\n`); process.exit(1); }

  const geminiArgs = job.geminiArgs || [];
  const thinkingBudget = job.thinkingBudget ?? null;
  const imagePaths = job.imagePaths ?? [];
  const lf = job.logFile;

  try {
    const { response, reasoningSummary } = await runGemini(geminiArgs, { logFile: lf, thinkingBudget, imagePaths });
    const kind = job.kind;
    const rendered = (kind === "review" || kind === "adversarial")
      ? renderReviewOutput(response, kind, { reasoningSummary })
      : response;
    const summary = extractJobSummary(response, kind);
    appendLog(lf, `Job ${jobId} completed.`);
    finalizeJob(stateDir, jobId, { rendered, summary, exitCode: 0 });
  } catch (e) {
    appendLog(lf, `Job ${jobId} failed: ${e.message}`);
    finalizeJob(stateDir, jobId, { rendered: null, summary: e.message, exitCode: 1 });
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags, positional } = parseArgs(rest);

  try {
    switch (cmd) {
      case "setup":            return await cmdSetup({ flags });
      case "review":           return await cmdReview(rest, { adversarial: false });
      case "adversarial-review": return await cmdReview(rest, { adversarial: true });
      case "task":             return await cmdTask(rest);
      case "status":           return await cmdStatus(rest);
      case "result":           return await cmdResult(rest);
      case "cancel":           return await cmdCancel(rest);
      case "task-resume-candidate": return await cmdTaskResumeCandidate({ flags });
      case "background-worker": return await runBackgroundWorker({ flags });
      default:
        process.stderr.write([
          "Usage:",
          "  node gemini-companion.mjs setup [--json] [--enable-review-gate] [--disable-review-gate]",
          "  node gemini-companion.mjs review [--wait] [--background] [--base <ref>] [--scope auto|working-tree|branch] [--effort none|...|xhigh] [--depth low|medium|high] [--thinking] [--thinking-budget <n>] [--image <path>] [--model flash|pro|<model>] [--cwd <dir>] [--prompt-file <path>]",
          "  node gemini-companion.mjs adversarial-review [--wait] [--background] [--base <ref>] [--scope auto|working-tree|branch] [--effort none|...|xhigh] [--depth low|medium|high] [--thinking] [--thinking-budget <n>] [--image <path>] [--model flash|pro|<model>] [--cwd <dir>] [--prompt-file <path>] [focus text]",
          "  node gemini-companion.mjs task [--background] [--wait] [--write] [--resume-last|--resume] [--fresh] [--effort none|...|xhigh] [--depth low|medium|high] [--thinking] [--thinking-budget <n>] [--image <path>] [--model flash|pro|<model>] [--cwd <dir>] [--prompt-file <path>] <prompt>",
          "  node gemini-companion.mjs status [job-id] [--wait] [--timeout-ms <ms>] [--poll-interval-ms <ms>] [--all] [--json]",
          "  node gemini-companion.mjs result [job-id] [--json]",
          "  node gemini-companion.mjs cancel [job-id]",
        ].join("\n") + "\n");
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`Fatal: ${e.message}\n`);
    process.exit(1);
  }
}

main();
