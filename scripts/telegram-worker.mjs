import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvFile() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;

  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

await loadEnvFile();

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
const telegramApiOrigin = (process.env.TELEGRAM_API_ORIGIN ?? "https://api.telegram.org").replace(/\/+$/, "");
const telegramFileOrigin = (process.env.TELEGRAM_FILE_ORIGIN ?? telegramApiOrigin).replace(/\/+$/, "");
const telegramCloudDownloadMaxMb = Number.parseInt(process.env.TELEGRAM_CLOUD_DOWNLOAD_MAX_MB ?? "20", 10);
const uvbUrl = (process.env.UVB_PUBLIC_URL ?? "http://127.0.0.1:3010").replace(/\/+$/, "");
const telegramSendTextReplies = (process.env.TELEGRAM_SEND_TEXT_REPLIES ?? "true").toLowerCase() !== "false";
const telegramSendTtsReplies = (process.env.TELEGRAM_SEND_TTS_REPLIES ?? "true").toLowerCase() !== "false";
const telegramTtsVoice = process.env.TELEGRAM_TTS_VOICE || process.env.UVB_TTS_VOICE || "af_nova";
const telegramTextChunkChars = Number.parseInt(process.env.TELEGRAM_TEXT_CHUNK_CHARS ?? "3600", 10);
const telegramDocumentMaxChars = Number.parseInt(process.env.TELEGRAM_DOCUMENT_MAX_CHARS ?? "120000", 10);
const telegramVideoMaxMb = Number.parseInt(process.env.TELEGRAM_VIDEO_MAX_MB ?? "500", 10);
const telegramVideoFrameCount = Number.parseInt(process.env.TELEGRAM_VIDEO_FRAME_COUNT ?? "6", 10);
const telegramVideoFrameMaxWidth = Number.parseInt(process.env.TELEGRAM_VIDEO_FRAME_MAX_WIDTH ?? "960", 10);
const telegramTtsChunkChars = Number.parseInt(
  process.env.TELEGRAM_TTS_CHUNK_CHARS ?? process.env.TELEGRAM_TTS_MAX_CHARS ?? "4200",
  10
);
const telegramTtsMaxParts = Number.parseInt(process.env.TELEGRAM_TTS_MAX_PARTS ?? "6", 10);
const apiBase = token ? `${telegramApiOrigin}/bot${token}` : "";
const fileBase = token ? `${telegramFileOrigin}/file/bot${token}` : "";
const histories = new Map();

if (!token) {
  console.log("[uvb-telegram] TELEGRAM_BOT_TOKEN is not set. Worker is idle.");
  process.exit(0);
}

function isAllowed(chatId) {
  return !allowedChatId || String(chatId) === String(allowedChatId);
}

function getTelegramChatTitle(chat) {
  return (
    [chat?.first_name, chat?.last_name].filter(Boolean).join(" ").trim() ||
    chat?.username ||
    chat?.title ||
    String(chat?.id || "Telegram")
  );
}

async function logTelegramChatTurn(message, userText, assistantText, messageType = "text") {
  try {
    await fetch(`${uvbUrl}/api/telegram/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: String(message.chat.id),
        chatTitle: getTelegramChatTitle(message.chat),
        telegramMessageId: message.message_id,
        userText,
        assistantText,
        messageType,
        timestamp: (message.date ? message.date * 1000 : Date.now()),
      }),
    });
  } catch (error) {
    console.error(
      "[uvb-telegram] Could not write local Telegram chat log:",
      error instanceof Error ? error.message : error
    );
  }
}

function parseAgentCommand(text) {
  const match = text.match(/^\/(research|browser|code|computer)(?:@\w+)?\s+([\s\S]+)/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  const prompt = match[2].trim();
  if (!prompt) return null;
  return {
    kind:
      command === "browser"
        ? "browser-use"
        : command === "code"
          ? "coding"
          : command === "computer"
            ? "computer-use"
            : "deep-research",
    prompt,
  };
}

async function queueAgentJobFromTelegram(message, command) {
  const response = await fetch(`${uvbUrl}/api/agent/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create",
      kind: command.kind,
      title: `Telegram ${command.kind.replace("-", " ")}`,
      prompt: command.prompt,
      requestedBy: "telegram",
      settings: {
        approvalMode: "ask-every-time",
        workspaceRoot: root,
        allowedDomains: "github.com, npmjs.com, docs.kilo.ai, kilo.ai, microsoft.com, openai.com",
        blockedPaths: ".env*, **/node_modules/**, **/.git/**, C:\\Users\\*\\AppData\\Roaming\\Telegram Desktop\\tdata",
        codingProvider: "local-uvb",
        providerBaseUrl: "",
        preferFreeModels: true,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.job) {
    throw new Error(data.error ?? `Agent job queue returned ${response.status}`);
  }
  return data.job;
}

async function telegram(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description ?? `Telegram ${method} failed with ${response.status}`);
  }
  return data.result;
}

