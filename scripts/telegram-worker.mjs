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

async function sendMessage(chatId, text) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
}

async function sendAction(chatId, action) {
  return telegram("sendChatAction", { chat_id: chatId, action }).catch(() => undefined);
}

async function getFile(fileId) {
  return telegram("getFile", { file_id: fileId });
}

async function transcribeTelegramVoice(message) {
  const voice = message.voice ?? message.audio;
  if (!voice?.file_id) return "";

  await sendAction(message.chat.id, "typing");
  const file = await getFile(voice.file_id);
  const response = await fetch(`${fileBase}/${file.file_path}`);
  if (!response.ok) throw new Error(`Could not download Telegram audio: ${response.status}`);

  const form = new FormData();
  form.append("file", await response.blob(), path.basename(file.file_path ?? "telegram-voice.ogg"));

  const sttResponse = await fetch(`${uvbUrl}/api/stt`, { method: "POST", body: form });
  const data = await sttResponse.json().catch(() => ({}));
  if (!sttResponse.ok || !data.text) {
    throw new Error(data.error ?? "Telegram voice transcription failed.");
  }

  return data.text;
}

async function describeTelegramPhoto(message) {
  const photos = message.photo ?? [];
  if (!photos.length) return "";
  const largest = photos[photos.length - 1];
  const caption = message.caption?.trim();
  return caption
    ? `[Telegram photo received. Caption: ${caption}]`
    : "[Telegram photo received. Vision routing is queued; describe or ask what to do with it.]";
}

async function askKnightBot(chatId, text) {
  const history = histories.get(chatId) ?? [];
  const messages = [...history, { role: "user", content: text }].slice(-20);

  const response = await fetch(`${uvbUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.content) {
    throw new Error(data.error ?? "UVB chat returned no response.");
  }

  histories.set(chatId, [...messages, { role: "assistant", content: data.content }].slice(-20));
  return data.content;
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  if (!isAllowed(chatId)) {
    await sendMessage(chatId, "This UVB bridge is locked to the configured allowed chat ID.");
    return;
  }

  let text = message.text?.trim() ?? "";

  try {
    if (!text && (message.voice || message.audio)) {
      await sendMessage(chatId, "Voice received. Transcribing locally...");
      text = await transcribeTelegramVoice(message);
    }

    if (!text && message.photo) {
      text = await describeTelegramPhoto(message);
    }

    if (!text) {
      await sendMessage(chatId, "I received the message, but there was no text, voice, or photo I can route yet.");
      return;
    }

    await sendAction(chatId, "typing");
    await sendMessage(chatId, "Working on it through UVB...");
    const answer = await askKnightBot(chatId, text);
    await sendMessage(chatId, answer.slice(0, 3900));
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown Telegram bridge error.";
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
