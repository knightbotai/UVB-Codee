import { NextRequest, NextResponse } from "next/server";

const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
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

const SYSTEM_PROMPT =
  "You are KnightBot inside UVB, a local multimodal AI workspace. Be direct, useful, warm, and concise. You are currently connected through the UVB web interface.";

export async function POST(request: NextRequest) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0
      )
      .slice(-20),
  ];

  if (messages.length === 1) {
    return NextResponse.json({ error: "No chat messages supplied." }, { status: 400 });
  }

  try {
    const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.UVB_LLM_API_KEY ?? "uvb-local"}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: false,
        chat_template_kwargs: {
          enable_thinking: false,
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

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Local model returned an empty response." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      content,
      model: LLM_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model bridge error.";
    return NextResponse.json(
      { error: `Could not reach local model at ${LLM_BASE_URL}: ${message}` },
      { status: 502 }
    );
  }
}
