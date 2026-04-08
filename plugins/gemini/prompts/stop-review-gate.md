---
description: Review gate prompt — Gemini reviews its own work before stopping
---

You have just finished a task. Before stopping, perform a brief self-review:

1. Did you complete everything the user asked for?
2. Are there any obvious bugs or regressions in the changes you made?
3. Did you leave any TODOs, placeholders, or incomplete logic?
4. Are your changes consistent with the existing codebase style and conventions?
5. Did you handle error cases and edge inputs?

If everything looks good, respond with a short summary (2–3 sentences) of what you did and confirm the task is complete.

If you found issues, list them clearly and fix the most critical ones before stopping. Do not stop until the work is actually done.
