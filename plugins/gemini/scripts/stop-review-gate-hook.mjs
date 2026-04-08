#!/usr/bin/env node
/**
 * stop-review-gate-hook.mjs
 * Called by Claude Code's Stop hook when the review gate is enabled.
 * If reviewGateEnabled is true in config, triggers a Gemini self-review before stopping.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getConfig } from "./lib/state.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const IS_WIN = process.platform === "win32";
const cwd = process.cwd();

async function main() {
  let config;
  try {
    config = getConfig(resolveWorkspaceRoot(cwd));
  } catch {
    // If state can't be read, don't block the stop
    process.exit(0);
  }

  if (!config.reviewGateEnabled) {
    process.exit(0);
  }

  const promptFile = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "..",
    "prompts",
    "stop-review-gate.md"
  );

  const fs = await import("node:fs");
  let prompt;
  try {
    prompt = fs.default.readFileSync(promptFile, "utf8")
      .replace(/^---[\s\S]*?---\n/, "").trim();
  } catch {
    process.exit(0);
  }

  process.stderr.write("[gemini] Stop review gate: running self-review...\n");

  const result = spawnSync("gemini", ["-p", prompt, "-y"], {
    encoding: "utf8",
    timeout: 60000,
    shell: IS_WIN,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) {
    process.stdout.write("\n--- Gemini Self-Review ---\n");
    process.stdout.write(result.stdout.trim() + "\n");
    process.stdout.write("--- End Self-Review ---\n\n");
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
