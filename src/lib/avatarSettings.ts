"use client";

export const AVATAR_SETTINGS_UPDATED_EVENT = "uvb:avatar-settings-updated";

export type AvatarMode = "browser-overlay" | "desktop-companion" | "stream-overlay";
export type AvatarStyle = "orb" | "portrait" | "live2d" | "vrm" | "custom";
export type AvatarMood = "idle" | "listening" | "thinking" | "speaking" | "celebrating" | "alert";

export interface AvatarSettings {
  enabled: boolean;
  mode: AvatarMode;
  style: AvatarStyle;
  mood: AvatarMood;
  displayName: string;
  assetUrl: string;
  size: number;
  opacity: number;
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  reactToVoice: boolean;
  reactToChat: boolean;
  reactToSystem: boolean;
  desktopRuntimeUrl: string;
  notes: string;
}

export const DEFAULT_AVATAR_SETTINGS: AvatarSettings = {
  enabled: true,
  mode: "browser-overlay",
  style: "orb",
  mood: "idle",
  displayName: "Sophia",
  assetUrl: "",
  size: 112,
  opacity: 0.92,
  position: "bottom-right",
  reactToVoice: true,
  reactToChat: true,
  reactToSystem: true,
  desktopRuntimeUrl: "ws://127.0.0.1:8790/avatar",
  notes: "Browser overlay is active first. Desktop companion, Live2D, and VRM runtimes are staged.",
};

const STORAGE_KEY = "uvb:avatar-settings";

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function safeNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.min(max, Math.max(min, numberValue)) : fallback;
}

export function normalizeAvatarSettings(settings: Partial<AvatarSettings> = {}): AvatarSettings {
  const mode: AvatarMode =
    settings.mode === "desktop-companion" || settings.mode === "stream-overlay" ? settings.mode : "browser-overlay";
  const style: AvatarStyle =
    settings.style === "portrait" ||
    settings.style === "live2d" ||
    settings.style === "vrm" ||
    settings.style === "custom"
      ? settings.style
      : "orb";
  const mood: AvatarMood =
    settings.mood === "listening" ||
    settings.mood === "thinking" ||
    settings.mood === "speaking" ||
    settings.mood === "celebrating" ||
    settings.mood === "alert"
      ? settings.mood
      : "idle";
  const position =
    settings.position === "bottom-left" ||
    settings.position === "top-right" ||
    settings.position === "top-left"
      ? settings.position
      : "bottom-right";

  return {
    enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_AVATAR_SETTINGS.enabled,
    mode,
    style,
    mood,
    displayName: safeString(settings.displayName, DEFAULT_AVATAR_SETTINGS.displayName),
    assetUrl: safeString(settings.assetUrl, DEFAULT_AVATAR_SETTINGS.assetUrl),
    size: safeNumber(settings.size, DEFAULT_AVATAR_SETTINGS.size, 56, 260),
    opacity: safeNumber(settings.opacity, DEFAULT_AVATAR_SETTINGS.opacity, 0.2, 1),
    position,
    reactToVoice: typeof settings.reactToVoice === "boolean" ? settings.reactToVoice : true,
    reactToChat: typeof settings.reactToChat === "boolean" ? settings.reactToChat : true,
    reactToSystem: typeof settings.reactToSystem === "boolean" ? settings.reactToSystem : true,
    desktopRuntimeUrl: safeString(settings.desktopRuntimeUrl, DEFAULT_AVATAR_SETTINGS.desktopRuntimeUrl),
    notes: safeString(settings.notes, DEFAULT_AVATAR_SETTINGS.notes),
  };
}

export function loadAvatarSettings(): AvatarSettings {
  if (typeof window === "undefined") return DEFAULT_AVATAR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeAvatarSettings(JSON.parse(raw) as Partial<AvatarSettings>) : DEFAULT_AVATAR_SETTINGS;
  } catch {
    return DEFAULT_AVATAR_SETTINGS;
  }
}

export function saveAvatarSettings(settings: AvatarSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeAvatarSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(AVATAR_SETTINGS_UPDATED_EVENT, { detail: normalized }));
}