async function telegramForm(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    body: payload,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.description ?? `Telegram ${method} failed with ${response.status}`);
  }
  return data.result;
}

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function splitTextForTelegram(text) {
  const cleanText = text.trim();
  if (!cleanText) return [];

  const chunkChars = Number.isFinite(telegramTextChunkChars) && telegramTextChunkChars > 1000
    ? Math.min(telegramTextChunkChars, 3900)
    : 3600;
  const chunks = [];
  let remaining = cleanText;

  while (remaining.length) {
    if (remaining.length <= chunkChars) {
      chunks.push(remaining);
      break;
    }

    const windowText = remaining.slice(0, chunkChars);
    const paragraphBreak = Math.max(windowText.lastIndexOf("\n\n"), windowText.lastIndexOf("\r\n\r\n"));
    const sentenceBreak = Math.max(
      windowText.lastIndexOf(". "),
      windowText.lastIndexOf("! "),
      windowText.lastIndexOf("? ")
    );
    const lineBreak = windowText.lastIndexOf("\n");
    const spaceBreak = windowText.lastIndexOf(" ");
    const breakAt =
      paragraphBreak > Math.floor(chunkChars * 0.35)
        ? paragraphBreak + 2
        : sentenceBreak > Math.floor(chunkChars * 0.45)
          ? sentenceBreak + 1
          : lineBreak > Math.floor(chunkChars * 0.5)
            ? lineBreak
            : spaceBreak > Math.floor(chunkChars * 0.5)
              ? spaceBreak
              : chunkChars;

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  return chunks.filter(Boolean);
}

async function sendLongMessage(chatId, text) {
  const parts = splitTextForTelegram(text);
  for (const [index, part] of parts.entries()) {
    const prefix = parts.length > 1 ? `Part ${index + 1}/${parts.length}\n\n` : "";
    await sendMessage(chatId, `${prefix}${part}`);
  }
}

async function sendAction(chatId, action) {
  return telegram("sendChatAction", { chat_id: chatId, action }).catch(() => undefined);
}

function isTelegramCloudApi() {
  return telegramApiOrigin === "https://api.telegram.org";
}

function getAttachmentSizeMb(attachment) {
  const fileSize = Number(attachment?.file_size || 0);
  return fileSize > 0 ? fileSize / 1024 / 1024 : 0;
}

function assertTelegramDownloadAllowed(attachment) {
  const fileSizeMb = getAttachmentSizeMb(attachment);
  const cloudMaxMb = Number.isFinite(telegramCloudDownloadMaxMb) && telegramCloudDownloadMaxMb > 0
    ? telegramCloudDownloadMaxMb
    : 20;
  if (isTelegramCloudApi() && fileSizeMb > cloudMaxMb) {
    throw new Error(
      `Telegram cloud Bot API can only download files up to ${cloudMaxMb} MB. This file is ${fileSizeMb.toFixed(1)} MB. To process larger Telegram videos, run a local Telegram Bot API server and set TELEGRAM_API_ORIGIN/TELEGRAM_FILE_ORIGIN to it, or send a compressed clip under ${cloudMaxMb} MB.`
    );
  }
}

async function getFile(fileId, attachment) {
  assertTelegramDownloadAllowed(attachment);
  try {
    return await telegram("getFile", { file_id: fileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram getFile error.";
    if (/file is too big/i.test(message) && isTelegramCloudApi()) {
      const fileSizeMb = getAttachmentSizeMb(attachment);
      const sizeText = fileSizeMb ? ` This file is ${fileSizeMb.toFixed(1)} MB.` : "";
      throw new Error(
        `Telegram cloud Bot API refused the download because the file is too big.${sizeText} Use a local Telegram Bot API server for large videos, or send a compressed clip under ${telegramCloudDownloadMaxMb} MB.`
      );
    }
    throw error;
  }
}

async function downloadTelegramFile(fileId, attachment) {
  const file = await getFile(fileId, attachment);
  if (file.file_path && path.isAbsolute(file.file_path) && existsSync(file.file_path)) {
    const bytes = await readFile(file.file_path);
    return {
      blob: new Blob([bytes], { type: attachment?.mime_type || "application/octet-stream" }),
      name: path.basename(file.file_path),
      path: file.file_path,
    };
  }

  const response = await fetch(`${fileBase}/${file.file_path}`);
  if (!response.ok) throw new Error(`Could not download Telegram file: ${response.status}`);
  return {
    blob: await response.blob(),
    name: path.basename(file.file_path ?? "telegram-file"),
    path: file.file_path,
  };
}

async function blobToDataUrl(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mediaType = blob.type || "application/octet-stream";
  return `data:${mediaType};base64,${buffer.toString("base64")}`;
}

function isTextDocument(document) {
  const mimeType = String(document?.mime_type || "").toLowerCase();
  const name = String(document?.file_name || "").toLowerCase();
  const extension = path.extname(name);
  const textExtensions = new Set([
    ".txt",
    ".md",
    ".markdown",
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".log",
    ".xml",
    ".yaml",
    ".yml",
    ".ini",
    ".cfg",
    ".conf",
    ".toml",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".ps1",
    ".bat",
    ".cmd",
    ".sh",
    ".css",
    ".html",
    ".sql",
  ]);

  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/x-ndjson" ||
    mimeType === "application/xml" ||
    mimeType === "application/yaml" ||
    textExtensions.has(extension)
  );
}

function isVideoDocument(document) {
  const mimeType = String(document?.mime_type || "").toLowerCase();
  const name = String(document?.file_name || "").toLowerCase();
  const extension = path.extname(name);
  return (
    mimeType.startsWith("video/") ||
    [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"].includes(extension)
  );
}

function getVideoAttachment(message) {
  if (message.video?.file_id) return message.video;
  if (message.video_note?.file_id) return message.video_note;
  if (message.animation?.file_id) return message.animation;
  if (message.document?.file_id && isVideoDocument(message.document)) return message.document;
  return null;
}

function assertVideoSizeAllowed(video) {
  const maxBytes = (Number.isFinite(telegramVideoMaxMb) && telegramVideoMaxMb > 1 ? telegramVideoMaxMb : 500) * 1024 * 1024;
  const fileSize = Number(video?.file_size || 0);
  if (fileSize > maxBytes) {
    throw new Error(`Telegram video is ${(fileSize / 1024 / 1024).toFixed(1)} MB, above the ${telegramVideoMaxMb} MB local routing limit.`);
  }
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-800)}`));
    });
  });
}

function runFfprobe(args) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    ffprobe.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    ffprobe.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffprobe.on("error", reject);
    ffprobe.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`ffprobe exited with ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function probeVideoDuration(inputPath, fallbackDuration) {
  if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) return fallbackDuration;
  try {
    const output = await runFfprobe([
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

function getVideoSampleTimes(durationSeconds) {
  const frameCount = Number.isFinite(telegramVideoFrameCount)
    ? Math.min(Math.max(telegramVideoFrameCount, 1), 12)
    : 6;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [1];

  const usableCount = Math.min(frameCount, Math.max(1, Math.floor(durationSeconds)));
  if (usableCount === 1) return [Math.max(0, Math.min(durationSeconds / 2, durationSeconds - 0.1))];

  return Array.from({ length: usableCount }, (_, index) => {
    const time = ((index + 1) * durationSeconds) / (usableCount + 1);
    return Math.max(0, Math.min(time, durationSeconds - 0.1));
  });
}

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "unknown";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

async function extractVideoFrames(inputPath, tempDir, durationSeconds) {
  const maxWidth = Number.isFinite(telegramVideoFrameMaxWidth) && telegramVideoFrameMaxWidth >= 320
    ? telegramVideoFrameMaxWidth
    : 960;
  const times = getVideoSampleTimes(durationSeconds);
  const frames = [];

  for (const [index, time] of times.entries()) {
    const framePath = path.join(tempDir, `frame-${index + 1}.jpg`);
    try {
      await runFfmpeg([
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown frame extraction error";
      console.error(`[uvb-telegram] Could not extract video frame ${index + 1}: ${message}`);
    }
  }

  return frames;
}

async function transcribeTelegramVoice(message) {
  const voice = message.voice ?? message.audio;
  if (!voice?.file_id) return "";

  await sendAction(message.chat.id, "typing");
  const file = await downloadTelegramFile(voice.file_id, voice);
  return transcribeAudioBlob(file.blob, file.name || "telegram-voice.ogg");
}

async function buildTelegramImageContent(message) {
  const caption = message.caption?.trim();
  const prompt = caption || "Describe this image in detail and answer any visible question in it.";

  const photos = message.photo ?? [];
  const largest = photos[photos.length - 1];
  const document = message.document;
  const imageDocument =
    document?.file_id && typeof document.mime_type === "string" && document.mime_type.startsWith("image/");
  const fileId = largest?.file_id || (imageDocument ? document.file_id : "");

  if (!fileId) return null;

  await sendAction(message.chat.id, "upload_photo");
  const file = await downloadTelegramFile(fileId, largest || document);
  const dataUrl = await blobToDataUrl(
    file.blob.type ? file.blob : new Blob([await file.blob.arrayBuffer()], { type: document?.mime_type || "image/jpeg" })
  );

  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
  ];
}

async function readTelegramTextDocument(message) {
  const document = message.document;
  if (!document?.file_id || !isTextDocument(document)) return "";

  await sendAction(message.chat.id, "typing");
  const file = await downloadTelegramFile(document.file_id, document);
  const rawText = await file.blob.text();
  const maxChars = Number.isFinite(telegramDocumentMaxChars) && telegramDocumentMaxChars > 1000
    ? telegramDocumentMaxChars
    : 120000;
  const truncated = rawText.length > maxChars;
  const content = truncated ? rawText.slice(0, maxChars) : rawText;
  const caption = message.caption?.trim();
  const fileName = document.file_name || file.name || "telegram-document.txt";
  const intro = caption
    ? `Telegram text document "${fileName}" was sent with this instruction: ${caption}`
    : `Telegram text document "${fileName}" was sent. Please read it and respond helpfully.`;
  const ending = truncated
    ? `\n\n[Document was truncated at ${maxChars} characters before routing to UVB.]`
    : "";

  return `${intro}\n\n--- BEGIN ${fileName} ---\n${content}\n--- END ${fileName} ---${ending}`;
}

async function transcribeAudioBlob(blob, fileName) {
  const form = new FormData();
  form.append("file", blob, fileName || "telegram-audio.mp3");

  const sttResponse = await fetch(`${uvbUrl}/api/stt`, { method: "POST", body: form });
  const data = await sttResponse.json().catch(() => ({}));
  if (!sttResponse.ok || !data.text) {
    throw new Error(data.error ?? "Telegram media transcription failed.");
  }

  return data.text;
}

async function buildTelegramVideoContent(message) {
  const video = getVideoAttachment(message);
  if (!video?.file_id) return null;

  assertVideoSizeAllowed(video);
  await sendAction(message.chat.id, "typing");
  const file = await downloadTelegramFile(video.file_id, video);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "uvb-telegram-video-"));
  const inputExtension = path.extname(file.name || file.path || "") || ".mp4";
  const inputPath = path.join(tempDir, `input${inputExtension}`);
  const audioPath = path.join(tempDir, "audio.mp3");

  try {
    await writeFile(inputPath, Buffer.from(await file.blob.arrayBuffer()));
    const durationSeconds = await probeVideoDuration(inputPath, Number(video.duration || 0));
    await runFfmpeg(["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "96k", audioPath]);

    let transcript = "";
    try {
      const audioBytes = await readFile(audioPath);
      transcript = await transcribeAudioBlob(new Blob([audioBytes], { type: "audio/mpeg" }), "telegram-video-audio.mp3");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown video transcription error.";
      transcript = `[Video audio transcription failed: ${messageText}]`;
    }

    const frames = await extractVideoFrames(inputPath, tempDir, durationSeconds);

    const caption = message.caption?.trim();
    const videoName = message.document?.file_name || file.name || "telegram-video";
    const storyboard = frames.length
      ? `Sampled visual storyboard: ${frames.map((frame) => `Frame ${frame.index} at ${frame.timestamp}`).join(", ")}.`
      : "No visual frames could be extracted.";
    const metadata = [
      `Telegram video "${videoName}" was sent.`,
      caption ? `Sender instruction/caption: ${caption}` : "",
      durationSeconds ? `Duration: ${durationSeconds.toFixed(1)} seconds.` : "",
      video.width && video.height ? `Resolution: ${video.width}x${video.height}.` : "",
      storyboard,
      transcript ? `Audio transcript:\n${transcript}` : "No audio transcript was available.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const prompt = `${metadata}\n\nPlease analyze the essence of this video using the ordered sampled frames as a timeline and the audio transcript as narrative context. Call out visual progression, notable objects/actions, mood, scene changes, and anything uncertain.`;

    if (!frames.length) return prompt;

    return [
      { type: "text", text: prompt },
      ...frames.flatMap((frame) => [
        { type: "text", text: `Reference frame ${frame.index} at ${frame.timestamp}.` },
        { type: "image_url", image_url: { url: frame.dataUrl, detail: "auto" } },
      ]),
    ];
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function splitTextForSpeech(text) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return [];

  const chunkChars = Number.isFinite(telegramTtsChunkChars) && telegramTtsChunkChars > 400
    ? telegramTtsChunkChars
    : 4200;
  const maxParts = Number.isFinite(telegramTtsMaxParts) && telegramTtsMaxParts > 0
    ? telegramTtsMaxParts
    : 6;
  const chunks = [];
  let remaining = cleanText;

  while (remaining.length && chunks.length < maxParts) {
    if (remaining.length <= chunkChars) {
      chunks.push(remaining);
      break;
    }

    const windowText = remaining.slice(0, chunkChars);
    const sentenceBreak = Math.max(
      windowText.lastIndexOf(". "),
      windowText.lastIndexOf("! "),
      windowText.lastIndexOf("? "),
      windowText.lastIndexOf("\n")
    );
    const commaBreak = Math.max(windowText.lastIndexOf(", "), windowText.lastIndexOf("; "), windowText.lastIndexOf(": "));
    const spaceBreak = windowText.lastIndexOf(" ");
    const breakAt =
      sentenceBreak > Math.floor(chunkChars * 0.45)
        ? sentenceBreak + 1
        : commaBreak > Math.floor(chunkChars * 0.55)
          ? commaBreak + 1
          : spaceBreak > Math.floor(chunkChars * 0.5)
            ? spaceBreak
            : chunkChars;

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  if (remaining.length && chunks.length === maxParts) {
    chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} The rest of this response is available in the text reply.`;
  }

  return chunks.filter(Boolean);
}

async function synthesizeSpeech(text) {
  const speechText = text.trim();
  if (!speechText) return null;

  const response = await fetch(`${uvbUrl}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: speechText,
      voice: telegramTtsVoice,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(`UVB TTS returned ${response.status}: ${rawText || response.statusText}`);
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") || "audio/wav",
  };
}

async function sendSpeech(chatId, text) {
  if (!telegramSendTtsReplies) return;

  const parts = splitTextForSpeech(text);
  for (const [index, part] of parts.entries()) {
    await sendAction(chatId, "upload_voice");
    const audio = await synthesizeSpeech(part);
    if (!audio) continue;

    const extension = audio.contentType.includes("mpeg")
      ? "mp3"
      : audio.contentType.includes("ogg")
        ? "ogg"
        : "wav";
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("audio", audio.blob, `sophia-${Date.now()}-${index + 1}.${extension}`);
    form.append("title", parts.length > 1 ? `Sophia Knight ${index + 1}/${parts.length}` : "Sophia Knight");
    form.append("performer", "UVB Kokoro");
    if (parts.length > 1) {
      form.append("caption", `Part ${index + 1} of ${parts.length}`);
    }
    await telegramForm("sendAudio", form);
  }
}

async function askKnightBot(chatId, content, logText) {
  const history = histories.get(chatId) ?? [];
  const userMessage = { role: "user", content };
  const messages = [...history, userMessage].slice(-20);
  console.log(`[uvb-telegram] Routing chat ${chatId} to UVB: ${logText.slice(0, 120)}`);

  const response = await fetch(`${uvbUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.content) {
    throw new Error(data.error ?? "UVB chat returned no response.");
  }

  histories.set(
    chatId,
    [...history, { role: "user", content: logText }, { role: "assistant", content: data.content }].slice(-20)
  );
  return data.content;
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  console.log(
    `[uvb-telegram] Message ${message.message_id ?? "?"} from chat ${chatId} (${message.chat?.type ?? "unknown"})`
  );

  if (!isAllowed(chatId)) {
    console.log(`[uvb-telegram] Rejected chat ${chatId}; allowed chat is ${allowedChatId}.`);
    await sendMessage(chatId, "This UVB bridge is locked to the configured allowed chat ID.");
    return;
  }

  let text = message.text?.trim() ?? "";
  let content = null;
  let logText = text;
  let messageType = "text";

  try {
    if (!text && (message.voice || message.audio)) {
      await sendMessage(chatId, "Voice received. Transcribing locally...");
      text = await transcribeTelegramVoice(message);
      logText = text;
      messageType = "voice";
    }

    if (!text && getVideoAttachment(message)) {
      await sendMessage(chatId, "Video received. Extracting audio and a reference frame locally...");
      content = await buildTelegramVideoContent(message);
      logText = message.caption?.trim() || "[Telegram video]";
      messageType = "video";
    }

    if (!text && message.document && isTextDocument(message.document)) {
      text = await readTelegramTextDocument(message);
      logText = message.caption?.trim() || `[Telegram text document: ${message.document.file_name || "document"}]`;
      messageType = "text";
    }

    if (!text && (message.photo || message.document)) {
      content = await buildTelegramImageContent(message);
      logText = message.caption?.trim() || "[Telegram image]";
      messageType = "image";
    }

    const agentCommand = text ? parseAgentCommand(text) : null;
    if (agentCommand) {
      await sendAction(chatId, "typing");
      const job = await queueAgentJobFromTelegram(message, agentCommand);
      const answer = [
        `Queued ${job.kind} job for supervised execution.`,
        `Status: ${job.status}`,
        `Job ID: ${job.id}`,
        "Open UVB Settings > Agent Tools to approve, cancel, or inspect the execution plan.",
      ].join("\n");
      await logTelegramChatTurn(message, text, answer, "text");
      await sendLongMessage(chatId, answer);
      return;
    }

    if (!text && !content) {
      await sendMessage(chatId, "I received the message, but there was no text, voice, audio, video, image, or text document I can route yet.");
      return;
    }

    await sendAction(chatId, "typing");
    await sendMessage(chatId, "Working on it through UVB...");
    const answer = await askKnightBot(chatId, content || text, logText);
    await logTelegramChatTurn(message, logText, answer, messageType);
    if (telegramSendTextReplies) {
      await sendLongMessage(chatId, answer);
    }
    try {
      await sendSpeech(chatId, answer);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unknown TTS error.";
      console.error(`[uvb-telegram] TTS reply failed for chat ${chatId}: ${messageText}`);
      if (!telegramSendTextReplies) {
        await sendLongMessage(chatId, answer);
      }
    }
    console.log(`[uvb-telegram] Replied to chat ${chatId}.`);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown Telegram bridge error.";
    console.error(`[uvb-telegram] Message handling failed for chat ${chatId}: ${messageText}`);
    await sendMessage(chatId, `UVB bridge error: ${messageText}`);
  }
}

let offset = 0;
console.log(`[uvb-telegram] Polling Telegram for UVB at ${uvbUrl}`);

for (;;) {
  try {
    const updates = await telegram("getUpdates", {
      offset,
      timeout: 30,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      if (update.message) {
        await handleMessage(update.message);
      }
    }
  } catch (error) {
    console.error("[uvb-telegram]", error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
