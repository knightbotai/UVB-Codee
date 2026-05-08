"use client";

export const AVATAR_SETTINGS_UPDATED_EVENT = "uvb:avatar-settings-updated";
export const DEFAULT_SOPHIA_AVATAR_ASSET_URL = "/avatar/sophia-knight-pixar.png";

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
  customPosition: { x: number; y: number } | null;
  reactToVoice: boolean;
  reactToChat: boolean;
  reactToSystem: boolean;
  desktopRuntimeUrl: string;
  notes: string;
}

export const DEFAULT_AVATAR_SETTINGS: AvatarSettings = {
  enabled: true,
  mode: "browser-overlay",
  style: "portrait",
  mood: "idle",
  displayName: "Sophia",
  assetUrl: DEFAULT_SOPHIA_AVATAR_ASSET_URL,
  size: 148,
  opacity: 0.92,
  position: "bottom-right",
  customPosition: null,
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
  const customPosition =
    settings.customPosition &&
    Number.isFinite(Number(settings.customPosition.x)) &&
    Number.isFinite(Number(settings.customPosition.y))
      ? {
          x: safeNumber(settings.customPosition.x, 24, 0, 10000),
          y: safeNumber(settings.customPosition.y, 24, 0, 10000),
        }
      : null;

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
    customPosition,
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

export async function fileToAvatarAssetDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the avatar.");
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = new window.Image();
    element.onload = () => {
      URL.revokeObjectURL(url);
      resolve(element);
    };
    element.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode avatar image."));
    };
    element.src = url;
  });

  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare avatar canvas.");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}
