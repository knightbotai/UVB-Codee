import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { loadRuntimeSettings } from "@/lib/serverRuntimeSettings";

export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_STT_URL =
  process.env.UVB_STT_URL ?? "http://127.0.0.1:8001/v1/audio/transcriptions";
const DEFAULT_STT_MODEL =
  process.env.UVB_STT_MODEL ?? "Systran/faster-distil-whisper-large-v3";
const DEFAULT_STT_PROMPT =
  process.env.UVB_STT_PROMPT ??
  "Transcribe spoken English with natural punctuation, capitalization, sentence boundaries, commas, periods, and question marks. Preserve the speaker's words exactly.";
const DEFAULT_VIDEO_FRAME_COUNT = Number.parseInt(
  process.env.UVB_LOCAL_VIDEO_FRAME_COUNT ?? "8",
  10
);
const DEFAULT_VIDEO_FRAME_MAX_WIDTH = Number.parseInt(
  process.env.UVB_LOCAL_VIDEO_FRAME_MAX_WIDTH ?? "960",
  10
);
const DEFAULT_VIDEO_DIRECT_MAX_MB = Number.parseInt(
  process.env.UVB_LOCAL_VIDEO_DIRECT_MAX_MB ?? "500",
  10
);
const MODEL_MEDIA_HOST_DIR = path.resolve(
  process.env.UVB_MODEL_MEDIA_HOST_DIR ?? path.join(process.cwd(), ".uvb", "model-media")
);
const MODEL_MEDIA_CONTAINER_DIR = (process.env.UVB_MODEL_MEDIA_CONTAINER_DIR ?? "/uvb-media").replace(/\/+$/, "");

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  | { type: "video_url"; video_url: { url: string } };

