import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_REMOTE_DOMAINS,
  type PublicUserProfile,
  type StoredUserProfile,
  type UserAuthProvider,
  type UserProfileStore,
  normalizeAuthProviders,
  normalizeAccessModes,
  normalizeProfileRole,
} from "@/lib/userProfiles";

export const runtime = "nodejs";

const STORE_PATH = path.join(process.cwd(), ".uvb", "user-profiles.json");
const PASSWORD_ITERATIONS = 210_000;

function generateId() {
  return `profile:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function splitDomains(value: unknown) {
  const domains = safeText(value)
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return domains.length ? domains : DEFAULT_REMOTE_DOMAINS;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("hex");
  return { hash, salt, iterations: PASSWORD_ITERATIONS };
}

function publicProfile(profile: StoredUserProfile): PublicUserProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    username: profile.username,
    email: profile.email,
    role: profile.role,
    telegramChatId: profile.telegramChatId,
    remoteDomains: profile.remoteDomains,
    accessModes: profile.accessModes,
    authProviders: profile.authProviders,
    googleSubject: profile.googleSubject,
    passkeyCredentialCount: profile.passkeyCredentialIds.length,
    passwordConfigured: Boolean(profile.passwordHash),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    notes: profile.notes,
  };
}

function normalizeStoredProfile(profile: Partial<StoredUserProfile>): StoredUserProfile {
  const now = Date.now();
  return {
    id: safeText(profile.id, generateId()),
    displayName: safeText(profile.displayName, "UVB User"),
    username: safeText(profile.username, safeText(profile.email, "uvb-user")).toLowerCase(),
    email: safeText(profile.email),
    role: normalizeProfileRole(profile.role),
    telegramChatId: safeText(profile.telegramChatId),
    remoteDomains: Array.isArray(profile.remoteDomains) && profile.remoteDomains.length
      ? profile.remoteDomains.map((item) => safeText(item)).filter(Boolean)
      : DEFAULT_REMOTE_DOMAINS,
    accessModes: normalizeAccessModes(profile.accessModes),
    authProviders: normalizeAuthProviders(profile.authProviders),
    googleSubject: safeText(profile.googleSubject),
    passkeyCredentialIds: Array.isArray(profile.passkeyCredentialIds)
      ? profile.passkeyCredentialIds.map((item) => safeText(item)).filter(Boolean)
      : [],
    passkeyCredentialCount: Array.isArray(profile.passkeyCredentialIds) ? profile.passkeyCredentialIds.length : 0,
    passwordConfigured: Boolean(profile.passwordHash),
    passwordHash: safeText(profile.passwordHash),
    passwordSalt: safeText(profile.passwordSalt),
    passwordIterations: typeof profile.passwordIterations === "number" ? profile.passwordIterations : PASSWORD_ITERATIONS,
    createdAt: typeof profile.createdAt === "number" ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : now,
    notes: safeText(profile.notes),
  };
}

async function readStore(): Promise<UserProfileStore> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as Partial<UserProfileStore>;
    return {
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles.map(normalizeStoredProfile) : [],
    };
  } catch {
    return { profiles: [] };
  }
}

async function writeStore(store: UserProfileStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ profiles: store.profiles.map(publicProfile) });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    action?: unknown;
    displayName?: unknown;
    username?: unknown;
    email?: unknown;
    role?: unknown;
    telegramChatId?: unknown;
    remoteDomains?: unknown;
    accessModes?: unknown;
    authProviders?: unknown;
    googleSubject?: unknown;
    passkeyCredentialIds?: unknown;
    password?: unknown;
    notes?: unknown;
  };
  const action = safeText(payload.action, "upsert");
  const store = await readStore();
  const id = safeText(payload.id);

  if (action === "delete") {
    const nextProfiles = store.profiles.filter((profile) => profile.id !== id);
    await writeStore({ profiles: nextProfiles });
    return NextResponse.json({ ok: true, profiles: nextProfiles.map(publicProfile) });
  }

  if (action !== "upsert") {
    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  }

  const now = Date.now();
  const existing = id ? store.profiles.find((profile) => profile.id === id) : undefined;
  const password = safeText(payload.password);
  const passwordUpdate = password ? hashPassword(password) : null;
  const profile = normalizeStoredProfile({
    ...existing,
    id: existing?.id ?? generateId(),
    displayName: safeText(payload.displayName),
    username: safeText(payload.username),
    email: safeText(payload.email),
    role: normalizeProfileRole(payload.role),
    telegramChatId: safeText(payload.telegramChatId),
    remoteDomains: splitDomains(payload.remoteDomains),
    accessModes: normalizeAccessModes(payload.accessModes),
    authProviders: normalizeAuthProviders(payload.authProviders),
    googleSubject: safeText(payload.googleSubject),
    passkeyCredentialIds: Array.isArray(payload.passkeyCredentialIds)
      ? payload.passkeyCredentialIds.map((item) => safeText(item)).filter(Boolean)
      : existing?.passkeyCredentialIds,
    notes: safeText(payload.notes),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    passwordHash: passwordUpdate?.hash ?? existing?.passwordHash ?? "",
    passwordSalt: passwordUpdate?.salt ?? existing?.passwordSalt ?? "",
    passwordIterations: passwordUpdate?.iterations ?? existing?.passwordIterations ?? PASSWORD_ITERATIONS,
  });

  if (!profile.email || !profile.username) {
    return NextResponse.json({ error: "username and email are required." }, { status: 400 });
  }

  const withoutCurrent = store.profiles.filter((item) => item.id !== profile.id);
  if (
    withoutCurrent.some(
      (item) => item.email.toLowerCase() === profile.email.toLowerCase() || item.username === profile.username
    )
  ) {
    return NextResponse.json({ error: "username or email already exists." }, { status: 409 });
  }

  const profiles = [profile, ...withoutCurrent].sort((a, b) => b.updatedAt - a.updatedAt);
  await writeStore({ profiles });
  return NextResponse.json({ ok: true, profile: publicProfile(profile), profiles: profiles.map(publicProfile) });
}
