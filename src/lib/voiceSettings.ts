export interface VoiceSettings {
  sttUrl: string;
  sttModel: string;
  sttLanguage: string;
  sttPrompt: string;
  ttsUrl: string;
  ttsVoice: string;
  autoSpeak: boolean;
  volume: number;
  liveVoiceUrl: string;
  liveWebRtcUrl: string;
  liveTransport: "websocket" | "small-webrtc" | "webrtc" | "livekit";
  liveSttProvider: "faster-whisper" | "parakeet-realtime-eou" | "custom";
  liveTtsProvider:
    | "kokoro"
    | "moss-tts-nano"
    | "moss-ttsd"
    | "chatterbox-turbo"
    | "vibevoice-realtime"
    | "custom";
  liveVadProvider: "browser-manual" | "silero" | "ten-vad";
  mossTtsUrl: string;
  mossTtsVoice: string;
  voiceProfileName: string;
  systemPrompt: string;
}

export const VOICE_SETTINGS_STORAGE_KEY = "uvb:voice-settings";
export const VOICE_SETTINGS_UPDATED_EVENT = "uvb:voice-settings-updated";
const LEGACY_DEFAULT_STT_MODEL = "Systran/faster-whisper-large-v3";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  sttUrl: "http://127.0.0.1:8001/v1/audio/transcriptions",
  sttModel: "Systran/faster-distil-whisper-large-v3",
  sttLanguage: "en",
  sttPrompt:
    "Transcribe spoken English with natural punctuation, capitalization, sentence boundaries, commas, periods, and question marks. Preserve the speaker's words exactly.",
  ttsUrl: "http://127.0.0.1:8880/v1/audio/speech",
  ttsVoice: "af_nova",
  autoSpeak: true,
  volume: 0.9,
  liveVoiceUrl: "ws://127.0.0.1:8765/live",
  liveWebRtcUrl: "http://127.0.0.1:8766/api/offer",
  liveTransport: "small-webrtc",
  liveSttProvider: "faster-whisper",
  liveTtsProvider: "kokoro",
  liveVadProvider: "browser-manual",
  mossTtsUrl: "http://127.0.0.1:8890/v1/audio/speech",
  mossTtsVoice: "default",
  voiceProfileName: "Sophia / KnightBot Default",
  systemPrompt:
    "You are KnightBot inside UVB, a local multimodal AI workspace. Be direct, useful, warm, and concise. You are speaking through the realtime voice cockpit, so keep replies conversational and interruptible.",
};

export function normalizeVoiceSettings(settings: Partial<VoiceSettings> = {}): VoiceSettings {
  const volume = Number(settings.volume);
  const sttModel = settings.sttModel?.trim();

  return {
    sttUrl: settings.sttUrl?.trim() || DEFAULT_VOICE_SETTINGS.sttUrl,
    sttModel:
      sttModel && sttModel !== LEGACY_DEFAULT_STT_MODEL
        ? sttModel
        : DEFAULT_VOICE_SETTINGS.sttModel,
    sttLanguage: settings.sttLanguage?.trim() || DEFAULT_VOICE_SETTINGS.sttLanguage,
    sttPrompt: settings.sttPrompt?.trim() || DEFAULT_VOICE_SETTINGS.sttPrompt,
    ttsUrl: settings.ttsUrl?.trim() || DEFAULT_VOICE_SETTINGS.ttsUrl,
    ttsVoice: settings.ttsVoice?.trim() || DEFAULT_VOICE_SETTINGS.ttsVoice,
    autoSpeak: settings.autoSpeak ?? DEFAULT_VOICE_SETTINGS.autoSpeak,
    volume: Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : DEFAULT_VOICE_SETTINGS.volume,
    liveVoiceUrl: settings.liveVoiceUrl?.trim() || DEFAULT_VOICE_SETTINGS.liveVoiceUrl,
    liveWebRtcUrl: settings.liveWebRtcUrl?.trim() || DEFAULT_VOICE_SETTINGS.liveWebRtcUrl,
    liveTransport: ["websocket", "small-webrtc", "webrtc", "livekit"].includes(
      settings.liveTransport ?? ""
    )
      ? (settings.liveTransport as VoiceSettings["liveTransport"])
      : DEFAULT_VOICE_SETTINGS.liveTransport,
    liveSttProvider: ["faster-whisper", "parakeet-realtime-eou", "custom"].includes(
      settings.liveSttProvider ?? ""
    )
      ? (settings.liveSttProvider as VoiceSettings["liveSttProvider"])
      : DEFAULT_VOICE_SETTINGS.liveSttProvider,
    liveTtsProvider: [
      "kokoro",
      "moss-tts-nano",
      "moss-ttsd",
      "chatterbox-turbo",
      "vibevoice-realtime",
      "custom",
    ].includes(settings.liveTtsProvider ?? "")
      ? (settings.liveTtsProvider as VoiceSettings["liveTtsProvider"])
      : DEFAULT_VOICE_SETTINGS.liveTtsProvider,
    liveVadProvider: ["browser-manual", "silero", "ten-vad"].includes(
      settings.liveVadProvider ?? ""
    )
      ? (settings.liveVadProvider as VoiceSettings["liveVadProvider"])
      : DEFAULT_VOICE_SETTINGS.liveVadProvider,
    mossTtsUrl: settings.mossTtsUrl?.trim() || DEFAULT_VOICE_SETTINGS.mossTtsUrl,
    mossTtsVoice: settings.mossTtsVoice?.trim() || DEFAULT_VOICE_SETTINGS.mossTtsVoice,
    voiceProfileName:
      settings.voiceProfileName?.trim() || DEFAULT_VOICE_SETTINGS.voiceProfileName,
    systemPrompt: settings.systemPrompt?.trim() || DEFAULT_VOICE_SETTINGS.systemPrompt,
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
