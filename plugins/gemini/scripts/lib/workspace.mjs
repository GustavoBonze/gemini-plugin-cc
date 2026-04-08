import { runCommand } from "./process.mjs";

export function resolveWorkspaceRoot(cwd) {
  try {
    const result = runCommand("git", ["rev-parse", "--show-toplevel"], { cwd });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  } catch {}
  return cwd;
}
