import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LOG_PATH = path.join(process.cwd(), ".uvb", "telegram-chats.json");
const MAX_STORED_MESSAGE_CHARS = 12_000;
const MAX_STORED_THREAD_MESSAGES = 180;
const COMPACTION_MESSAGE_PREFIX = "[UVB Telegram thread compacted]";

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

function compactText(value: string, maxChars = MAX_STORED_MESSAGE_CHARS) {
  if (value.length <= maxChars) return value;
  const headChars = Math.floor(maxChars * 0.45);
  const tailChars = Math.floor(maxChars * 0.55);
  return `${value.slice(0, headChars).trim()}\n\n[...middle compacted to keep Telegram chat logs responsive...]\n\n${value
    .slice(-tailChars)
    .trim()}`;
}

function summarizeMessages(messages: TelegramLogMessage[]) {
  return messages
    .slice(-30)
    .map((message) => {
      const compact = message.content.replace(/\s+/g, " ").slice(0, 180);
      return `- ${message.role.toUpperCase()} ${new Date(message.timestamp).toLocaleString()}: ${compact}`;
    })
    .join("\n");
}

function compactThread(thread: TelegramLogThread): TelegramLogThread {
  const compactedMessages = thread.messages
    .map((message) => ({
      ...message,
      content: compactText(message.content),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (compactedMessages.length <= MAX_STORED_THREAD_MESSAGES) {
    return { ...thread, messages: compactedMessages };
  }

  const existingSummaries = compactedMessages.filter((message) =>
    message.content.startsWith(COMPACTION_MESSAGE_PREFIX)
  );
  const normalMessages = compactedMessages.filter(
    (message) => !message.content.startsWith(COMPACTION_MESSAGE_PREFIX)
  );
  const keepCount = Math.max(40, MAX_STORED_THREAD_MESSAGES - 1);
  const olderMessages = normalMessages.slice(0, -keepCount);
  const keptMessages = normalMessages.slice(-keepCount);
  const previousSummary = existingSummaries.at(-1)?.content ?? "";
  const summaryContent = compactText(
    [
      `${COMPACTION_MESSAGE_PREFIX}: ${olderMessages.length} older message(s) were distilled so this thread stays usable in UVB.`,
      previousSummary ? `Previous compacted context:\n${previousSummary}` : "",
      olderMessages.length ? `Recent older context before compaction:\n${summarizeMessages(olderMessages)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  );
  const summaryMessage: TelegramLogMessage = {
    id: `${thread.id}:compaction-summary`,
    role: "assistant",
    content: summaryContent,
    timestamp: keptMessages[0]?.timestamp ? keptMessages[0].timestamp - 1 : Date.now(),
    type: "text",
  };

  return {
    ...thread,
    messages: [summaryMessage, ...keptMessages].sort((a, b) => a.timestamp - b.timestamp),
  };
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
                  role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
                  content: compactText(safeText(message.content)),
                  timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
                  type: safeType(message.type),
                }))
              : [],
          }))
          .map(compactThread)
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
  const compactedThread = compactThread(thread);
  thread.messages = compactedThread.messages;
  store.threads.sort((a, b) => b.updatedAt - a.updatedAt);

  await writeStore(store);
  return NextResponse.json({ ok: true, thread });
}
