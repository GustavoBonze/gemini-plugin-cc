# Changelog

## [1.0.0] — 2026-04-08

### Added — Initial public release

**Commands**
- `/gemini:review` — review working tree or branch diff against Gemini
- `/gemini:adversarial-review` — critical review questioning design decisions
- `/gemini:rescue` — delegate a task to Gemini and get structured output
- `/gemini:status [job-id]` — job dashboard with box-drawing table; action hints so Claude knows exactly what to do next
- `/gemini:result [job-id]` — display the final output of a completed job
- `/gemini:cancel <job-id>` — cancel a running or queued job
- `/gemini:setup` — verify installation, authentication, and review gate configuration

**Flags available across commands**
- `--background` / `--wait` — run detached or wait for completion
- `--resume` / `--fresh` — continue previous thread or force a new one
- `--model flash|pro|<model-id>` — model selection
- `--effort none|minimal|low|medium|high|xhigh` — maps effort levels to model selection
- `--depth low|medium|high` — analysis depth (low → flash, high → pro with expanded context)
- `--thinking` / `--thinking-budget <tokens>` — extended reasoning mode
- `--image <path>` — multimodal input (PNG, JPEG, WEBP, GIF, BMP)
- `--cwd <dir>` — alternate working directory
- `--prompt-file <path>` — load prompt from file
- `--base <ref>` / `--scope auto|working-tree|branch` — diff targeting for review commands
- `--wait` + `--timeout-ms` + `--poll-interval-ms` — polling loop for `/gemini:status`
- `--json` — machine-readable output for `/gemini:result` and `/gemini:status`

**Architecture**
- Background job pattern: detached worker process with job state JSON files
- `@google/genai` SDK singleton (no CLI spawn overhead) with automatic CLI fallback
- Schema validation of review JSON output — invalid responses return explicit `ERROR:` with retry instructions
- Action hints in all command output — Claude always knows the next step without inference
- Session-scoped job tracking via `GEMINI_COMPANION_SESSION_ID`
- Stop review gate: blocks Claude response until Gemini approves (opt-in via `/gemini:setup --enable-review-gate`)
- Modular architecture: `scripts/lib/` with 10 focused modules

**Test suite**
- 71 tests across 9 files using Node.js built-in test runner (`node --test`)
- CI/CD: GitHub Actions matrix (Node 18, 20, 22)

**SDK mode**
- Direct Gemini API via `@google/genai` v1.48 when `GOOGLE_API_KEY` is set
- `/gemini:setup` reports `sessionRuntime.mode: "sdk"` or `"direct"`
