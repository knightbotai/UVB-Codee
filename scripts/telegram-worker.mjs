import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
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
const uvbUrl = (process.env.UVB_PUBLIC_URL ?? "http://127.0.0.1:3010").replace(/\/+$/, "");
const telegramSendTextReplies = (process.env.TELEGRAM_SEND_TEXT_REPLIES ?? "true").toLowerCase() !== "false";
const telegramSendTtsReplies = (process.env.TELEGRAM_SEND_TTS_REPLIES ?? "true").toLowerCase() !== "false";
const telegramTtsVoice = process.env.TELEGRAM_TTS_VOICE || process.env.UVB_TTS_VOICE || "af_nova";
const telegramTextChunkChars = Number.parseInt(process.env.TELEGRAM_TEXT_CHUNK_CHARS ?? "3600", 10);
const telegramDocumentMaxChars = Number.parseInt(process.env.TELEGRAM_DOCUMENT_MAX_CHARS ?? "120000", 10);
const telegramTtsChunkChars = Number.parseInt(
  process.env.TELEGRAM_TTS_CHUNK_CHARS ?? process.env.TELEGRAM_TTS_MAX_CHARS ?? "4200",
  10
);
const telegramTtsMaxParts = Number.parseInt(process.env.TELEGRAM_TTS_MAX_PARTS ?? "6", 10);
const apiBase = token ? `https://api.telegram.org/bot${token}` : "";
const fileBase = token ? `https://api.telegram.org/file/bot${token}` : "";
const histories = new Map();

if (!token) {
  console.log("[uvb-telegram] TELEGRAM_BOT_TOKEN is not set. Worker is idle.");
  process.exit(0);
}

function isAllowed(chatId) {
  return !allowedChatId || String(chatId) === String(allowedChatId);
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

async function getFile(fileId) {
  return telegram("getFile", { file_id: fileId });
}

async function downloadTelegramFile(fileId) {
  const file = await getFile(fileId);
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

async function transcribeTelegramVoice(message) {
  const voice = message.voice ?? message.audio;
  if (!voice?.file_id) return "";

  await sendAction(message.chat.id, "typing");
  const file = await downloadTelegramFile(voice.file_id);

  const form = new FormData();
  form.append("file", file.blob, file.name || "telegram-voice.ogg");

  const sttResponse = await fetch(`${uvbUrl}/api/stt`, { method: "POST", body: form });
  const data = await sttResponse.json().catch(() => ({}));
  if (!sttResponse.ok || !data.text) {
    throw new Error(data.error ?? "Telegram voice transcription failed.");
  }

  return data.text;
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
  const file = await downloadTelegramFile(fileId);
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
  const file = await downloadTelegramFile(document.file_id);
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

  try {
    if (!text && (message.voice || message.audio)) {
      await sendMessage(chatId, "Voice received. Transcribing locally...");
      text = await transcribeTelegramVoice(message);
      logText = text;
    }

    if (!text && message.document && isTextDocument(message.document)) {
      text = await readTelegramTextDocument(message);
      logText = message.caption?.trim() || `[Telegram text document: ${message.document.file_name || "document"}]`;
    }

    if (!text && (message.photo || message.document)) {
      content = await buildTelegramImageContent(message);
      logText = message.caption?.trim() || "[Telegram image]";
    }

    if (!text && !content) {
      await sendMessage(chatId, "I received the message, but there was no text, voice, audio, image, or text document I can route yet.");
      return;
    }

    await sendAction(chatId, "typing");
    await sendMessage(chatId, "Working on it through UVB...");
    const answer = await askKnightBot(chatId, content || text, logText);
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
