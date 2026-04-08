const SEVERITY_ORDER = ["critical", "high", "medium", "low"];
const SEVERITY_ICONS = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };

const REQUIRED_REVIEW_FIELDS = ["verdict", "summary", "findings", "next_steps"];
const VALID_VERDICTS = new Set(["approve", "needs-attention"]);

export function renderReviewOutput(raw, kind = "review", { reasoningSummary = null } = {}) {
  try {
    const jsonMatch = (raw || "").match(/\{[\s\S]*\}/);
    const data = JSON.parse(jsonMatch ? jsonMatch[0] : raw);

    const missing = REQUIRED_REVIEW_FIELDS.filter(f => !(f in data));
    if (missing.length > 0) {
      return `ERROR: Gemini returned an invalid review structure. Missing required fields: ${missing.join(", ")}.\nAction: retry the review with /gemini:review, or check that Gemini is returning valid JSON.\nRaw output:\n${raw ?? "(empty)"}`;
    }
    if (!VALID_VERDICTS.has(data.verdict)) {
      return `ERROR: Gemini returned an unrecognized verdict: "${data.verdict}". Expected "approve" or "needs-attention".\nAction: retry the review with /gemini:review.\nRaw output:\n${raw ?? "(empty)"}`;
    }
    if (!Array.isArray(data.findings)) {
      return `ERROR: Gemini review "findings" field is not an array.\nAction: retry the review with /gemini:review.\nRaw output:\n${raw ?? "(empty)"}`;
    }

    const verdict = data.verdict === "approve" ? "✅ APPROVE" : "⚠️  NEEDS ATTENTION";
    const lines = [
      `## Gemini ${kind === "adversarial" ? "Adversarial " : ""}Review`,
      `**Verdict:** ${verdict}`,
      `**Summary:** ${data.summary}`,
      "",
    ];

    if (data.findings?.length > 0) {
      const sorted = [...data.findings].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      );
      lines.push("### Findings");
      for (const f of sorted) {
        const icon = SEVERITY_ICONS[f.severity] ?? "⚪";
        lines.push(`\n${icon} **[${f.severity.toUpperCase()}]** ${f.title}`);
        if (f.file) lines.push(`- **File:** \`${f.file}\`${f.line_start ? ` (lines ${f.line_start}–${f.line_end ?? f.line_start})` : ""}`);
        if (f.body) lines.push(`- ${f.body}`);
        if (f.recommendation) lines.push(`- **Fix:** ${f.recommendation}`);
        if (f.confidence != null) lines.push(`- **Confidence:** ${Math.round(f.confidence * 100)}%`);
      }
    } else {
      lines.push("No findings. The change looks clean.");
    }

    if (data.next_steps?.length > 0) {
      lines.push("\n### Next Steps");
      for (const s of data.next_steps) lines.push(`- ${s}`);
    }

    if (data.artifacts?.length > 0) {
      lines.push("\n### Artifacts");
      for (const a of data.artifacts) {
        const fence = a.kind === "patch" ? "diff" : a.kind === "script" ? "bash" : "";
        lines.push(`\n**${a.title}** *(${a.kind})*`);
        lines.push(`\`\`\`${fence}\n${a.content}\n\`\`\``);
      }
    }

    if (reasoningSummary) {
      lines.push("\n### Reasoning");
      lines.push(reasoningSummary);
    }

    return lines.join("\n");
  } catch {
    return raw ?? "(no output)";
  }
}

export function renderJobStatus(job, { showPreview = true, logPreview = "" } = {}) {
  const statusIcon = { running: "⏳", completed: "✅", failed: "❌", cancelled: "🚫" }[job.status] ?? "❓";
  const lines = [
    `${statusIcon} **${job.kindLabel ?? job.kind}** \`${job.id}\``,
    `   Status: ${job.status}  Phase: ${job.phase ?? "-"}`,
  ];
  if (job.summary) lines.push(`   Summary: ${job.summary}`);
  if (showPreview && logPreview) lines.push(`   Progress:\n${logPreview.split("\n").map(l => `     ${l}`).join("\n")}`);
  return lines.join("\n");
}

