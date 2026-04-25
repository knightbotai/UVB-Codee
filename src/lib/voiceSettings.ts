export interface VoiceSettings {
  sttUrl: string;
  sttModel: string;
  ttsUrl: string;
  ttsVoice: string;
  autoSpeak: boolean;
  volume: number;
}

export const VOICE_SETTINGS_STORAGE_KEY = "uvb:voice-settings";
export const VOICE_SETTINGS_UPDATED_EVENT = "uvb:voice-settings-updated";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  sttUrl: "http://127.0.0.1:8001/v1/audio/transcriptions",
  sttModel: "Systran/faster-whisper-large-v3",
  ttsUrl: "http://127.0.0.1:8880/v1/audio/speech",
  ttsVoice: "af_nova",
  autoSpeak: true,
  volume: 0.9,
};

export function normalizeVoiceSettings(settings: Partial<VoiceSettings> = {}): VoiceSettings {
  const volume = Number(settings.volume);

  return {
    sttUrl: settings.sttUrl?.trim() || DEFAULT_VOICE_SETTINGS.sttUrl,
    sttModel: settings.sttModel?.trim() || DEFAULT_VOICE_SETTINGS.sttModel,
    ttsUrl: settings.ttsUrl?.trim() || DEFAULT_VOICE_SETTINGS.ttsUrl,
    ttsVoice: settings.ttsVoice?.trim() || DEFAULT_VOICE_SETTINGS.ttsVoice,
    autoSpeak: settings.autoSpeak ?? DEFAULT_VOICE_SETTINGS.autoSpeak,
    volume: Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : DEFAULT_VOICE_SETTINGS.volume,
  };
}

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;

  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return normalizeVoiceSettings(JSON.parse(raw) as Partial<VoiceSettings>);
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings) {
  window.localStorage.setItem(
    VOICE_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeVoiceSettings(settings))
  );
  window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_UPDATED_EVENT));
}
