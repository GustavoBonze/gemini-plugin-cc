import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const FAKE_GEMINI = path.join(REPO_ROOT, "tests", "fake-gemini-fixture.mjs");

export function makeTempDir(prefix = "gemini-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function makeGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init");
  git("config", "user.email", "test@test.com");
  git("config", "user.name", "Test");
  fs.writeFileSync(path.join(dir, "README.md"), "# Test\n");
  git("add", ".");
  git("commit", "-m", "init");
  return dir;
}

export function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
