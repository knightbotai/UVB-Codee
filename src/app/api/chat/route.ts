import { NextRequest, NextResponse } from "next/server";
import { loadRuntimeSettings } from "@/lib/serverRuntimeSettings";
import {
  appendNameAliasSystemNote,
  applyNameAliases,
  normalizeAliasRules,
  type AliasRule,
} from "@/lib/nameAliases";

const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";
const LLM_API_KEY = process.env.UVB_LLM_API_KEY ?? "uvb-local";

type ChatRole = "system" | "user" | "assistant";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

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

const DEFAULT_SYSTEM_PROMPT =
  "You are KnightBot inside UVB, a local multimodal AI workspace. Be direct, useful, warm, and concise. You are currently connected through the UVB web interface.";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function hasMessageContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;

  return content.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (part.type === "image_url") return part.image_url.url.trim().length > 0;
    return false;
  });
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
  const systemPrompt =
    appendNameAliasSystemNote(
      body.systemPrompt?.trim() ||
        runtime.voiceSettings.systemPrompt?.trim() ||
        DEFAULT_SYSTEM_PROMPT,
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
    : 1200;
  const enableThinking = settings.enableThinking ?? false;

    const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...userMessages
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          hasMessageContent(message.content)
      )
      .map((message) => ({
        ...message,
        content:
          typeof message.content === "string"
            ? applyNameAliases(message.content, aliasRules)
            : message.content.map((part) =>
                part.type === "text" ? { ...part, text: applyNameAliases(part.text, aliasRules) } : part
              ),
      }))
      .slice(-20),
  ];

  if (messages.length === 1) {
    return NextResponse.json({ error: "No chat messages supplied." }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: enableThinking,
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
      return NextResponse.json(
        { error: `Local model returned ${response.status}: ${message}` },
        { status: 502 }
      );
    }

    const content = applyNameAliases(data?.choices?.[0]?.message?.content?.trim() ?? "", aliasRules);
    if (!content) {
      return NextResponse.json(
        { error: "Local model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model bridge error.";
    return NextResponse.json(
      { error: `Could not reach model at ${baseUrl}: ${message}` },
      { status: 502 }
    );
  }
}
