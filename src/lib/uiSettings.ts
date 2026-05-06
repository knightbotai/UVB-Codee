export interface UiSettings {
  theme: "galaxy-dark" | "deep-space" | "neon-night";
  accentName: string;
  accentColor: string;
  particlesEnabled: boolean;
  localDataOnly: boolean;
  encryptedStorage: boolean;
  autoSaveThreads: boolean;
  telemetryEnabled: boolean;
  notifyTaskComplete: boolean;
  notifyVoiceReady: boolean;
  notifySystemAlerts: boolean;
  soundEffectsEnabled: boolean;
  ragRetrievalEnabled: boolean;
}

export const UI_SETTINGS_STORAGE_KEY = "uvb:ui-settings";
export const UI_SETTINGS_UPDATED_EVENT = "uvb:ui-settings-updated";

export const UI_THEMES = [
  {
    id: "galaxy-dark",
    name: "Galaxy Dark",
    preview: "linear-gradient(135deg, #0a0a1a, #1a0a2e, #0a1a2e)",
    vars: {
      "--color-uvb-galaxy-start": "#0a0a1a",
      "--color-uvb-galaxy-mid": "#1a0a2e",
      "--color-uvb-galaxy-end": "#0a1a2e",
    },
  },
  {
    id: "deep-space",
    name: "Deep Space",
    preview: "linear-gradient(135deg, #050509, #0a0a14, #0a1420)",
    vars: {
      "--color-uvb-galaxy-start": "#050509",
      "--color-uvb-galaxy-mid": "#0a0a14",
      "--color-uvb-galaxy-end": "#0a1420",
    },
  },
  {
    id: "neon-night",
    name: "Neon Night",
    preview: "linear-gradient(135deg, #0a0a0a, #1a0030, #000a1a)",
    vars: {
      "--color-uvb-galaxy-start": "#0a0a0a",
      "--color-uvb-galaxy-mid": "#1a0030",
      "--color-uvb-galaxy-end": "#000a1a",
    },
  },
] as const;

export const UI_ACCENTS = [
  { name: "Neon Green", color: "#39ff14" },
  { name: "Steel Blue", color: "#4a6fa5" },
  { name: "Royal Purple", color: "#6b1fa0" },
  { name: "Deep Teal", color: "#1a7a7a" },
  { name: "Accent Orange", color: "#ff6b35" },
];

export const DEFAULT_UI_SETTINGS: UiSettings = {
  theme: "galaxy-dark",
  accentName: "Neon Green",
  accentColor: "#39ff14",
  particlesEnabled: true,
  localDataOnly: true,
  encryptedStorage: false,
  autoSaveThreads: true,
  telemetryEnabled: false,
  notifyTaskComplete: true,
  notifyVoiceReady: true,
  notifySystemAlerts: true,
  soundEffectsEnabled: false,
  ragRetrievalEnabled: false,
};

export function normalizeUiSettings(settings: Partial<UiSettings> = {}): UiSettings {
  const theme = UI_THEMES.some((item) => item.id === settings.theme)
    ? settings.theme
    : DEFAULT_UI_SETTINGS.theme;
  const accent = UI_ACCENTS.find(
    (item) => item.name === settings.accentName || item.color === settings.accentColor
  );

  return {
    theme: theme as UiSettings["theme"],
    accentName: accent?.name ?? DEFAULT_UI_SETTINGS.accentName,
    accentColor: accent?.color ?? DEFAULT_UI_SETTINGS.accentColor,
    particlesEnabled: settings.particlesEnabled ?? DEFAULT_UI_SETTINGS.particlesEnabled,
    localDataOnly: true,
    encryptedStorage: Boolean(settings.encryptedStorage),
    autoSaveThreads: settings.autoSaveThreads ?? DEFAULT_UI_SETTINGS.autoSaveThreads,
    telemetryEnabled: Boolean(settings.telemetryEnabled),
    notifyTaskComplete: settings.notifyTaskComplete ?? DEFAULT_UI_SETTINGS.notifyTaskComplete,
    notifyVoiceReady: settings.notifyVoiceReady ?? DEFAULT_UI_SETTINGS.notifyVoiceReady,
    notifySystemAlerts: settings.notifySystemAlerts ?? DEFAULT_UI_SETTINGS.notifySystemAlerts,
    soundEffectsEnabled: Boolean(settings.soundEffectsEnabled),
    ragRetrievalEnabled: Boolean(settings.ragRetrievalEnabled),
  };
}

export function applyUiSettings(settings: UiSettings) {
  if (typeof document === "undefined") return;
  const normalized = normalizeUiSettings(settings);
  const theme = UI_THEMES.find((item) => item.id === normalized.theme) ?? UI_THEMES[0];
  Object.entries(theme.vars).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  document.documentElement.style.setProperty("--color-uvb-neon-green", normalized.accentColor);
  document.documentElement.style.setProperty("--color-uvb-neon-green-dim", normalized.accentColor);
  document.documentElement.style.setProperty("--color-uvb-border-active", `${normalized.accentColor}66`);
  document.documentElement.style.setProperty("--color-uvb-glow", `${normalized.accentColor}33`);
}

export function loadUiSettings(): UiSettings {
  if (typeof window === "undefined") return DEFAULT_UI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
    return normalizeUiSettings(raw ? (JSON.parse(raw) as Partial<UiSettings>) : DEFAULT_UI_SETTINGS);
  } catch {
    return DEFAULT_UI_SETTINGS;
  }
}

export function saveUiSettings(settings: UiSettings) {
  const normalized = normalizeUiSettings(settings);
  window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  applyUiSettings(normalized);
  window.dispatchEvent(new CustomEvent(UI_SETTINGS_UPDATED_EVENT));
}
