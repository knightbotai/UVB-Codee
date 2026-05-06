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
  services: HealthService[];
}

export default function Header() {
  const { activeSection } = useAppStore();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showHealth, setShowHealth] = useState(false);
  const [identity, setIdentity] = useState<IdentitySettings>(() => loadIdentitySettings());

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
        <button className="p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors">
          <MagnifyingGlassIcon className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button className="relative p-2 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary hover:text-uvb-text-primary transition-colors">
          <BellIcon className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-uvb-neon-green status-pulse" />
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
        <button className="p-1 rounded-lg hover:bg-uvb-light-gray/40 transition-colors">
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
        </button>
      </div>
    </header>
  );
}
