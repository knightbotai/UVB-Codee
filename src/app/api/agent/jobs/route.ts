import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_JOB_KIND_LABELS,
  type AgentJob,
  type AgentJobAuditEntry,
  type AgentJobKind,
  type AgentJobStatus,
  type AgentJobStore,
  type CreateAgentJobPayload,
  normalizeAgentJobKind,
} from "@/lib/agentJobs";

export const runtime = "nodejs";

const STORE_PATH = path.join(process.cwd(), ".uvb", "agent-jobs.json");
const MAX_JOBS = 200;

function generateId(prefix = "job") {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function splitList(value: unknown) {
  return safeText(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeStatus(value: unknown): AgentJobStatus {
  return value === "approved" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled"
    ? value
    : "pending-approval";
}

function audit(action: string, note: string, actor: AgentJobAuditEntry["actor"] = "system"): AgentJobAuditEntry {
  return {
    id: generateId("audit"),
    at: Date.now(),
    actor,
    action,
    note,
  };
}

function buildExecutionPlan(kind: AgentJobKind) {
  if (kind === "deep-research") {
    return [
      "Confirm scope, success criteria, and freshness requirements.",
      "Open a supervised browser/research session restricted to allowed domains unless the user approves expansion.",
      "Collect source URLs, dates, direct evidence, and contradictions.",
      "Summarize findings with citations, confidence notes, and follow-up questions.",
      "Save the research trail into the job audit and optionally into Memory Bank.",
    ];
  }
  if (kind === "browser-use") {
    return [
      "Open a supervised Playwright/browser-use session.",
      "Capture screenshots or page snapshots before high-impact actions.",
      "Perform navigation/form actions inside the approved domain scope.",
      "Pause for approval before login, purchase, deletion, posting, or data export actions.",
      "Attach final screenshots/results to the job record.",
    ];
  }
  if (kind === "coding") {
    return [
      "Inspect the approved workspace and relevant files.",
      "Produce a scoped patch plan and command checklist.",
      "Apply edits only inside workspaceRoot and outside blocked paths.",
      "Run focused checks, collect failures, and preserve diffs for review.",
      "Stage/commit/push only when git permission and approval mode allow it.",
    ];
  }
  return [
    "Start in read-only observation mode.",
    "Capture current app/window state before interaction.",
    "Require explicit approval for OS-level clicks, typing, file movement, or shell launch.",
    "Record every action in the audit trail.",
    "Return control immediately on user interrupt.",
  ];
}

function normalizeJob(job: Partial<AgentJob>): AgentJob {
  const kind = normalizeAgentJobKind(job.kind);
  const now = Date.now();
  const prompt = safeText(job.prompt);
  const title = safeText(job.title, prompt.slice(0, 80) || AGENT_JOB_KIND_LABELS[kind]);
  return {
    id: safeText(job.id, generateId()),
    kind,
    status: safeStatus(job.status),
    title,
    prompt,
    requestedBy: job.requestedBy === "telegram" || job.requestedBy === "system" ? job.requestedBy : "local",
    createdAt: typeof job.createdAt === "number" ? job.createdAt : now,
    updatedAt: typeof job.updatedAt === "number" ? job.updatedAt : now,
    approvalRequired: typeof job.approvalRequired === "boolean" ? job.approvalRequired : true,
    approvalMode: safeText(job.approvalMode, "ask-every-time"),
    workspaceRoot: safeText(job.workspaceRoot, "D:\\UVB-KnightBot-Export"),
    allowedDomains: Array.isArray(job.allowedDomains) ? job.allowedDomains.map((item) => safeText(item)).filter(Boolean) : [],
    blockedPaths: Array.isArray(job.blockedPaths) ? job.blockedPaths.map((item) => safeText(item)).filter(Boolean) : [],
    provider: safeText(job.provider, "local-uvb"),
    providerBaseUrl: safeText(job.providerBaseUrl),
    preferFreeModels: typeof job.preferFreeModels === "boolean" ? job.preferFreeModels : true,
    executionPlan: Array.isArray(job.executionPlan) && job.executionPlan.length ? job.executionPlan.map(String) : buildExecutionPlan(kind),
    artifacts: Array.isArray(job.artifacts) ? job.artifacts : [],
    audit: Array.isArray(job.audit) ? job.audit : [audit("created", "Job record created.")],
    result: safeText(job.result),
    error: safeText(job.error),
  };
}

async function readStore(): Promise<AgentJobStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<AgentJobStore>;
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map(normalizeJob) : [],
    };
  } catch {
    return { jobs: [] };
  }
}

