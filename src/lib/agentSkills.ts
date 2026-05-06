export type AgentSkillTrustTier = "verified" | "reviewed" | "community" | "local";
export type AgentSkillStatus = "candidate" | "approved" | "blocked";

export interface AgentSkillRegistry {
  id: string;
  name: string;
  url: string;
  notes: string;
  trustModel: string;
}

export interface AgentSkillRisk {
  level: "low" | "medium" | "high";
  reason: string;
}

export interface AgentSkillCandidate {
  id: string;
  name: string;
  sourceUrl: string;
  registry: string;
  trustTier: AgentSkillTrustTier;
  status: AgentSkillStatus;
  description: string;
  skillMd: string;
  createdAt: number;
  updatedAt: number;
  risks: AgentSkillRisk[];
  notes: string;
}

export interface AgentSkillStore {
  skills: AgentSkillCandidate[];
}

export const AGENT_SKILL_REGISTRIES: AgentSkillRegistry[] = [
  {
    id: "skillsgate",
    name: "SkillsGate",
    url: "https://skillsgate.ai/",
    notes: "Open marketplace for SKILL.md-style agent skills with repository references.",
    trustModel: "Treat as community metadata until a source repo and skill file are reviewed.",
  },
  {
    id: "skillsmd",
    name: "SkillsMD",
    url: "https://skillsmd.dev/",
    notes: "Open agent skills registry focused on reusable coding-agent skills.",
    trustModel: "Import metadata first; approve only after source review.",
  },
  {
    id: "open-agent-skills",
    name: "Open Agent Skills",
    url: "https://openagentskills.dev/",
    notes: "Open-source platform for discovering and sharing reusable Agent Skills.",
    trustModel: "Use as discovery input, not as an automatic installer.",
  },
  {
    id: "askill",
    name: "askill",
    url: "https://askill.sh/",
    notes: "Package-manager style registry that targets multiple coding agents.",
    trustModel: "Prefer verified/reviewed entries and pin source URLs.",
  },
  {
    id: "invoked",
    name: "Invoked",
    url: "https://invoked.sh/",
    notes: "Large skill discovery registry; useful for breadth and category search.",
    trustModel: "Community-scale registry; scan and sandbox before use.",
  },
  {
    id: "skilldex",
    name: "Skilldex / skillpm",
    url: "https://arxiv.org/abs/2604.16911",
    notes: "Recent registry/package-manager architecture with scoring and MCP concepts.",
    trustModel: "Good architecture target for future compatibility and scoring.",
  },
];

const HIGH_RISK_PATTERNS = [
  /curl\s+[^|]+\|\s*(bash|sh|pwsh|powershell)/i,
  /Invoke-Expression|iex\b/i,
  /rm\s+-rf|Remove-Item\s+.*-Recurse/i,
  /token|api[_-]?key|password|secret/i,
  /http[s]?:\/\/[^\s)]+/i,
];

export function scanAgentSkill(skillMd: string): AgentSkillRisk[] {
  const risks: AgentSkillRisk[] = [];
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(skillMd)) {
      risks.push({
        level: pattern.source.includes("token") ? "medium" : "high",
        reason: `Matched review pattern: ${pattern.source}`,
      });
    }
  }
  if (!skillMd.trim()) {
    risks.push({ level: "medium", reason: "No SKILL.md content supplied yet; source must be reviewed before approval." });
  }
  return risks.length ? risks : [{ level: "low", reason: "No obvious high-risk patterns in supplied metadata." }];
}
