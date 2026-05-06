"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AVATAR_SETTINGS_UPDATED_EVENT,
  loadAvatarSettings,
  type AvatarMood,
  type AvatarSettings,
} from "@/lib/avatarSettings";

const MOOD_COLORS: Record<AvatarMood, string> = {
  idle: "#39ff14",
  listening: "#4a6fa5",
  thinking: "#6b1fa0",
  speaking: "#f5a623",
  celebrating: "#ff6b35",
  alert: "#ef4444",
};

const POSITION_CLASSES: Record<AvatarSettings["position"], string> = {
  "bottom-right": "bottom-5 right-5",
  "bottom-left": "bottom-5 left-5",
  "top-right": "top-20 right-5",
  "top-left": "top-20 left-5",
};

export default function AvatarCompanion() {
  const [settings, setSettings] = useState<AvatarSettings>(() => loadAvatarSettings());

  useEffect(() => {
    const refresh = () => setSettings(loadAvatarSettings());
    window.addEventListener(AVATAR_SETTINGS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(AVATAR_SETTINGS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!settings.enabled || settings.mode !== "browser-overlay") return null;

  const color = MOOD_COLORS[settings.mood];
  const pulse = settings.mood === "speaking" || settings.mood === "listening";

  return (
    <div
      className={`pointer-events-none fixed z-50 ${POSITION_CLASSES[settings.position]}`}
      style={{ opacity: settings.opacity }}
      aria-hidden="true"
    >
      <div className="relative flex flex-col items-center gap-2">
        <div
          className={`relative rounded-full border border-white/15 bg-black/50 shadow-2xl backdrop-blur-md ${
            pulse ? "animate-pulse" : ""
          }`}
          style={{
            width: settings.size,
            height: settings.size,
            boxShadow: `0 0 30px ${color}55`,
          }}
        >
          {settings.assetUrl && settings.style !== "orb" ? (
            <Image
              src={settings.assetUrl}
              alt=""
              width={settings.size}
              height={settings.size}
              unoptimized
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 25%, #ffffffcc 0%, ${color} 18%, #102020 58%, #05080d 100%)`,
              }}
            />
          )}
          <span
            className="absolute -right-1 bottom-3 h-4 w-4 rounded-full border border-black/40"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-wider text-white/80 backdrop-blur-md">
          {settings.displayName} · {settings.mood}
        </div>
      </div>
    </div>
  );
}
