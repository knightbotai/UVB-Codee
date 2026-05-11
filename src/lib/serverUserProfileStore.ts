import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_OWNER_PROFILE,
  DEFAULT_REMOTE_DOMAINS,
  type PublicUserProfile,
  type StoredUserProfile,
  type UserProfileStore,
  normalizeAccessModes,
  normalizeAuthProviders,
  normalizeProfileRole,
} from "@/lib/userProfiles";

export const USER_PROFILE_STORE_PATH = path.join(process.cwd(), ".uvb", "user-profiles.json");
export const USER_PROFILE_PASSWORD_ITERATIONS = 210_000;
export const USER_PROFILE_SESSION_COOKIE = "uvb_profile_session";
export const USER_PROFILE_GOOGLE_STATE_COOKIE = "uvb_google_oauth_state";

export function generateProfileId() {
  return `profile:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}

export function safeProfileText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function splitProfileDomains(value: unknown) {
  const domains = safeProfileText(value)
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return domains.length ? domains : DEFAULT_REMOTE_DOMAINS;
}

export function hashProfilePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(
    password,
    salt,
    USER_PROFILE_PASSWORD_ITERATIONS,
    32,
    "sha256"
  ).toString("hex");
  return { hash, salt, iterations: USER_PROFILE_PASSWORD_ITERATIONS };
}

export function verifyProfilePassword(profile: StoredUserProfile, password: string) {
  if (!profile.passwordHash || !profile.passwordSalt || !password) return false;

  const iterations = profile.passwordIterations || USER_PROFILE_PASSWORD_ITERATIONS;
  const candidate = pbkdf2Sync(password, profile.passwordSalt, iterations, 32, "sha256");
  const stored = Buffer.from(profile.passwordHash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export function publicUserProfile(profile: StoredUserProfile): PublicUserProfile {
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

export function normalizeStoredUserProfile(
  profile: Partial<StoredUserProfile>
): StoredUserProfile {
  const now = Date.now();
  return {
    id: safeProfileText(profile.id, generateProfileId()),
    displayName: safeProfileText(profile.displayName, "UVB User"),
    username: safeProfileText(profile.username, safeProfileText(profile.email, "uvb-user")),
    email: safeProfileText(profile.email),
    role: normalizeProfileRole(profile.role),
    telegramChatId: safeProfileText(profile.telegramChatId),
    remoteDomains:
      Array.isArray(profile.remoteDomains) && profile.remoteDomains.length
        ? profile.remoteDomains.map((item) => safeProfileText(item)).filter(Boolean)
        : DEFAULT_REMOTE_DOMAINS,
    accessModes: normalizeAccessModes(profile.accessModes),
    authProviders: normalizeAuthProviders(profile.authProviders),
    googleSubject: safeProfileText(profile.googleSubject),
    passkeyCredentialIds: Array.isArray(profile.passkeyCredentialIds)
      ? profile.passkeyCredentialIds.map((item) => safeProfileText(item)).filter(Boolean)
      : [],
    passkeyCredentialCount: Array.isArray(profile.passkeyCredentialIds)
      ? profile.passkeyCredentialIds.length
      : 0,
    passwordConfigured: Boolean(profile.passwordHash),
    passwordHash: safeProfileText(profile.passwordHash),
    passwordSalt: safeProfileText(profile.passwordSalt),
    passwordIterations:
      typeof profile.passwordIterations === "number"
        ? profile.passwordIterations
        : USER_PROFILE_PASSWORD_ITERATIONS,
    createdAt: typeof profile.createdAt === "number" ? profile.createdAt : now,
    updatedAt: typeof profile.updatedAt === "number" ? profile.updatedAt : now,
    notes: safeProfileText(profile.notes),
  };
}

export async function readUserProfileStore(): Promise<UserProfileStore> {
  try {
    const parsed = JSON.parse(await readFile(USER_PROFILE_STORE_PATH, "utf8")) as Partial<UserProfileStore>;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.map(normalizeStoredUserProfile)
      : [];
    return {
      profiles: profiles.length ? profiles : [normalizeStoredUserProfile(DEFAULT_OWNER_PROFILE)],
    };
  } catch {
    return { profiles: [normalizeStoredUserProfile(DEFAULT_OWNER_PROFILE)] };
  }
}

export async function writeUserProfileStore(store: UserProfileStore) {
  await mkdir(path.dirname(USER_PROFILE_STORE_PATH), { recursive: true });
  await writeFile(USER_PROFILE_STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function findUserProfileForLogin(
  profiles: StoredUserProfile[],
  login: string
) {
  const normalized = login.trim().toLowerCase();
  return profiles.find(
    (profile) =>
      profile.email.toLowerCase() === normalized ||
      profile.username.toLowerCase() === normalized ||
      profile.displayName.toLowerCase() === normalized ||
      profile.telegramChatId === login.trim()
  );
}
