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
  maxTokens: 4096,
  enableThinking: false,
};

const LEGACY_DEFAULT_MAX_TOKENS = 1200;

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return DEFAULT_MODEL_SETTINGS.baseUrl;
  if (/^https?:\/\/[^/]+:\d+v1$/i.test(trimmed)) {
    return trimmed.replace(/v1$/i, "/v1");
  }
  return trimmed.replace(/\/+$/, "");
}

export function normalizeModelSettings(settings: Partial<ModelSettings> = {}): ModelSettings {
  const temperature = Number(settings.temperature);
  const maxTokens = Number(settings.maxTokens);
  const normalizedMaxTokens =
    !Number.isFinite(maxTokens) || maxTokens === LEGACY_DEFAULT_MAX_TOKENS
      ? DEFAULT_MODEL_SETTINGS.maxTokens
      : Math.min(8192, Math.max(128, maxTokens));

  return {
    provider: settings.provider?.trim() || DEFAULT_MODEL_SETTINGS.provider,
    baseUrl: normalizeBaseUrl(settings.baseUrl ?? DEFAULT_MODEL_SETTINGS.baseUrl),
    model: settings.model?.trim() || DEFAULT_MODEL_SETTINGS.model,
    apiKey: settings.apiKey?.trim() || DEFAULT_MODEL_SETTINGS.apiKey,
    temperature: Number.isFinite(temperature) ? temperature : DEFAULT_MODEL_SETTINGS.temperature,
    maxTokens: normalizedMaxTokens,
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
