# Gemini Plugin — Claude Code

Plugin que integra o Gemini CLI ao Claude Code. Referencia: plugin Codex (`~/.claude/plugins/cache/openai-codex/codex/`).

## Build & Test

- Nao ha build step. O plugin roda direto via Node.js (ESM).
- Apos modificar `gemini-companion.mjs`, valide com: `/gemini:setup`, `/gemini:review --wait`, `/gemini:status`.

## Code style

- ESM puro. IMPORTANT: nunca use `require`/`module.exports`.
- camelCase para funcoes/variaveis. UPPER_SNAKE_CASE para constantes.
- Args parseados manualmente em `parseArgs()` — nao introduza libs de CLI.

## Restricoes criticas

- IMPORTANT: zero dependencias npm. Apenas modulos built-in do Node (fs, path, child_process, crypto).
- IMPORTANT: `gemini-companion.mjs` e monolitico por design. Nao separe em arquivos sem instrucao explicita.
- IMPORTANT: ao mudar o output de review, atualize AMBOS — `schemas/review-output.schema.json` E `prompts/adversarial-review.md`.
- Ao mudar o schema de jobs, incremente `STATE_VERSION` no companion script.
- Nao aumente timeouts dos hooks (5s start / 10s end) sem justificativa.

## Workflow

- Ao adicionar/modificar flags, atualize o `.md` correspondente em `commands/`.
- Ao adicionar features, atualize `CHANGELOG.md` no formato existente.
- Output do Gemini deve ser apresentado verbatim — nunca parafrasear.
- Nunca auto-corrija findings de review. Apresente e pergunte ao usuario.
- Consulte o plugin Codex como referencia para paridade de features.
