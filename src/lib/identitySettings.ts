"use client";

export const IDENTITY_SETTINGS_UPDATED_EVENT = "uvb:identity-settings-updated";

export interface IdentitySettings {
  userName: string;
  userEmail: string;
  userPortraitUrl: string;
  assistantName: string;
  assistantSubtitle: string;
  assistantPortraitUrl: string;
  appName: string;
}

export const DEFAULT_IDENTITY_SETTINGS: IdentitySettings = {
  userName: "Richard",
  userEmail: "richard@uvb.local",
  userPortraitUrl: "",
  assistantName: "Sophia Knight",
  assistantSubtitle: "Local UVB voice cockpit",
  assistantPortraitUrl: "",
  appName: "UVB",
};

const STORAGE_KEY = "uvb:identity-settings";

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function loadIdentitySettings(): IdentitySettings {
  if (typeof window === "undefined") return DEFAULT_IDENTITY_SETTINGS;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Partial<IdentitySettings>;
    return {
      userName: safeString(parsed.userName, DEFAULT_IDENTITY_SETTINGS.userName),
      userEmail: safeString(parsed.userEmail, DEFAULT_IDENTITY_SETTINGS.userEmail),
      userPortraitUrl: safeString(parsed.userPortraitUrl, DEFAULT_IDENTITY_SETTINGS.userPortraitUrl),
      assistantName: safeString(parsed.assistantName, DEFAULT_IDENTITY_SETTINGS.assistantName),
      assistantSubtitle: safeString(parsed.assistantSubtitle, DEFAULT_IDENTITY_SETTINGS.assistantSubtitle),
      assistantPortraitUrl: safeString(parsed.assistantPortraitUrl, DEFAULT_IDENTITY_SETTINGS.assistantPortraitUrl),
      appName: safeString(parsed.appName, DEFAULT_IDENTITY_SETTINGS.appName),
    };
  } catch {
    return DEFAULT_IDENTITY_SETTINGS;
  }
}

export function saveIdentitySettings(settings: IdentitySettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(IDENTITY_SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export function fileToIdentityDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read portrait."));
    reader.readAsDataURL(file);
  });
}
