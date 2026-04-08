export function buildDepthInstructions(depth) {
  if (depth === "high") {
    return `\n<deep_analysis>\nHigh-depth review: trace every modified code path to callers and callees. Check second-order failures, rollback paths, retry logic, race conditions, and resource leaks. Challenge architectural decisions, not just implementation.\n</deep_analysis>`;
  }
  if (depth === "low") {
    return `\n<quick_scan>\nQuick surface scan: report only critical and high severity issues. Skip medium and low findings. Keep the response compact.\n</quick_scan>`;
  }
  return "";
}

export function buildReviewPrompt(context, { adversarial = false, focus = "", depth = "medium", adversarialTemplate = null } = {}) {
  const depthInstructions = buildDepthInstructions(depth);
  const repoContext = [
    `BRANCH: ${context.branch}`,
    "",
    "STATUS:",
    context.status || "(clean)",
    "",
    "DIFF STAT:",
    context.diffStat || "(no stat)",
    "",
    "RECENT COMMITS:",
    context.commits || "(none)",
    "",
    "DIFF:",
    context.diff || "(no diff — check status above for untracked files)",
    context.untrackedContent ? "\nUNTRACKED FILES:" + context.untrackedContent : "",
  ].join("\n");

  if (adversarial) {
    if (adversarialTemplate) {
      return adversarialTemplate
        .replace("{{TARGET_LABEL}}", context.targetLabel)
        .replace("{{USER_FOCUS}}", focus || "(none provided)")
        .replace("{{REVIEW_INPUT}}", repoContext);
    }
    return `Adversarial review of: ${context.targetLabel}\nFocus: ${focus || "general"}\n\n${repoContext}`;
  }

  return `<role>
You are Gemini performing a thorough software code review. Identify real issues: bugs, security problems, performance issues, and maintainability concerns. Use your large context window to read all provided code carefully and trace execution paths.
</role>

<task>
Review the provided repository changes.
Target: ${context.targetLabel}
</task>

<review_method>
Actively trace code paths. Look for:
- Bugs: null dereferences, off-by-one errors, wrong logic
- Security: injection, auth bypass, data exposure
- Performance: N+1 queries, unnecessary allocations
- Reliability: missing error handling, race conditions
- Maintainability: unclear logic that will cause future bugs

Do not scan passively — reason about what happens at edge cases.
</review_method>

<finding_bar>
Report only substantive findings. No style nitpicks or speculative concerns.
A finding must answer: what is wrong, why it matters, what the concrete fix is.
</finding_bar>
${depthInstructions}

<structured_output_contract>
Return only valid JSON matching this schema:
{
  "verdict": "approve" | "needs-attention",
  "summary": "one or two sentence assessment",
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "file": "path/to/file.ext",
      "line_start": 10,
      "line_end": 20,
      "title": "short finding title",
      "body": "detailed explanation",
      "recommendation": "concrete fix",
      "confidence": 0.9
    }
  ],
  "next_steps": ["prioritized action items"],
  "artifacts": [
    { "kind": "patch" | "config" | "script" | "note", "title": "title", "content": "content" }
  ]
}
next_steps must always be present (empty array if none).
</structured_output_contract>

<repository_context>
${repoContext}
</repository_context>`;
}

export function buildTaskResumePrompt(basePrompt, previousOutput) {
  return `${basePrompt}\n\n<previous_output>\n${previousOutput}\n</previous_output>\n\nContinue from where you left off.`;
}
