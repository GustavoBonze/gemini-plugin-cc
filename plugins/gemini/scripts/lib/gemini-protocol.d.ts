export type JobStatus = "running" | "completed" | "failed" | "cancelled" | "queued";
export type JobKind = "review" | "adversarial" | "task" | "rescue";
export type Severity = "critical" | "high" | "medium" | "low";
export type Verdict = "approve" | "needs-attention";
export type ArtifactKind = "patch" | "config" | "script" | "note";
export type EffortLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface Job {
  id: string;
  kind: JobKind;
  kindLabel: string;
  jobClass: "review" | "task";
  title: string | null;
  request: string | null;
  write: boolean;
  status: JobStatus;
  phase: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt: string | null;
  workspace: string;
  logFile: string;
  pid: number | null;
  sessionId: string | null;
  summary: string | null;
  rendered: string | null;
  exitCode: number | null;
  geminiArgs?: string[];
  effort?: EffortLevel;
  thinkingBudget?: number | null;
}

export interface Finding {
  severity: Severity;
  file: string;
  line_start?: number;
  line_end?: number;
  title: string;
  body: string;
  recommendation: string;
  confidence?: number;
}

export interface Artifact {
  kind: ArtifactKind;
  title: string;
  content: string;
}

export interface ReviewOutput {
  verdict: Verdict;
  summary: string;
  findings: Finding[];
  next_steps: string[];
  artifacts?: Artifact[];
}

export interface SetupResult {
  ready: boolean;
  node: { available: boolean; detail: string };
  npm: { available: boolean; detail?: string };
  gemini: { available: boolean; detail: string };
  auth: { loggedIn: boolean; detail: string };
  sessionRuntime: {
    mode: "direct" | "sdk" | "shared";
    label: string;
    detail: string;
    endpoint: string | null;
  };
  reviewGateEnabled: boolean;
  actionsTaken: string[];
  nextSteps: string[];
}

export interface GeminiRunResult {
  response: string;
  sessionId: string | null;
  reasoningSummary: string | null;
}

export interface ReviewContext {
  targetLabel: string;
  status: string;
  diff: string;
  untrackedContent: string;
  diffStat: string;
  commits: string;
  branch: string;
}
