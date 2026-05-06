import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_SKILL_REGISTRIES,
  type AgentSkillCandidate,
  type AgentSkillStatus,
  type AgentSkillStore,
  type AgentSkillTrustTier,
  scanAgentSkill,
} from "@/lib/agentSkills";

export const runtime = "nodejs";

const STORE_PATH = path.join(process.cwd(), ".uvb", "agent-skills.json");
const MAX_SKILLS = 500;

function generateId() {
  return `skill:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeTrustTier(value: unknown): AgentSkillTrustTier {
  return value === "verified" || value === "reviewed" || value === "local" ? value : "community";
}

function safeStatus(value: unknown): AgentSkillStatus {
  return value === "approved" || value === "blocked" ? value : "candidate";
}

function normalizeSkill(skill: Partial<AgentSkillCandidate>): AgentSkillCandidate {
  const skillMd = safeText(skill.skillMd);
  const risks = Array.isArray(skill.risks) && skill.risks.length ? skill.risks : scanAgentSkill(skillMd);
  const now = Date.now();
  return {
    id: safeText(skill.id, generateId()),
    name: safeText(skill.name, "Unnamed Skill"),
    sourceUrl: safeText(skill.sourceUrl),
    registry: safeText(skill.registry, "manual"),
    trustTier: safeTrustTier(skill.trustTier),
    status: safeStatus(skill.status),
    description: safeText(skill.description),
    skillMd,
    createdAt: typeof skill.createdAt === "number" ? skill.createdAt : now,
    updatedAt: typeof skill.updatedAt === "number" ? skill.updatedAt : now,
    risks,
    notes: safeText(skill.notes),
  };
}

async function readStore(): Promise<AgentSkillStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<AgentSkillStore>;
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.map(normalizeSkill) : [],
    };
  } catch {
    return { skills: [] };
  }
}

async function writeStore(store: AgentSkillStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(
    STORE_PATH,
    JSON.stringify({ skills: store.skills.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SKILLS) }, null, 2),
    "utf8"
  );
}

function validateSourceUrl(sourceUrl: string) {
  if (!sourceUrl) return;
  const parsed = new URL(sourceUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Skill source URL must use http or https.");
  }
}

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    registries: AGENT_SKILL_REGISTRIES,
    skills: store.skills,
  });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as Partial<AgentSkillCandidate> & {
    action?: unknown;
  };
  const action = safeText(payload.action, "import");
  const store = await readStore();

  if (action === "import") {
    const sourceUrl = safeText(payload.sourceUrl);
    try {
      validateSourceUrl(sourceUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid source URL.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const skill = normalizeSkill({
      ...payload,
      id: generateId(),
      sourceUrl,
      status: "candidate",
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });
    store.skills.unshift(skill);
    await writeStore(store);
    return NextResponse.json({ ok: true, skill });
  }

  const id = safeText(payload.id);
  const skill = store.skills.find((item) => item.id === id);
  if (!skill) return NextResponse.json({ error: "skill not found." }, { status: 404 });

  if (action === "approve" || action === "block") {
    skill.status = action === "approve" ? "approved" : "blocked";
    skill.updatedAt = Date.now();
    skill.notes = safeText(payload.notes, skill.notes);
    await writeStore(store);
    return NextResponse.json({ ok: true, skill });
  }

  return NextResponse.json({ error: "unknown action." }, { status: 400 });
}
