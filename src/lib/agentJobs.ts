export type AgentJobKind = "deep-research" | "browser-use" | "coding" | "computer-use";

export type AgentJobStatus =
  | "pending-approval"
  | "approved"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentJobAuditEntry {
  id: string;
  at: number;
  actor: "user" | "sophia" | "system";
  action: string;
  note: string;
}

export interface AgentJob {
  id: string;
  kind: AgentJobKind;
  status: AgentJobStatus;
  title: string;
  prompt: string;
  requestedBy: "local" | "telegram" | "system";
  createdAt: number;
  updatedAt: number;
  approvalRequired: boolean;
  approvalMode: string;
  workspaceRoot: string;
  allowedDomains: string[];
  blockedPaths: string[];
  provider: string;
  providerBaseUrl: string;
  preferFreeModels: boolean;
  executionPlan: string[];
  artifacts: Array<{ label: string; value: string }>;
  audit: AgentJobAuditEntry[];
  result?: string;
  error?: string;
}

export interface AgentJobStore {
  jobs: AgentJob[];
}

export interface CreateAgentJobPayload {
  kind?: AgentJobKind;
  title?: string;
  prompt?: string;
  requestedBy?: "local" | "telegram" | "system";
  settings?: {
    approvalMode?: string;
    workspaceRoot?: string;
    allowedDomains?: string;
    blockedPaths?: string;
    codingProvider?: string;
    providerBaseUrl?: string;
    preferFreeModels?: boolean;
  };
}

export const AGENT_JOB_KIND_LABELS: Record<AgentJobKind, string> = {
  "deep-research": "Deep Research",
  "browser-use": "Browser Use",
  coding: "Local Coding",
  "computer-use": "Computer Use",
};

export function normalizeAgentJobKind(value: unknown): AgentJobKind {
  return value === "browser-use" || value === "coding" || value === "computer-use"
    ? value
    : "deep-research";
}
