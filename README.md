# Gemini plugin for Claude Code

Use Gemini from inside Claude Code to review code or delegate tasks.

## What You Get

- `/gemini:review` — read-only code review against your local git state
- `/gemini:adversarial-review` — steerable review that challenges implementation and design choices
- `/gemini:rescue` — delegate investigation, bug fixes, or implementation tasks to Gemini
- `/gemini:status` — check active and recent Gemini jobs
- `/gemini:result` — retrieve the stored output of a finished job
- `/gemini:cancel` — cancel an active background job
- `/gemini:setup` — verify installation and configure options

## Requirements

- **Node.js 18.18 or later**
- **Gemini CLI** (`npm install -g @google/gemini-cli`) and a Google account, **or** a `GOOGLE_API_KEY` for direct SDK access

## Install

```
/plugin marketplace add gustavoBonze/gemini-plugin-cc
/plugin install gemini@gustavobonze-gemini
/reload-plugins
/gemini:setup
```

If Gemini CLI is missing and npm is available, `/gemini:setup` will offer to install it automatically.

To authenticate manually, run `gemini` once and complete the sign-in flow, or set:

```bash
export GOOGLE_API_KEY=your-key
```

## Usage

### `/gemini:review`

Runs a Gemini review on your current work. Review-only — no fixes applied.

```bash
/gemini:review
/gemini:review --base main
/gemini:review --scope branch --base main
/gemini:review --background
/gemini:review --wait --effort high
/gemini:review --thinking --thinking-budget 2048
/gemini:review --image screenshot.png
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--wait` | Run in foreground without asking |
| `--background` | Run as background job without asking |
| `--base <ref>` | Compare current branch against `<ref>` (e.g. `main`) |
| `--scope auto\|working-tree\|branch` | Review scope (default: `auto`) |
| `--effort <level>` | Effort level: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `--depth low\|medium\|high` | Depth of analysis (default: `medium`) |
| `--model <alias\|name>` | Model override (see [Models](#models)) |
| `--thinking` | Enable reasoning tokens |
| `--thinking-budget <n>` | Reasoning token budget (`0` = off, positive = limit) |
| `--image <path>` | Include an image in the review context (repeatable) |
| `--cwd <dir>` | Run from a different directory |
| `--prompt-file <path>` | Load review focus text from a file |

---

### `/gemini:adversarial-review`

Same as `/gemini:review` but frames the review adversarially — questions design decisions, tradeoffs, and assumptions. Accepts an optional focus text.

```bash
/gemini:adversarial-review
/gemini:adversarial-review --base main challenge the caching strategy
/gemini:adversarial-review --background look for race conditions
/gemini:adversarial-review --effort xhigh question the auth flow
```

Supports all the same flags as `/gemini:review`, plus free-form focus text at the end.

---

### `/gemini:rescue`

Delegates a task to Gemini through the `gemini:gemini-rescue` subagent. Use this for investigation, bug fixes, implementation, or research.

```bash
/gemini:rescue investigate why the tests are failing
/gemini:rescue fix the failing test with the smallest safe patch
/gemini:rescue --resume apply the top fix from the last run
/gemini:rescue --fresh start a new thread and plan the refactor
/gemini:rescue --background investigate the flaky integration test
/gemini:rescue --write implement the feature described in the issue
/gemini:rescue --effort high --thinking diagnose the memory leak
/gemini:rescue --image diagram.png explain what this architecture diagram means
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--wait` | Run in foreground |
| `--background` | Run as background job |
| `--resume` | Continue the last Gemini thread from this session |
| `--fresh` | Force a new thread |
| `--write` | Allow Gemini to write files (default: read-only) |
| `--effort <level>` | Effort level (same levels as review) |
| `--depth low\|medium\|high` | Analysis depth |
| `--model <alias\|name>` | Model override |
| `--thinking` | Enable reasoning tokens |
| `--thinking-budget <n>` | Reasoning token budget |
| `--image <path>` | Include an image in the context (repeatable) |
| `--cwd <dir>` | Run from a different directory |
| `--prompt-file <path>` | Load task text from a file |

---

### `/gemini:status`

Shows active and recent Gemini jobs for the current repository. Outputs a table with actionable follow-up commands.

```bash
/gemini:status
/gemini:status job-abc123
/gemini:status --all
/gemini:status --wait job-abc123
/gemini:status --json
```

**Flags:** `[job-id]`, `--wait`, `--timeout-ms <ms>`, `--poll-interval-ms <ms>`, `--all`, `--json`

---

### `/gemini:result`

Shows the stored final output for a finished job.

```bash
/gemini:result
/gemini:result job-abc123
/gemini:result --json
```

---

### `/gemini:cancel`

Cancels an active background job.

```bash
/gemini:cancel
/gemini:cancel job-abc123
```

---

### `/gemini:setup`

Checks installation and authentication. Offers to install Gemini CLI if missing.

```bash
/gemini:setup
/gemini:setup --enable-review-gate
/gemini:setup --disable-review-gate
```

## Models

The default model is `gemini-3.1-pro-preview`. Override with `--model`:

```bash
/gemini:review --model flash
/gemini:rescue --model pro investigate the bug
```

| Alias | Model | Best for |
|-------|-------|----------|
| `flash` | `gemini-2.5-flash` | Fast, lightweight tasks |
| `pro` | `gemini-3.1-pro-preview` | Deep analysis (default) |

## Effort Levels

`--effort` selects a model automatically based on the required intensity:

| Level | Model |
|-------|-------|
| `none`, `minimal`, `low` | `gemini-2.5-flash` |
| `medium`, `high`, `xhigh` | `gemini-3.1-pro-preview` |

`--model` takes priority over `--effort`, and `--effort` takes priority over `--depth`.

## Multimodal

Include images in reviews or rescue tasks with `--image`. Requires `GOOGLE_API_KEY` (SDK mode).

```bash
/gemini:review --image screenshot.png
/gemini:rescue --image before.png --image after.png explain the visual diff
```

Supported formats: PNG, JPEG, WEBP, GIF, BMP.

## SDK Mode

When `GOOGLE_API_KEY` is set, the plugin calls the Gemini API directly via the `@google/genai` SDK instead of spawning a Gemini CLI process for every call. This eliminates startup overhead and keeps a persistent client across calls. The SDK is required for multimodal (`--image`) and thinking (`--thinking-budget`) features.

```bash
export GOOGLE_API_KEY=your-key
```

`/gemini:setup` reports whether the plugin is running in SDK mode or direct CLI mode.

## Thinking Mode

Enable Gemini's reasoning tokens for deeper analysis:

```bash
/gemini:review --thinking
/gemini:rescue --thinking --thinking-budget 4096 debug this race condition
```

`--thinking` activates reasoning. `--thinking-budget <n>` sets the token limit (`0` disables thinking, positive values set the budget). Requires SDK mode.

## Review Gate

Automatically run a Gemini review before Claude finalizes each response:

```bash
/gemini:setup --enable-review-gate
/gemini:setup --disable-review-gate
```

When enabled, a `Stop` hook intercepts Claude's response and runs a focused Gemini review. If issues are found, Claude is asked to address them before finishing.

## License

Apache-2.0 — © 2026 Gustavo Bonze
