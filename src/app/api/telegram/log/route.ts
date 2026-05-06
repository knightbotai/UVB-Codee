import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LOG_PATH = path.join(process.cwd(), ".uvb", "telegram-chats.json");

type TelegramLogMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  type: "text" | "voice" | "image" | "video";
};

type TelegramLogThread = {
  id: string;
  title: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  messages: TelegramLogMessage[];
};

type TelegramLogStore = {
  threads: TelegramLogThread[];
};

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeType(value: unknown): TelegramLogMessage["type"] {
  return value === "voice" || value === "image" || value === "video" ? value : "text";
}

async function readStore(): Promise<TelegramLogStore> {
  try {
    const parsed = JSON.parse(await readFile(LOG_PATH, "utf8")) as Partial<TelegramLogStore>;
    return {
      threads: Array.isArray(parsed.threads)
        ? parsed.threads.map((thread) => ({
            id: safeText(thread.id, `telegram:${thread.chatId ?? "unknown"}`),
            title: safeText(thread.title, "Telegram Chat"),
            chatId: safeText(thread.chatId, "unknown"),
            createdAt: typeof thread.createdAt === "number" ? thread.createdAt : Date.now(),
            updatedAt: typeof thread.updatedAt === "number" ? thread.updatedAt : Date.now(),
            messages: Array.isArray(thread.messages)
              ? thread.messages.map((message) => ({
                  id: safeText(message.id, `telegram-message-${Math.random().toString(36).slice(2)}`),
                  role: message.role === "assistant" ? "assistant" : "user",
                  content: safeText(message.content),
                  timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
                  type: safeType(message.type),
                }))
              : [],
          }))
        : [],
    };
  } catch {
    return { threads: [] };
  }
}

async function writeStore(store: TelegramLogStore) {
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await writeFile(LOG_PATH, JSON.stringify(store, null, 2), "utf8");
}

export async function GET() {
  return NextResponse.json(await readStore());
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    chatId?: unknown;
    chatTitle?: unknown;
    telegramMessageId?: unknown;
    userText?: unknown;
    assistantText?: unknown;
    messageType?: unknown;
    timestamp?: unknown;
  };
  const chatId = safeText(payload.chatId);
  const userText = safeText(payload.userText);
  const assistantText = safeText(payload.assistantText);
  if (!chatId || (!userText && !assistantText)) {
    return NextResponse.json({ error: "chatId and message text are required." }, { status: 400 });
  }

  const now = typeof payload.timestamp === "number" ? payload.timestamp : Date.now();
  const messageKey = safeText(payload.telegramMessageId, String(now));
  const threadId = `telegram:${chatId}`;
  const store = await readStore();
  let thread = store.threads.find((item) => item.id === threadId);

  if (!thread) {
    thread = {
      id: threadId,
      title: `Telegram: ${safeText(payload.chatTitle, chatId)}`,
      chatId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    store.threads.push(thread);
  }

  thread.title = `Telegram: ${safeText(payload.chatTitle, chatId)}`;
  thread.updatedAt = now;

  const nextMessages: TelegramLogMessage[] = [
    userText
      ? {
          id: `telegram:${chatId}:${messageKey}:user`,
          role: "user",
          content: userText,
          timestamp: now,
          type: safeType(payload.messageType),
        }
      : null,
    assistantText
      ? {
          id: `telegram:${chatId}:${messageKey}:assistant`,
          role: "assistant",
          content: assistantText,
          timestamp: now + 1,
          type: "text",
        }
      : null,
  ].filter((message): message is TelegramLogMessage => Boolean(message));

  for (const message of nextMessages) {
    if (!thread.messages.some((existing) => existing.id === message.id)) {
      thread.messages.push(message);
    }
  }
  thread.messages.sort((a, b) => a.timestamp - b.timestamp);
  store.threads.sort((a, b) => b.updatedAt - a.updatedAt);

  await writeStore(store);
  return NextResponse.json({ ok: true, thread });
}
