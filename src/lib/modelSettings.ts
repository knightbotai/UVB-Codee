export interface ModelSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  enableThinking: boolean;
}

export const MODEL_SETTINGS_STORAGE_KEY = "uvb:model-settings";
export const MODEL_SETTINGS_UPDATED_EVENT = "uvb:model-settings-updated";

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: "Local vLLM",
  baseUrl: "http://127.0.0.1:8003/v1",
  model: "qwen36-35b-a3b-heretic-nvfp4",
  apiKey: "uvb-local",
  temperature: 0.7,
  maxTokens: 1200,
  enableThinking: false,
};

export function normalizeModelSettings(settings: Partial<ModelSettings> = {}): ModelSettings {
  const temperature = Number(settings.temperature);
  const maxTokens = Number(settings.maxTokens);

  return {
    provider: settings.provider?.trim() || DEFAULT_MODEL_SETTINGS.provider,
    baseUrl: settings.baseUrl?.trim() || DEFAULT_MODEL_SETTINGS.baseUrl,
    model: settings.model?.trim() || DEFAULT_MODEL_SETTINGS.model,
    apiKey: settings.apiKey?.trim() || DEFAULT_MODEL_SETTINGS.apiKey,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_MODEL_SETTINGS.temperature,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : DEFAULT_MODEL_SETTINGS.maxTokens,
    enableThinking: settings.enableThinking ?? DEFAULT_MODEL_SETTINGS.enableThinking,
  };
}

export function loadModelSettings(): ModelSettings {
  if (typeof window === "undefined") return DEFAULT_MODEL_SETTINGS;

  try {
    const raw = window.localStorage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL_SETTINGS;
    return normalizeModelSettings(JSON.parse(raw) as Partial<ModelSettings>);
  } catch {
    return DEFAULT_MODEL_SETTINGS;
  }
}

export function saveModelSettings(settings: ModelSettings) {
  window.localStorage.setItem(
    MODEL_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeModelSettings(settings))
  );
  window.dispatchEvent(new CustomEvent(MODEL_SETTINGS_UPDATED_EVENT));
}
