import { NextResponse } from "next/server";

const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";

export async function GET() {
  try {
    const response = await fetch(`${LLM_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${process.env.UVB_LLM_API_KEY ?? "uvb-local"}`,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json({
        llmConfigured: true,
        connected: false,
        baseUrl: LLM_BASE_URL,
        model: LLM_MODEL,
        error: `Model server returned ${response.status}.`,
      });
    }

    return NextResponse.json({
      llmConfigured: true,
      connected: true,
      baseUrl: LLM_BASE_URL,
      model: LLM_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model status error.";

    return NextResponse.json({
      llmConfigured: true,
      connected: false,
      baseUrl: LLM_BASE_URL,
      model: LLM_MODEL,
      error: message,
    });
  }
}
