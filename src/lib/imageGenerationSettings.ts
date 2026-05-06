"use client";

export const IMAGE_GENERATION_SETTINGS_UPDATED_EVENT = "uvb:image-generation-settings-updated";

export interface ImageGenerationSettings {
  provider: "comfyui" | "custom";
  endpoint: string;
  workflowJson: string;
  promptNodeId: string;
  promptInputName: string;
  negativePromptNodeId: string;
  negativePromptInputName: string;
  outputSubfolder: string;
}

export const DEFAULT_IMAGE_GENERATION_SETTINGS: ImageGenerationSettings = {
  provider: "comfyui",
  endpoint: "http://127.0.0.1:8188",
  workflowJson: "",
  promptNodeId: "",
  promptInputName: "text",
  negativePromptNodeId: "",
  negativePromptInputName: "text",
  outputSubfolder: "",
};

const STORAGE_KEY = "uvb:image-generation-settings";

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function normalizeImageGenerationSettings(
  settings: Partial<ImageGenerationSettings> = {}
): ImageGenerationSettings {
  return {
    provider: settings.provider === "custom" ? "custom" : "comfyui",
    endpoint: safeString(settings.endpoint, DEFAULT_IMAGE_GENERATION_SETTINGS.endpoint),
    workflowJson: safeString(settings.workflowJson, DEFAULT_IMAGE_GENERATION_SETTINGS.workflowJson),
    promptNodeId: safeString(settings.promptNodeId, DEFAULT_IMAGE_GENERATION_SETTINGS.promptNodeId),
    promptInputName: safeString(settings.promptInputName, DEFAULT_IMAGE_GENERATION_SETTINGS.promptInputName),
    negativePromptNodeId: safeString(settings.negativePromptNodeId, DEFAULT_IMAGE_GENERATION_SETTINGS.negativePromptNodeId),
    negativePromptInputName: safeString(settings.negativePromptInputName, DEFAULT_IMAGE_GENERATION_SETTINGS.negativePromptInputName),
    outputSubfolder: safeString(settings.outputSubfolder, DEFAULT_IMAGE_GENERATION_SETTINGS.outputSubfolder),
  };
}

export function loadImageGenerationSettings(): ImageGenerationSettings {
  if (typeof window === "undefined") return DEFAULT_IMAGE_GENERATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw
      ? normalizeImageGenerationSettings(JSON.parse(raw) as Partial<ImageGenerationSettings>)
      : DEFAULT_IMAGE_GENERATION_SETTINGS;
  } catch {
    return DEFAULT_IMAGE_GENERATION_SETTINGS;
  }
}

export function saveImageGenerationSettings(settings: ImageGenerationSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeImageGenerationSettings(settings);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(IMAGE_GENERATION_SETTINGS_UPDATED_EVENT, { detail: normalized }));
}
