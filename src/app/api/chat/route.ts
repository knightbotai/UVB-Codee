import { NextRequest, NextResponse } from "next/server";
import { loadRuntimeSettings } from "@/lib/serverRuntimeSettings";
import {
  appendNameAliasSystemNote,
  applyNameAliases,
  normalizeAliasRules,
  type AliasRule,
} from "@/lib/nameAliases";
import { appendCurrentUserSystemNote } from "@/lib/currentUserContext";
import {
  appendRetrievedMemorySystemNote,
  searchMemoryEntries,
  upsertConversationMemory,
  type MemorySource,
} from "@/lib/serverMemory";
import { matchReferenceImages, type ReferenceImageMatch } from "@/lib/serverReferenceGallery";

const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";
const LLM_API_KEY = process.env.UVB_LLM_API_KEY ?? "uvb-local";
const DEFAULT_MAX_TOKENS = Number.parseInt(process.env.UVB_CHAT_DEFAULT_MAX_TOKENS ?? "4096", 10);
const MAX_MODEL_HISTORY_MESSAGES = 18;
const MAX_MODEL_TEXT_CHARS = 6_000;
const MAX_MODEL_TOTAL_TEXT_CHARS = 70_000;

type ChatRole = "system" | "user" | "assistant";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "video_url"; video_url: { url: string } };

interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[];
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  systemPrompt?: string;
  aliasRules?: Partial<AliasRule>[];
  settings?: {
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
    enableThinking?: boolean;
  };
  memorySource?: MemorySource;
  visualEmbeddings?: number[][];
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

