import { spawnSync } from "node:child_process";
import process from "node:process";

const IS_WIN = process.platform === "win32";

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    stdio: options.stdio ?? "pipe",
    shell: IS_WIN,
    windowsHide: true,
    maxBuffer: options.maxBuffer,
    timeout: options.timeout,
  });

  return {
    command,
    args,
    status: result.status ?? 0,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null,
  };
}

export function runCommandChecked(command, args = [], options = {}) {
  const result = runCommand(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const msg = result.stderr.trim() || result.stdout.trim() || `Command failed: ${command} ${args.join(" ")}`;
    throw new Error(msg);
  }
  return result;
}

export function binaryAvailable(command, versionArgs = ["--version"], options = {}) {
  const result = runCommand(command, versionArgs, { timeout: 5000, ...options });
  if (result.error && result.error.code === "ENOENT") {
    return { available: false, detail: "not found" };
  }
  if (result.status !== 0) {
    return { available: false, detail: result.stderr.trim() || "non-zero exit" };
  }
  return { available: true, detail: (result.stdout || result.stderr || "").trim() };
}
