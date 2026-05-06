import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { VOICE_MODEL_CATALOG } from "@/lib/voiceModelCatalog";

const DEFAULT_SIDECAR_ROOT = "Z:\\Models\\_uvb-sidecars";

const SIDECAR_REPOS: Record<string, { repo: string; directory: string; priority: number }> = {
  "moss-tts-nano": {
    repo: "https://github.com/OpenMOSS/MOSS-TTS-Nano.git",
    directory: "MOSS-TTS-Nano",
    priority: 1,
  },
  "moss-tts-realtime": {
    repo: "https://github.com/OpenMOSS/MOSS-TTS.git",
    directory: "MOSS-TTS",
    priority: 1,
  },
  "moss-ttsd": {
    repo: "https://github.com/OpenMOSS/MOSS-TTS.git",
    directory: "MOSS-TTS",
    priority: 2,
  },
  "chatterbox-turbo": {
    repo: "https://github.com/resemble-ai/chatterbox.git",
    directory: "chatterbox",
    priority: 1,
  },
  "chatterbox-multilingual": {
    repo: "https://github.com/resemble-ai/chatterbox.git",
    directory: "chatterbox",
    priority: 2,
  },
  "fish-audio-s2-pro": {
    repo: "https://github.com/fishaudio/fish-speech.git",
    directory: "fish-speech",
    priority: 2,
  },
  "vibevoice-realtime-0.5b": {
    repo: "https://github.com/microsoft/VibeVoice.git",
    directory: "VibeVoice",
    priority: 1,
  },
  "vibevoice-tts-1.5b": {
    repo: "https://github.com/microsoft/VibeVoice.git",
    directory: "VibeVoice",
    priority: 1,
  },
  "f5-tts": {
    repo: "https://github.com/SWivid/F5-TTS.git",
    directory: "F5-TTS",
    priority: 3,
  },
  cosyvoice2: {
    repo: "https://github.com/FunAudioLLM/CosyVoice.git",
    directory: "CosyVoice",
    priority: 3,
  },
  "whisper-cpp-streaming": {
    repo: "https://github.com/ggml-org/whisper.cpp.git",
    directory: "whisper.cpp",
    priority: 2,
  },
  "faster-distil-whisper-large-v3": {
    repo: "https://github.com/SYSTRAN/faster-whisper.git",
    directory: "faster-whisper",
    priority: 2,
  },
};

function inspectPath(targetPath: string) {
  try {
    if (!existsSync(targetPath)) return { path: targetPath, exists: false };
    const stats = statSync(targetPath);
    return {
      path: targetPath,
      exists: true,
      type: stats.isDirectory() ? "directory" : "file",
      sizeBytes: stats.isFile() ? stats.size : undefined,
      updatedAt: stats.mtime.toISOString(),
    };
  } catch (error) {
    return {
      path: targetPath,
      exists: false,
      error: error instanceof Error ? error.message : "Could not inspect path.",
    };
  }
}

export async function GET() {
  const sidecarRoot = process.env.UVB_VOICE_SIDECAR_ROOT || DEFAULT_SIDECAR_ROOT;
  const items = VOICE_MODEL_CATALOG.map((item) => {
    const repo = SIDECAR_REPOS[item.id];
    const sidecarPath = repo ? path.join(sidecarRoot, repo.directory) : undefined;
    const paths = [...(item.localPaths ?? []), ...(sidecarPath ? [sidecarPath] : [])];
    const local = paths.map(inspectPath);
    const installed = local.some((entry) => entry.exists);

    return {
      ...item,
      repo,
      sidecarPath,
      installed,
      local,
    };
  });

  return NextResponse.json({
    sidecarRoot,
    summary: {
      total: items.length,
      installed: items.filter((item) => item.installed).length,
      wired: items.filter((item) => item.status === "wired").length,
      candidates: items.filter((item) => item.status === "candidate").length,
    },
    items,
    timestamp: new Date().toISOString(),
  });
}