async function writeStore(store: AgentJobStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  const trimmed = {
    jobs: store.jobs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_JOBS),
  };
  await writeFile(STORE_PATH, JSON.stringify(trimmed, null, 2), "utf8");
}

function createJob(payload: CreateAgentJobPayload): AgentJob {
  const kind = normalizeAgentJobKind(payload.kind);
  const prompt = safeText(payload.prompt);
  const settings = payload.settings ?? {};
  const approvalMode = safeText(settings.approvalMode, "ask-every-time");
  const approvalRequired = approvalMode !== "trusted-local";
  const now = Date.now();

  return normalizeJob({
    id: generateId(),
    kind,
    status: approvalRequired ? "pending-approval" : "approved",
    title: safeText(payload.title, prompt.slice(0, 80) || AGENT_JOB_KIND_LABELS[kind]),
    prompt,
    requestedBy: payload.requestedBy,
    createdAt: now,
    updatedAt: now,
    approvalRequired,
    approvalMode,
    workspaceRoot: safeText(settings.workspaceRoot, "D:\\UVB-KnightBot-Export"),
    allowedDomains: splitList(settings.allowedDomains),
    blockedPaths: splitList(settings.blockedPaths),
    provider: safeText(settings.codingProvider, "local-uvb"),
    providerBaseUrl: safeText(settings.providerBaseUrl),
    preferFreeModels: settings.preferFreeModels !== false,
    executionPlan: buildExecutionPlan(kind),
    artifacts: [
      { label: "Execution", value: "Queued for supervised local runner." },
      { label: "Safety", value: approvalRequired ? "Requires approval before execution." : "Trusted local mode." },
    ],
    audit: [
      audit(
        approvalRequired ? "queued" : "approved",
        approvalRequired
          ? "Job queued and waiting for user approval."
          : "Job queued in trusted local mode.",
        payload.requestedBy === "telegram" ? "sophia" : "user"
      ),
    ],
  });
}

export async function GET() {
  return NextResponse.json(await readStore());
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as CreateAgentJobPayload & {
    action?: unknown;
    id?: unknown;
    note?: unknown;
    result?: unknown;
    error?: unknown;
  };
  const store = await readStore();
  const action = safeText(payload.action, "create");

  if (action === "create") {
    const job = createJob(payload);
    if (!job.prompt) {
      return NextResponse.json({ error: "prompt is required." }, { status: 400 });
    }
    store.jobs.unshift(job);
    await writeStore(store);
    return NextResponse.json({ ok: true, job });
  }

  const id = safeText(payload.id);
  const job = store.jobs.find((item) => item.id === id);
  if (!job) return NextResponse.json({ error: "job not found." }, { status: 404 });

  if (action === "delete") {
    const jobs = store.jobs.filter((item) => item.id !== id);
    await writeStore({ jobs });
    return NextResponse.json({ ok: true, jobs });
  }

  if (action === "approve") {
    job.status = "approved";
    job.updatedAt = Date.now();
    job.audit.unshift(audit("approved", safeText(payload.note, "Approved for runner execution."), "user"));
  } else if (action === "cancel") {
    job.status = "cancelled";
    job.updatedAt = Date.now();
    job.audit.unshift(audit("cancelled", safeText(payload.note, "Cancelled by user."), "user"));
  } else if (action === "complete") {
    job.status = "completed";
    job.result = safeText(payload.result, "Completed.");
    job.updatedAt = Date.now();
    job.audit.unshift(audit("completed", job.result, "system"));
  } else if (action === "fail") {
    job.status = "failed";
    job.error = safeText(payload.error, "Job failed.");
    job.updatedAt = Date.now();
    job.audit.unshift(audit("failed", job.error, "system"));
  } else {
    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  }

  await writeStore(store);
  return NextResponse.json({ ok: true, job });
}