interface ChatCompletionAttempt {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  enableThinking: boolean;
  messages: ChatMessage[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_SYSTEM_PROMPT =
  "You are KnightBot inside UVB, a local multimodal AI workspace. Be direct, useful, warm, and concise. You are currently connected through the UVB web interface.";

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (/^https?:\/\/[^/]+:\d+v1$/i.test(trimmed)) {
    return trimmed.replace(/v1$/i, "/v1");
  }
  return trimmed.replace(/\/+$/, "");
}

async function requestChatCompletion(attempt: ChatCompletionAttempt, aliasRules: AliasRule[]) {
  const requestUrl = `${attempt.baseUrl}/chat/completions`;
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${attempt.apiKey}`,
    },
    body: JSON.stringify({
      model: attempt.model,
      messages: attempt.messages,
      temperature: attempt.temperature,
      max_tokens: attempt.maxTokens,
      stream: false,
      chat_template_kwargs: {
        enable_thinking: attempt.enableThinking,
      },
    }),
  };
  let response: Response | null = null;
  let lastNetworkError: unknown = null;

  for (let index = 0; index < 3; index += 1) {
    try {
      response = await fetch(requestUrl, requestInit);
      break;
    } catch (error) {
      lastNetworkError = error;
      await sleep(750 * (index + 1));
    }
  }

  if (!response) {
    const message = lastNetworkError instanceof Error ? lastNetworkError.message : "fetch failed";
    throw new Error(
      `Local model chat endpoint did not answer after retries. The model may still be loading or restarting. Last network error: ${message}`
    );
  }

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

  const content = applyNameAliases(data?.choices?.[0]?.message?.content?.trim() ?? "", aliasRules);
  if (!content) {
    throw new Error("Local model returned an empty response.");
  }

  return content;
}

function hasMessageContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;

  return content.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (part.type === "image_url") return part.image_url.url.trim().length > 0;
    if (part.type === "video_url") return part.video_url.url.trim().length > 0;
    return false;
  });
}

function trimTextForModel(text: string, maxChars = MAX_MODEL_TEXT_CHARS) {
  if (text.length <= maxChars) return text;
  const headChars = Math.floor(maxChars * 0.45);
  const tailChars = Math.floor(maxChars * 0.55);
  return `${text.slice(0, headChars).trim()}\n\n[...middle compacted to keep the local model request responsive...]\n\n${text
    .slice(-tailChars)
    .trim()}`;
}

function compactContentForModel(
  content: ChatMessage["content"],
  aliasRules: AliasRule[],
  textBudget: { remaining: number }
): ChatMessage["content"] {
  const applyBudget = (text: string) => {
    const aliased = applyNameAliases(text, aliasRules);
    const maxChars = Math.max(800, Math.min(MAX_MODEL_TEXT_CHARS, textBudget.remaining));
    const compacted = trimTextForModel(aliased, maxChars);
    textBudget.remaining = Math.max(0, textBudget.remaining - compacted.length);
    return compacted;
  };

  if (typeof content === "string") return applyBudget(content);

  return content.map((part) =>
    part.type === "text" ? { ...part, text: applyBudget(part.text) } : part
  );
}

function textFromContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text")
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n");
}

function latestUserText(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest ? textFromContent(latest.content).trim() : "";
}

function latestUserHasImage(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  if (!latest || !Array.isArray(latest.content)) return false;
  return latest.content.some((part) => part.type === "image_url" && part.image_url.url.trim().length > 0);
}

function memorySearchQueryForLatestTurn(messages: ChatMessage[], aliasRules: AliasRule[]) {
  const latestText = applyNameAliases(latestUserText(messages), aliasRules);
  if (!latestUserHasImage(messages)) return latestText;
  return [
    latestText,
    "visual reference gallery profile-reference identity appearance photo face hair beard build clothing Richard TacImpulse Jusstin",
  ]
    .filter(Boolean)
    .join("\n");
}

function appendVisualReferenceSystemNote(systemPrompt: string, matches: ReferenceImageMatch[]) {
  const activeMatches = matches.filter((match) => match.visualScore > 0.45).slice(0, 5);
  if (!activeMatches.length) return systemPrompt;
  return [
    systemPrompt.trim(),
    "Visual Reference Gallery matches: these are user-approved reference images matched by local visual embeddings. Treat them as candidate identity/context signals, not biometric certainty. Use confidence language and compare visible traits.",
    ...activeMatches.map((match, index) => {
      const score = Number.isFinite(match.visualScore) ? match.visualScore.toFixed(3) : "n/a";
      return `${index + 1}. [${match.matchedBy} score=${score}] ${match.personName} / ${match.title}: ${match.caption || match.notes}`;
    }),
  ].join("\n");
}

function normalizeMemorySource(value: unknown): MemorySource {
  return value === "telegram" || value === "system" || value === "manual" ? value : "chat";
}

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userMessages = Array.isArray(body.messages) ? body.messages : [];
  const runtime = await loadRuntimeSettings();
  const settings = body.settings ?? runtime.modelSettings;
  const aliasRules = normalizeAliasRules(body.aliasRules);
  const memoryQuery = latestUserText(userMessages);
  const retrievalQuery = memorySearchQueryForLatestTurn(userMessages, aliasRules);
  const retrievedMemories = retrievalQuery
    ? await searchMemoryEntries(retrievalQuery, 10).catch(() => [])
    : [];
  const visualMatches = Array.isArray(body.visualEmbeddings)
    ? (
        await Promise.all(
          body.visualEmbeddings
            .filter((embedding) => Array.isArray(embedding))
            .slice(0, 3)
            .map((embedding) => matchReferenceImages(embedding, 5).catch(() => []))
        )
      ).flat()
    : [];
  const systemPrompt = appendNameAliasSystemNote(
    appendVisualReferenceSystemNote(
      appendRetrievedMemorySystemNote(
        appendCurrentUserSystemNote(
          body.systemPrompt?.trim() ||
            runtime.voiceSettings.systemPrompt?.trim() ||
            DEFAULT_SYSTEM_PROMPT
        ),
        retrievedMemories
      ),
      visualMatches
    ),
    aliasRules
  );
  const baseUrl = normalizeBaseUrl(settings.baseUrl || LLM_BASE_URL);
  const model = settings.model?.trim() || LLM_MODEL;
  const apiKey = settings.apiKey?.trim() || LLM_API_KEY;
  const temperature = Number.isFinite(settings.temperature)
    ? Number(settings.temperature)
    : 0.7;
  const maxTokens = Number.isFinite(settings.maxTokens)
    ? Number(settings.maxTokens)
    : DEFAULT_MAX_TOKENS;
  const enableThinking = settings.enableThinking ?? false;

  const compactableMessages = userMessages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        hasMessageContent(message.content)
    )
    .slice(-MAX_MODEL_HISTORY_MESSAGES);
  const textBudget = { remaining: MAX_MODEL_TOTAL_TEXT_CHARS };
  const compactedMessages = [...compactableMessages]
    .reverse()
    .map((message) => ({
      ...message,
      content: compactContentForModel(message.content, aliasRules, textBudget),
    }))
    .reverse();
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...compactedMessages,
  ];

  if (messages.length === 1) {
    return NextResponse.json({ error: "No chat messages supplied." }, { status: 400 });
  }

  try {
    let content: string;
    let responseModel = model;
    try {
      content = await requestChatCompletion(
        { baseUrl, model, apiKey, temperature, maxTokens, enableThinking, messages },
        aliasRules
      );
    } catch (primaryError) {
      const fallbackBaseUrl = normalizeBaseUrl(LLM_BASE_URL);
      if (baseUrl === fallbackBaseUrl) throw primaryError;
      content = await requestChatCompletion(
        {
          baseUrl: fallbackBaseUrl,
          model: LLM_MODEL,
          apiKey: LLM_API_KEY,
          temperature,
          maxTokens,
          enableThinking,
          messages,
        },
        aliasRules
      );
      responseModel = LLM_MODEL;
    }

    if (memoryQuery) {
      await upsertConversationMemory({
        userText: applyNameAliases(memoryQuery, aliasRules),
        assistantText: content,
        source: normalizeMemorySource(body.memorySource),
      }).catch(() => undefined);
    }

    return NextResponse.json({
      content,
      model: responseModel,
      memories: retrievedMemories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        type: memory.type,
        source: memory.source,
        score: memory.score,
        matchedBy: memory.matchedBy,
      })),
      visualMatches: visualMatches.slice(0, 5).map((match) => ({
        id: match.id,
        personName: match.personName,
        title: match.title,
        score: match.visualScore,
        matchedBy: match.matchedBy,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model bridge error.";
    return NextResponse.json(
      { error: `Could not reach model at ${baseUrl}: ${message}` },
      { status: 502 }
    );
  }
}
