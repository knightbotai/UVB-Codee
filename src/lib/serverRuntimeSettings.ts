import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_MODEL_SETTINGS,
  normalizeModelSettings,
  type ModelSettings,
} from "@/lib/modelSettings";
import {
  DEFAULT_VOICE_SETTINGS,
  normalizeVoiceSettings,
  type VoiceSettings,
} from "@/lib/voiceSettings";

export interface RuntimeSettings {
  modelSettings: ModelSettings;
  voiceSettings: VoiceSettings;
}

const runtimeDir = path.join(process.cwd(), ".uvb");
const runtimePath = path.join(runtimeDir, "runtime-settings.json");

export async function loadRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    const raw = await readFile(runtimePath, "utf8");
    const data = JSON.parse(raw) as Partial<RuntimeSettings>;

    return {
      modelSettings: normalizeModelSettings(data.modelSettings ?? DEFAULT_MODEL_SETTINGS),
      voiceSettings: normalizeVoiceSettings(data.voiceSettings ?? DEFAULT_VOICE_SETTINGS),
    };
  } catch {
    return {
      modelSettings: DEFAULT_MODEL_SETTINGS,
      voiceSettings: DEFAULT_VOICE_SETTINGS,
    };
  }
}

export async function saveRuntimeSettings(settings: Partial<RuntimeSettings>) {
  const current = await loadRuntimeSettings();
  const next: RuntimeSettings = {
    modelSettings: normalizeModelSettings(settings.modelSettings ?? current.modelSettings),
    voiceSettings: normalizeVoiceSettings(settings.voiceSettings ?? current.voiceSettings),
  };

  await mkdir(runtimeDir, { recursive: true });
  await writeFile(runtimePath, JSON.stringify(next, null, 2), "utf8");

  return next;
}
