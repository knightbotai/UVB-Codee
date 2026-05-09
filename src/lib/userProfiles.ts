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

export const DEFAULT_OWNER_PROFILE: StoredUserProfile = {
  id: "profile:owner:richard",
  displayName: "Richard",
  username: "TACIMPULSE",
  email: "richard@uvb.local",
  role: "owner",
  telegramChatId: "6953468234",
  remoteDomains: DEFAULT_REMOTE_DOMAINS,
  accessModes: ["local-browser", "telegram", "remote-browser"],
  authProviders: ["local-password"],
  googleSubject: "",
  passkeyCredentialCount: 0,
  passwordConfigured: false,
  createdAt: 0,
  updatedAt: 0,
  notes: "Primary local owner profile for Richard / TACIMPULSE.",
  passwordHash: "",
  passwordSalt: "",
  passwordIterations: 210_000,
  passkeyCredentialIds: [],
};

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
