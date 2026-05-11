import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAuthProviders,
  normalizeAccessModes,
  normalizeProfileRole,
} from "@/lib/userProfiles";
import {
  generateProfileId,
  hashProfilePassword,
  normalizeStoredUserProfile,
  publicUserProfile,
  readUserProfileStore,
  safeProfileText,
  splitProfileDomains,
  writeUserProfileStore,
} from "@/lib/serverUserProfileStore";

export const runtime = "nodejs";

export async function GET() {
  const store = await readUserProfileStore();
  return NextResponse.json({ profiles: store.profiles.map(publicUserProfile) });
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
  const action = safeProfileText(payload.action, "upsert");
  const store = await readUserProfileStore();
  const id = safeProfileText(payload.id);

  if (action === "delete") {
    const nextProfiles = store.profiles.filter((profile) => profile.id !== id);
    await writeUserProfileStore({ profiles: nextProfiles });
    return NextResponse.json({ ok: true, profiles: nextProfiles.map(publicUserProfile) });
  }

  if (action !== "upsert") {
    return NextResponse.json({ error: "unknown action." }, { status: 400 });
  }

  const now = Date.now();
  const existing = id ? store.profiles.find((profile) => profile.id === id) : undefined;
  const password = safeProfileText(payload.password);
  const passwordUpdate = password ? hashProfilePassword(password) : null;
  const profile = normalizeStoredUserProfile({
    ...existing,
    id: existing?.id ?? generateProfileId(),
    displayName: safeProfileText(payload.displayName),
    username: safeProfileText(payload.username),
    email: safeProfileText(payload.email),
    role: normalizeProfileRole(payload.role),
    telegramChatId: safeProfileText(payload.telegramChatId),
    remoteDomains: splitProfileDomains(payload.remoteDomains),
    accessModes: normalizeAccessModes(payload.accessModes),
    authProviders: normalizeAuthProviders(payload.authProviders),
    googleSubject: safeProfileText(payload.googleSubject),
    passkeyCredentialIds: Array.isArray(payload.passkeyCredentialIds)
      ? payload.passkeyCredentialIds.map((item) => safeProfileText(item)).filter(Boolean)
      : existing?.passkeyCredentialIds,
    notes: safeProfileText(payload.notes),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    passwordHash: passwordUpdate?.hash ?? existing?.passwordHash ?? "",
    passwordSalt: passwordUpdate?.salt ?? existing?.passwordSalt ?? "",
    passwordIterations: passwordUpdate?.iterations ?? existing?.passwordIterations,
  });

  if (!profile.email || !profile.username) {
    return NextResponse.json({ error: "username and email are required." }, { status: 400 });
  }

  const withoutCurrent = store.profiles.filter((item) => item.id !== profile.id);
  if (
    withoutCurrent.some(
      (item) =>
        item.email.toLowerCase() === profile.email.toLowerCase() ||
        item.username.toLowerCase() === profile.username.toLowerCase()
    )
  ) {
    return NextResponse.json({ error: "username or email already exists." }, { status: 409 });
  }

  const profiles = [profile, ...withoutCurrent].sort((a, b) => b.updatedAt - a.updatedAt);
  await writeUserProfileStore({ profiles });
  return NextResponse.json({ ok: true, profile: publicUserProfile(profile), profiles: profiles.map(publicUserProfile) });
}
