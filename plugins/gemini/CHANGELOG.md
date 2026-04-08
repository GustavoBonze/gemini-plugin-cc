# Changelog

## 1.5.0

- `--cwd <dir>`: review and task commands now accept a working directory override
- `--prompt-file <path>`: review focus and task text can be loaded from a file (useful for large prompts)
- `--fresh` flag on task/rescue: explicit no-resume, mutually exclusive with `--resume-last`
- `--poll-interval-ms <ms>` on status: configurable polling interval for `--wait` (default 2000ms)
- `title` and `request` fields on all job records: human-readable job name + original request text
- `/gemini:status` and `/gemini:result` now show title and request in job detail view
- JSON Schema upgraded from draft-07 to 2020-12 with `additionalProperties: false` and `minLength` constraints
- `next_steps` is now required in review output schema (was optional)
- `artifacts` field added to review output schema and rendered in review/result output
- Review prompts updated to use `<structured_output_contract>` tag (aligned with Codex)
- Adversarial review prompt updated with `next_steps` and `artifacts` in output contract

## 1.4.0

- `background-worker` subcommand: background jobs now spawn a Node.js worker process instead of Gemini CLI directly
- Worker captures stdout cleanly (no mixed stdout/stderr on same fd), extracts `geminiSessionId`, and updates job file atomically on completion
- `geminiSessionId` is now stored for **all** background job types (review, adversarial-review, rescue/task), not just `--wait` foreground jobs
- `--resume-last` on task/rescue commands works reliably regardless of whether the prior job ran in foreground or background
- `loadJob(id)` helper added for direct job file reads
- `geminiArgs` stored in job file at spawn time so the worker can reconstruct the Gemini call

## 1.3.0

- `durationLabel()`: elapsed for running jobs, duration for completed/failed/cancelled (matches Codex)
- `inferPhase()`: infers live phase from log lines (analyzing→reviewing→finalizing) for background jobs
- `appendLog()`: timestamped log lines written by companion (header, completions, errors)
- `spawnGeminiBackground()`: writes timestamped START header to log before detaching
- `runGemini()` with `logFile`: writes timestamped stderr lines to log in --wait mode
- `geminiSessionId` stored per job on completion; shown in status/result with `gemini --resume` hint
- `rendered` stored in job file on --wait completion; `/gemini:result` uses it first (no log re-parse)
- `extractJobSummary()`: auto-generates summary from verdict+finding or first response line
- Status table: running jobs show live inferred phase; finished jobs show Write + Summary columns
- `/gemini:result`: shows header with summary, geminiSessionId, resume hint; prefers stored rendered

## 1.2.0

- `--depth low|medium|high`: maps to model selection and prompt depth (low=flash, high=pro+expanded)
- Model aliases: `flash` → gemini-2.5-flash, `pro` → gemini-3.1-pro-preview, `thinking` → 2.5 Flash with reasoning
- `--thinking` flag on review: uses thinking-capable model and surfaces reasoning summary in output
- `reasoningSummary`: parses thinking tokens from Gemini 2.5 JSON response and displays in review output
- `--wait` / `--timeout-ms` on `/gemini:status`: polls until running jobs complete or timeout
- `--scope` added to argument-hint on review/adversarial-review commands
- `--depth` added to argument-hint on rescue command
- Model aliases documented in agents and skills

## 1.1.0

- Session lifecycle hooks: `SessionStart` injects `GEMINI_COMPANION_SESSION_ID`, `SessionEnd` cancels orphaned jobs
- `/gemini:status` now scoped to current session by default; `--all` shows all jobs
- `--wait` flag on review commands: creates a tracked job and waits inline for completion
- `jobClass` and `kindLabel` on all job records (review/adversarial-review/rescue)
- Write-mode tracking on rescue tasks; review hint shown after `--write` task completes
- Improved `detectDefaultBranch`: tries `origin/HEAD` symbolic ref then `show-ref` for main/master/trunk
- Cancel output improved: shows kind, summary, and queue hint
- Job status view shows write flag and post-task review suggestions
- `gemini-prompting` skill now includes 3 reference files: `prompt-blocks.md`, `gemini-prompt-recipes.md`, `gemini-prompt-antipatterns.md`

## 1.0.0

- Initial release
- `/gemini:review` — code review of working tree or branch
- `/gemini:adversarial-review` — challenge review questioning design and tradeoffs
- `/gemini:rescue` — delegate investigation or tasks to Gemini
- `/gemini:status` — show active and recent Gemini jobs
- `/gemini:result` — display final output of a finished job
- `/gemini:cancel` — cancel an active background job
- `/gemini:setup` — check Gemini CLI installation and auth
- `gemini:gemini-rescue` subagent for proactive delegation
