"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/stores/appStore";
import {
  BellIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import {
  IDENTITY_SETTINGS_UPDATED_EVENT,
  loadIdentitySettings,
  type IdentitySettings,
} from "@/lib/identitySettings";
import type { PublicUserProfile } from "@/lib/userProfiles";

interface HealthService {
  id: string;
  name: string;
  url: string;
  online: boolean;
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: "online" | "degraded" | "offline";
  cwd?: string;
  commit?: string;
  services: HealthService[];
}

interface AuthSessionResponse {
  profile: PublicUserProfile | null;
  profiles: PublicUserProfile[];
}

interface AuthReadinessResponse {
  providers: Array<{
    id: string;
    configured: boolean;
    callbackUrl?: string;
  }>;
}

export default function Header() {
  const { activeSection, setActiveSection, setShowCommandPalette, currentUser, setCurrentUser } =
    useAppStore();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [identity, setIdentity] = useState<IdentitySettings>(() => loadIdentitySettings());
  const [profiles, setProfiles] = useState<PublicUserProfile[]>([]);
  const [loginProfileId, setLoginProfileId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authReadiness, setAuthReadiness] = useState<AuthReadinessResponse | null>(null);
  const [authStatus, setAuthStatus] = useState("");

  const sectionTitles: Record<string, string> = {
    chat: `${identity.assistantName} Chat`,
    voice: "Voice Analysis",
    media: "Media Studio",
    podcast: "Podcast Suite",
    memory: "Memory Bank",
    settings: "Settings",
  };

  useEffect(() => {
    let isMounted = true;

    const refreshHealth = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as HealthResponse;
        if (isMounted) setHealth(data);
      } catch {
        if (isMounted) {
          setHealth({ status: "offline", services: [] });
        }
      }
    };

    refreshHealth();
    const interval = window.setInterval(refreshHealth, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshAuth = async () => {
      try {
        const [sessionResponse, readinessResponse] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/auth/readiness", { cache: "no-store" }),
        ]);
        const session = (await sessionResponse.json()) as AuthSessionResponse;
        const readiness = (await readinessResponse.json()) as AuthReadinessResponse;
        if (!isMounted) return;
        const nextProfiles = Array.isArray(session.profiles) ? session.profiles : [];
        setProfiles(nextProfiles);
        setAuthReadiness(readiness);
        if (session.profile) {
          setCurrentUser({
            id: session.profile.id,
            name: session.profile.displayName,
            displayName: session.profile.displayName,
            username: session.profile.username,
            email: session.profile.email,
            role: session.profile.role,
            telegramChatId: session.profile.telegramChatId,
            createdAt: session.profile.createdAt,
          });
          setLoginProfileId(session.profile.id);
        } else {
          setCurrentUser(null);
          if (!loginProfileId && nextProfiles.length) {
            setLoginProfileId(nextProfiles[0].id);
          }
        }
      } catch {
        if (isMounted) setAuthStatus("Profile session is unavailable.");
      }
    };

    void refreshAuth();
    return () => {
      isMounted = false;
    };
  }, [loginProfileId, setCurrentUser]);

  useEffect(() => {
    const refreshIdentity = () => setIdentity(loadIdentitySettings());
    window.addEventListener(IDENTITY_SETTINGS_UPDATED_EVENT, refreshIdentity);
    window.addEventListener("storage", refreshIdentity);
    return () => {
      window.removeEventListener(IDENTITY_SETTINGS_UPDATED_EVENT, refreshIdentity);
      window.removeEventListener("storage", refreshIdentity);
    };
  }, []);

  const onlineCount = health?.services.filter((service) => service.online).length ?? 0;
  const totalCount = health?.services.length ?? 0;
  const statusLabel =
    health?.status === "online" ? "Online" : health?.status === "degraded" ? "Degraded" : "Offline";
  const statusColor =
    health?.status === "online"
      ? "bg-uvb-neon-green"
      : health?.status === "degraded"
      ? "bg-uvb-accent-yellow"
      : "bg-red-500";
  const activeProfile =
    profiles.find((profile) => profile.id === currentUser?.id) ??
    profiles.find((profile) => profile.id === loginProfileId) ??
    null;
  const googleProvider = authReadiness?.providers.find((provider) => provider.id === "google-oidc");

  const loginWithPassword = async () => {
    const target = profiles.find((profile) => profile.id === loginProfileId);
    if (!target) {
      setAuthStatus("Choose a profile first.");
      return;
    }
    setAuthStatus("Signing in...");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: target.email || target.username || target.id,
          password: loginPassword,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        profile?: PublicUserProfile;
        error?: string;
      };
      if (!response.ok || !data.profile) {
        throw new Error(data.error ?? "Profile login failed.");
      }
      setCurrentUser({
        id: data.profile.id,
        name: data.profile.displayName,
        displayName: data.profile.displayName,
        username: data.profile.username,
        email: data.profile.email,
        role: data.profile.role,
        telegramChatId: data.profile.telegramChatId,
        createdAt: data.profile.createdAt,
      });
      setLoginPassword("");
      setAuthStatus(`Signed in as ${data.profile.displayName}.`);
    } catch (error) {
      setAuthStatus(error instanceof Error ? error.message : "Profile login failed.");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setCurrentUser(null);
    setAuthStatus("Signed out.");
  };

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-uvb-border/40">
      <div className="flex items-center gap-4">
        <motion.h2
          key={activeSection}
          className="text-lg font-semibold text-uvb-text-primary font-[family-name:var(--font-display)]"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {sectionTitles[activeSection] || "UVB Dashboard"}
        </motion.h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <button
          onClick={() => setShowCommandPalette(true)}
          className="p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors"
          title="Open command search"
          aria-label="Open command search"
        >
          <MagnifyingGlassIcon className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button
          onClick={() => setShowHealth((current) => !current)}
          className="relative p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors"
          title="Show local system alerts"
          aria-label="Show local system alerts"
        >
          <BellIcon className="w-5 h-5" />
          <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${statusColor} status-pulse`} />
        </button>

        {/* Status indicator */}
        <div className="relative">
          <button
            onClick={() => setShowHealth((current) => !current)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-uvb-deep-teal/20 border border-uvb-deep-teal/30"
          >
            <span className={`w-2 h-2 rounded-full ${statusColor} status-pulse`} />
            <span className="text-xs text-uvb-text-secondary">
              {statusLabel}
              {totalCount > 0 ? ` ${onlineCount}/${totalCount}` : ""}
            </span>
          </button>
          {showHealth && (
            <div className="absolute right-0 top-10 z-50 w-80 glass-panel p-3 shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-uvb-text-primary">Local service health</p>
                <button
                  onClick={() => setShowHealth(false)}
                  className="text-xs text-uvb-text-muted hover:text-uvb-text-primary"
                >
                  close
                </button>
              </div>
              <div className="mb-2 rounded-lg border border-uvb-border/40 bg-uvb-dark-gray/60 p-2">
                <p className="truncate text-[10px] text-uvb-text-muted">
                  Origin: {typeof window !== "undefined" ? window.location.origin : "browser"}
                </p>
                <p className="truncate text-[10px] text-uvb-text-muted">
                  Repo: {health?.cwd ?? "unknown"}
                </p>
                <p className="text-[10px] text-uvb-text-muted">
                  Commit: {health?.commit ?? "unknown"}
                </p>
              </div>
              <div className="space-y-2">
                {health?.services.map((service) => (
                  <div
                    key={service.id}
                    className="rounded-lg border border-uvb-border/40 bg-uvb-dark-gray/60 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            service.online ? "bg-uvb-neon-green" : "bg-red-500"
                          }`}
                        />
                        <span className="text-xs text-uvb-text-primary">{service.name}</span>
                      </div>
                      <span className="text-[10px] text-uvb-text-muted">
                        {service.latencyMs ? `${service.latencyMs}ms` : "n/a"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-uvb-text-muted">{service.url}</p>
                    {service.error && (
                      <p className="mt-1 text-[10px] text-red-300">{service.error}</p>
                    )}
                  </div>
                ))}
                {!health?.services.length && (
                  <p className="text-xs text-red-300">Health route is not responding.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu((current) => !current)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-uvb-light-gray/40 transition-colors"
            title="Profile login"
            aria-label="Profile login"
          >
            {identity.userPortraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.userPortraitUrl}
                alt={identity.userName}
                className="h-7 w-7 rounded-lg object-cover"
              />
            ) : (
              <UserCircleIcon className="w-7 h-7 text-uvb-text-secondary hover:text-uvb-text-primary" />
            )}
            <span className="hidden max-w-28 truncate text-xs text-uvb-text-secondary xl:inline">
              {currentUser?.displayName || currentUser?.name || "Sign in"}
            </span>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-11 z-50 w-96 glass-panel p-3 shadow-2xl">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-uvb-text-primary">UVB profile session</p>
                  <p className="mt-1 text-[10px] text-uvb-text-muted">
                    {currentUser
                      ? `${currentUser.displayName || currentUser.name} · ${
                          currentUser.username || currentUser.email
                        }`
                      : "Choose a local profile to separate identity, Telegram, and memory context."}
                  </p>
                </div>
                <button
                  onClick={() => setShowProfileMenu(false)}
                  className="text-xs text-uvb-text-muted hover:text-uvb-text-primary"
                >
                  close
                </button>
              </div>

              <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-uvb-text-muted">
                Profile
              </label>
              <select
                value={loginProfileId}
                onChange={(event) => setLoginProfileId(event.target.value)}
                className="input-field mb-2"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.displayName} · @{profile.username}
                  </option>
                ))}
              </select>

              {activeProfile && (
                <div className="mb-3 rounded-lg border border-uvb-border/40 bg-uvb-dark-gray/60 p-2">
                  <p className="text-xs text-uvb-text-primary">{activeProfile.email}</p>
                  <p className="mt-1 text-[10px] text-uvb-text-muted">
                    Telegram: {activeProfile.telegramChatId || "not linked"} · Role:{" "}
                    {activeProfile.role}
                  </p>
                  <p className="mt-1 text-[10px] text-uvb-text-muted">
                    Auth: {activeProfile.authProviders.join(", ")}
                  </p>
                </div>
              )}

              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loginWithPassword();
                }}
                placeholder={
                  activeProfile?.passwordConfigured
                    ? "Profile password"
                    : "Owner profile has no password yet"
                }
                className="input-field mb-2"
              />
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void loginWithPassword()} className="btn-primary text-xs">
                  Sign In
                </button>
                <button onClick={() => void logout()} className="btn-ghost text-xs">
                  Sign Out
                </button>
                <button
                  onClick={() => setActiveSection("settings")}
                  className="btn-ghost text-xs"
                >
                  Manage Profiles
                </button>
              </div>

              <div className="mt-3 border-t border-uvb-border/30 pt-3">
                <a
                  href={googleProvider?.configured ? "/api/auth/google/start" : undefined}
                  aria-disabled={!googleProvider?.configured}
                  onClick={(event) => {
                    if (!googleProvider?.configured) event.preventDefault();
                  }}
                  className={`inline-flex w-full items-center justify-center rounded-lg border px-3 py-2 text-xs transition-colors ${
                    googleProvider?.configured
                      ? "border-uvb-deep-teal/50 text-uvb-text-primary hover:bg-uvb-deep-teal/20"
                      : "cursor-not-allowed border-uvb-border/30 text-uvb-text-muted"
                  }`}
                >
                  Google Login {googleProvider?.configured ? "" : "not configured"}
                </a>
                {googleProvider?.callbackUrl && (
                  <p className="mt-2 break-all text-[10px] text-uvb-text-muted">
                    Callback: {googleProvider.callbackUrl}
                  </p>
                )}
              </div>

              {authStatus && <p className="mt-3 text-xs text-uvb-neon-green">{authStatus}</p>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
