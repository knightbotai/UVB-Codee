export type UserProfileRole = "owner" | "collaborator" | "viewer";
export type UserProfileAccessMode = "local-browser" | "telegram" | "remote-browser";
export type UserAuthProvider = "local-password" | "google-oidc" | "passkey";

export interface PublicUserProfile {
  id: string;
  displayName: string;
  username: string;
  email: string;
  role: UserProfileRole;
  telegramChatId: string;
  remoteDomains: string[];
  accessModes: UserProfileAccessMode[];
  authProviders: UserAuthProvider[];
  googleSubject: string;
  passkeyCredentialCount: number;
  passwordConfigured: boolean;
  createdAt: number;
  updatedAt: number;
  notes: string;
}

export interface StoredUserProfile extends PublicUserProfile {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  authProviders: UserAuthProvider[];
  googleSubject: string;
  passkeyCredentialIds: string[];
}

export interface UserProfileStore {
  profiles: StoredUserProfile[];
}

export const DEFAULT_REMOTE_DOMAINS = ["daplab.net", "tacimpulse.net"];

export function normalizeProfileRole(value: unknown): UserProfileRole {
  return value === "collaborator" || value === "viewer" ? value : "owner";
}

export function normalizeAccessModes(value: unknown): UserProfileAccessMode[] {
  const raw = Array.isArray(value) ? value : [];
  const modes = raw.filter(
    (item): item is UserProfileAccessMode =>
      item === "local-browser" || item === "telegram" || item === "remote-browser"
  );
  return modes.length ? modes : ["local-browser"];
}

export function normalizeAuthProviders(value: unknown): UserAuthProvider[] {
  const raw = Array.isArray(value) ? value : [];
  const providers = raw.filter(
    (item): item is UserAuthProvider =>
      item === "local-password" || item === "google-oidc" || item === "passkey"
  );
  return providers.length ? providers : ["local-password"];
}