interface StoryboardFrame {
  index: number;
  timestamp: string;
  dataUrl: string;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function runProcess(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

function sanitizeMediaExtension(extension: string) {
  const cleanExtension = String(extension || ".mp4").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return cleanExtension.startsWith(".") && cleanExtension.length > 1 ? cleanExtension : ".mp4";
}

async function writeModelMediaFile(buffer: Buffer, extension: string) {
  await mkdir(MODEL_MEDIA_HOST_DIR, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}${sanitizeMediaExtension(extension)}`;
  const hostPath = path.join(MODEL_MEDIA_HOST_DIR, fileName);
  await writeFile(hostPath, buffer);
  return {
    hostPath,
    containerUrl: `file://${MODEL_MEDIA_CONTAINER_DIR}/${fileName}`,
  };
}

async function probeDuration(inputPath: string) {
  try {
    const output = await runProcess("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);
    const duration = Number.parseFloat(output);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

function getSampleTimes(durationSeconds: number) {
  const frameCount = Number.isFinite(DEFAULT_VIDEO_FRAME_COUNT)
    ? Math.min(Math.max(DEFAULT_VIDEO_FRAME_COUNT, 1), 16)
    : 8;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [1];

  const usableCount = Math.min(frameCount, Math.max(1, Math.floor(durationSeconds)));
  if (usableCount === 1) {
    return [Math.max(0, Math.min(durationSeconds / 2, durationSeconds - 0.1))];
  }

  return Array.from({ length: usableCount }, (_, index) => {
    const time = ((index + 1) * durationSeconds) / (usableCount + 1);
    return Math.max(0, Math.min(time, durationSeconds - 0.1));
  });
}

async function extractFrames(inputPath: string, tempDir: string, durationSeconds: number) {
  const maxWidth =
    Number.isFinite(DEFAULT_VIDEO_FRAME_MAX_WIDTH) && DEFAULT_VIDEO_FRAME_MAX_WIDTH >= 320
      ? DEFAULT_VIDEO_FRAME_MAX_WIDTH
      : 960;
  const frames: StoryboardFrame[] = [];

  for (const [index, time] of getSampleTimes(durationSeconds).entries()) {
    const framePath = path.join(tempDir, `frame-${index + 1}.jpg`);
    try {
      await runProcess("ffmpeg", [
        "-y",
        "-ss",
        String(time),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${maxWidth}:-2:force_original_aspect_ratio=decrease`,
        "-q:v",
        "5",
        framePath,
      ]);
      const frameBytes = await readFile(framePath);
      frames.push({
        index: index + 1,
        timestamp: formatTimestamp(time),
        dataUrl: `data:image/jpeg;base64,${frameBytes.toString("base64")}`,
      });
    } catch {
      // Individual frames can fail on odd codecs; keep the rest of the storyboard.
    }
  }

  return frames;
}

async function extractStoryboardSheet(inputPath: string, tempDir: string, durationSeconds: number) {
  try {
    const frameCount = Number.isFinite(DEFAULT_VIDEO_FRAME_COUNT)
      ? Math.min(Math.max(DEFAULT_VIDEO_FRAME_COUNT, 1), 16)
      : 8;
    const maxWidth =
      Number.isFinite(DEFAULT_VIDEO_FRAME_MAX_WIDTH) && DEFAULT_VIDEO_FRAME_MAX_WIDTH >= 320
        ? DEFAULT_VIDEO_FRAME_MAX_WIDTH
        : 960;
    const columns = Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / columns);
    const interval = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.max(durationSeconds / frameCount, 0.1)
      : 1;
    const sheetPath = path.join(tempDir, "storyboard-sheet.jpg");

    await runProcess("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `fps=1/${interval},scale=${Math.floor(maxWidth / columns)}:-2:force_original_aspect_ratio=decrease,tile=${columns}x${rows}:margin=12:padding=8:color=black,scale=${maxWidth}:-2`,
      "-frames:v",
      "1",
      "-q:v",
      "5",
      sheetPath,
    ]);

    const sheetBytes = await readFile(sheetPath);
    return `data:image/jpeg;base64,${sheetBytes.toString("base64")}`;
  } catch {
    return "";
  }
}

async function transcribeAudio(audioPath: string) {
  try {
    const audioBytes = await readFile(audioPath);
    const payload = new FormData();
    payload.append("file", new Blob([audioBytes], { type: "audio/mpeg" }), "video-audio.mp3");
    payload.append("model", DEFAULT_STT_MODEL);
    payload.append("language", process.env.UVB_STT_LANGUAGE ?? "en");
    payload.append("response_format", process.env.UVB_STT_RESPONSE_FORMAT ?? "json");
    payload.append("temperature", process.env.UVB_STT_TEMPERATURE ?? "0");
    payload.append("prompt", DEFAULT_STT_PROMPT);

    const response = await fetch(DEFAULT_STT_URL, { method: "POST", body: payload });
    const rawText = await response.text();
    if (!response.ok) {
      return `[Video audio transcription failed: STT returned ${response.status}: ${rawText || response.statusText}]`;
    }

    try {
      const data = JSON.parse(rawText) as { text?: string };
      return data.text?.trim() || rawText.trim();
    } catch {
      return rawText.trim();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transcription error.";
    return `[Video audio transcription failed: ${message}]`;
  }
}

async function askVideoModel({
  fileName,
  durationSeconds,
  transcript,
  frames,
  storyboardSheet,
  videoUrl,
  userPrompt,
}: {
  fileName: string;
  durationSeconds: number;
  transcript: string;
  frames: StoryboardFrame[];
  storyboardSheet: string;
  videoUrl: string;
  userPrompt: string;
}) {
  const runtime = await loadRuntimeSettings();
  const settings = runtime.modelSettings;
  const baseUrl = (settings.baseUrl || "http://127.0.0.1:8003/v1").replace(/\/+$/, "");
  const model = settings.model || "qwen36-35b-a3b-heretic-nvfp4";
  const apiKey = settings.apiKey || "uvb-local";
  const storyboard = frames.length
    ? frames.map((frame) => `Frame ${frame.index} at ${frame.timestamp}`).join(", ")
    : "No frames extracted.";
  const prompt = [
    `Local UVB video upload "${fileName}" was analyzed.`,
    durationSeconds ? `Duration: ${durationSeconds.toFixed(1)} seconds.` : "",
    `Sampled visual storyboard: ${storyboard}.`,
    transcript ? `Audio transcript:\n${transcript}` : "No audio transcript was available.",
    userPrompt
      ? `User instruction: ${userPrompt}`
      : "User instruction: Describe the essence of this video, including visual progression, notable objects/actions, mood, scene changes, and anything uncertain.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const baseTextPart: ChatContentPart = { type: "text", text: prompt };
  const directContent: ChatContentPart[] = [
    baseTextPart,
  ];
  if (videoUrl) {
    directContent.push(
      {
        type: "text",
        text: "Watch the attached video directly. Use the transcript and sampled-frame timestamps as supporting context.",
      },
      { type: "video_url", video_url: { url: videoUrl } }
    );
  }
  const fallbackContent: ChatContentPart[] = [
    { type: "text", text: prompt },
  ];
  if (storyboardSheet) {
    fallbackContent.push({
      type: "text",
      text: "Fallback storyboard contact sheet containing the sampled video timeline.",
    });
    fallbackContent.push({
      type: "image_url",
      image_url: { url: storyboardSheet, detail: "auto" },
    });
  }

  async function requestAnalysis(content: ChatContentPart[]) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are KnightBot/Sophia inside UVB. Analyze uploaded videos from direct video when available, plus ordered frames and audio transcript as supporting evidence. Be vivid, useful, and explicit about uncertainty.",
        },
        { role: "user", content },
      ],
      temperature: settings.temperature,
      max_tokens: Math.max(settings.maxTokens || 0, 1600),
      stream: false,
      chat_template_kwargs: {
        enable_thinking: settings.enableThinking,
      },
    }),
    });
    const rawText = await response.text();
    let data: OpenAIChatResponse | null = null;

    try {
      data = rawText ? (JSON.parse(rawText) as OpenAIChatResponse) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error?.message ?? rawText ?? response.statusText;
      throw new Error(`Local model returned ${response.status}: ${message}`);
    }

    const contentText = data?.choices?.[0]?.message?.content?.trim();
    if (!contentText) throw new Error("Local model returned an empty video analysis.");
    return contentText;
  }

  if (!videoUrl) return requestAnalysis(fallbackContent);

  try {
    return await requestAnalysis(directContent);
  } catch (error) {
    if (!storyboardSheet) throw error;
    return requestAnalysis(fallbackContent);
  }
}

export async function POST(request: NextRequest) {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid video upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Video file is required." }, { status: 400 });
  }

  const userPrompt = String(form.get("prompt") || "").trim();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "uvb-local-video-"));
  const inputExtension = path.extname(file.name || "") || ".mp4";
  const inputPath = path.join(tempDir, `input${inputExtension}`);
  const audioPath = path.join(tempDir, "audio.mp3");
  let modelMediaPath = "";

  try {
    const inputBytes = Buffer.from(await file.arrayBuffer());
    await writeFile(inputPath, inputBytes);
    const directMaxBytes = (Number.isFinite(DEFAULT_VIDEO_DIRECT_MAX_MB) && DEFAULT_VIDEO_DIRECT_MAX_MB > 0
      ? DEFAULT_VIDEO_DIRECT_MAX_MB
      : 500) * 1024 * 1024;
    let videoUrl = "";
    if (inputBytes.length <= directMaxBytes) {
      const modelMedia = await writeModelMediaFile(inputBytes, inputExtension);
      modelMediaPath = modelMedia.hostPath;
      videoUrl = modelMedia.containerUrl;
    }
    const durationSeconds = await probeDuration(inputPath);
    let hasAudio = true;
    await runProcess("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "96k",
      audioPath,
    ]).catch(() => {
      hasAudio = false;
      return "";
    });

    const [transcript, frames, storyboardSheet] = await Promise.all([
      hasAudio ? transcribeAudio(audioPath) : Promise.resolve("No audio track was detected."),
      extractFrames(inputPath, tempDir, durationSeconds),
      extractStoryboardSheet(inputPath, tempDir, durationSeconds),
    ]);
    const analysis = await askVideoModel({
      fileName: file.name || "uploaded-video",
      durationSeconds,
      transcript,
      frames,
      storyboardSheet,
      videoUrl,
      userPrompt,
    });

    return NextResponse.json({
      analysis,
      durationSeconds,
      transcript,
      frames,
      frameCount: frames.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown video analysis error.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    if (modelMediaPath) {
      await rm(modelMediaPath, { force: true }).catch(() => undefined);
    }
  }
}
