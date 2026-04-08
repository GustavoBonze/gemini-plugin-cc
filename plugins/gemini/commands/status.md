---
description: Show active and recent Gemini jobs for this repository
argument-hint: '[job-id] [--wait] [--timeout-ms <ms>] [--poll-interval-ms <ms>] [--all] [--json]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/gemini-companion.mjs" status $ARGUMENTS`

Present the full command output verbatim. Do not summarize, reformat, or add commentary.