export function renderJobList(jobs) {
  if (!jobs.length) return "No recent Gemini jobs for this repository.";
  return jobs.map(j => renderJobStatus(j, { showPreview: false })).join("\n\n");
}

export function renderSetupOutput(data) {
  const ok = v => (v ? "✓" : "✗");
  const lines = [
    "Gemini Plugin Status",
    "─".repeat(50),
    `Node.js:       ${ok(data.node.available)} ${data.node.detail}`,
    `npm:           ${ok(data.npm.available)} ${data.npm.detail ?? "not found"}`,
    `Gemini CLI:    ${ok(data.gemini.available)} ${data.gemini.detail}`,
    `Auth:          ${ok(data.auth.loggedIn)} ${data.auth.detail}`,
    `Runtime:       ${data.sessionRuntime.label}`,
    `Review gate:   ${data.reviewGateEnabled ? "enabled" : "disabled"}`,
    "─".repeat(50),
  ];
  if (data.nextSteps?.length > 0) {
    lines.push("\nNext steps:");
    for (const s of data.nextSteps) lines.push(`  • ${s}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Dashboard table renderer
// ---------------------------------------------------------------------------

function truncate(str, width) {
  const s = String(str ?? "");
  return s.length <= width ? s : s.slice(0, width - 1) + "…";
}

function pad(value, width, align = "left") {
  const s = String(value ?? "");
  if (s.length >= width) return s;
  const gap = " ".repeat(width - s.length);
  return align === "right" ? gap + s : s + gap;
}

function makeBorder(left, mid, right, widths) {
  return left + widths.map(w => "─".repeat(w + 2)).join(mid) + right;
}

export function renderJobTable(jobs) {
  if (!jobs.length) return "No recent Gemini jobs for this repository.";

  const rows = jobs.map(job => {
    const duration = job.completedAt && job.startedAt
      ? `${Math.round((new Date(job.completedAt) - new Date(job.startedAt)) / 1000)}s`
      : job.status === "running" && job.startedAt
        ? `${Math.round((Date.now() - new Date(job.startedAt)) / 1000)}s…`
        : "-";
    return {
      id:     truncate(job.id?.replace("job-", "") ?? "-", 21),
      kind:   truncate(job.kindLabel ?? job.kind ?? "-", 12),
      status: truncate(job.status ?? "-", 9),
      phase:  truncate(job.phase ?? "-", 11),
      dur:    truncate(duration, 7),
      info:   truncate(job.title ?? job.summary ?? job.request ?? "-", 44),
    };
  });

  const headers = { id: "Job ID", kind: "Kind", status: "Status", phase: "Phase", dur: "Dur", info: "Title/Summary" };
  const cols = ["id", "kind", "status", "phase", "dur", "info"];
  const widths = cols.map(col => Math.max(headers[col].length, ...rows.map(r => String(r[col]).length)));

  const renderRow = row =>
    "│ " + cols.map((col, i) => pad(row[col], widths[i], col === "dur" ? "right" : "left")).join(" │ ") + " │";

  return [
    makeBorder("┌", "┬", "┐", widths),
    renderRow(headers),
    makeBorder("├", "┼", "┤", widths),
    ...rows.map(renderRow),
    makeBorder("└", "┴", "┘", widths),
  ].join("\n");
}

export function extractJobSummary(response, kind) {
  if (kind === "review" || kind === "adversarial") {
    try {
      const jsonStr = (response || "").match(/\{[\s\S]*\}/)?.[0] || response;
      const data = JSON.parse(jsonStr);
      if (data.findings?.length > 0) return `${data.verdict}: ${data.findings[0].title}`.slice(0, 80);
      return `${data.verdict}: ${(data.summary || "").slice(0, 60)}`;
    } catch {}
  }
  const line = (response || "").split("\n").find(l => l.trim().length > 3) ?? "";
  return line.trim().slice(0, 80);
}
