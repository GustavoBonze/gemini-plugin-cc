import fs from "node:fs";
import path from "node:path";
import { runCommand, runCommandChecked } from "./process.mjs";
import { isProbablyText } from "./fs.mjs";

const MAX_UNTRACKED_BYTES = 24 * 1024;
const MAX_CONTEXT_BYTES = 900 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".svg",
  ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib", ".a", ".o", ".pyc", ".class",
  ".wasm", ".bin", ".dat", ".db", ".sqlite", ".lock",
]);

function git(cwd, args, options = {}) {
  return runCommand("git", args, { cwd, maxBuffer: 10 * 1024 * 1024, ...options });
}

export function ensureGitRepository(cwd) {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.error?.code === "ENOENT") throw new Error("git is not installed.");
  if (result.status !== 0) throw new Error("Not inside a git repository.");
  return result.stdout.trim();
}

export function getRepoRoot(cwd) {
  return runCommandChecked("git", ["rev-parse", "--show-toplevel"], { cwd }).stdout.trim();
}

export function getCurrentBranch(cwd) {
  return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
}

export function detectDefaultBranch(cwd) {
  const symbolic = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (symbolic.status === 0) {
    const val = symbolic.stdout.trim();
    if (val.startsWith("refs/remotes/origin/")) {
      return val.replace("refs/remotes/origin/", "");
    }
  }
  for (const b of ["main", "master", "trunk"]) {
    const local = git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${b}`]);
    if (local.status === 0) return b;
    const remote = git(cwd, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${b}`]);
    if (remote.status === 0) return `origin/${b}`;
  }
  throw new Error("Unable to detect default branch. Pass --base <ref> or use --scope working-tree.");
}

function isBinary(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const read = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    return !isProbablyText(buf.subarray(0, read));
  } catch { return false; }
}

function readUntrackedFile(filePath, cwd) {
  const abs = path.resolve(cwd, filePath);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_UNTRACKED_BYTES) return `(file too large: ${Math.round(stat.size / 1024)}KB, skipped)`;
    if (isBinary(abs)) return "(binary file, skipped)";
    return fs.readFileSync(abs, "utf8");
  } catch { return null; }
}

export function resolveScope(flagScope, base) {
  if (base) return "branch";
  if (flagScope === "working-tree" || flagScope === "branch") return flagScope;
  const status = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd: process.cwd() });
  return (status.stdout || "").trim() ? "working-tree" : "branch";
}

export function collectWorkingTreeContext(cwd) {
  const status = git(cwd, ["status", "--short", "--untracked-files=all"]).stdout.trim();
  const stagedStat = git(cwd, ["diff", "--cached", "--stat"]).stdout.trim();
  const unstagedStat = git(cwd, ["diff", "--stat"]).stdout.trim();
  let staged = git(cwd, ["diff", "--cached", "--no-ext-diff"]).stdout;
  let unstaged = git(cwd, ["diff", "--no-ext-diff"]).stdout;
  const commits = git(cwd, ["log", "-5", "--oneline", "--decorate"]).stdout.trim();

  let diff = (staged + "\n" + unstaged).trim();
  if (Buffer.byteLength(diff) > MAX_CONTEXT_BYTES) {
    diff = diff.slice(0, MAX_CONTEXT_BYTES) + "\n... (truncated)";
  }

  const untrackedFiles = status.split("\n").filter(l => l.startsWith("??")).map(l => l.slice(3).trim()).filter(Boolean);
  let untrackedContent = "";
  for (const f of untrackedFiles.slice(0, 20)) {
    const content = readUntrackedFile(f, cwd);
    if (!content || content.includes("binary") || content.includes("too large")) continue;
    untrackedContent += `\n=== ${f} (untracked) ===\n${content}\n`;
  }

  return {
    targetLabel: "working tree (staged + unstaged)",
    status,
    diff,
    untrackedContent,
    diffStat: [stagedStat, unstagedStat].filter(Boolean).join("\n"),
    commits,
    branch: getCurrentBranch(cwd),
  };
}

export function collectBranchContext(base, cwd) {
  const mergeBase = git(cwd, ["merge-base", base, "HEAD"]).stdout.trim();
  const commits = git(cwd, ["log", `${base}...HEAD`, "--oneline", "--decorate", "--no-merges", "-20"]).stdout.trim();
  const diffStat = git(cwd, ["diff", "--stat", `${base}...HEAD`]).stdout.trim();
  let diff = git(cwd, ["diff", `${base}...HEAD`, "--no-ext-diff"]).stdout;
  const status = git(cwd, ["status", "--short"]).stdout.trim();

  if (Buffer.byteLength(diff) > MAX_CONTEXT_BYTES) {
    diff = diff.slice(0, MAX_CONTEXT_BYTES) + "\n... (truncated)";
  }

  return {
    targetLabel: `branch diff vs ${base} (merge-base: ${mergeBase.slice(0, 8)})`,
    status,
    diff,
    untrackedContent: "",
    diffStat,
    commits,
    branch: getCurrentBranch(cwd),
  };
}
