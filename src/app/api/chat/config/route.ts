import { NextResponse } from "next/server";

const LLM_BASE_URL = process.env.UVB_LLM_BASE_URL ?? "http://127.0.0.1:8003/v1";
const LLM_MODEL = process.env.UVB_LLM_MODEL ?? "qwen36-35b-a3b-heretic-nvfp4";
const LLM_API_KEY = process.env.UVB_LLM_API_KEY ?? "uvb-local";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const baseUrl = normalizeBaseUrl(url.searchParams.get("baseUrl") || LLM_BASE_URL);
  const model = url.searchParams.get("model") || LLM_MODEL;
  const apiKey = url.searchParams.get("apiKey") || LLM_API_KEY;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return NextResponse.json({
        llmConfigured: true,
        connected: false,
        baseUrl,
        model,
        error: `Model server returned ${response.status}.`,
      });
    }

    return NextResponse.json({
      llmConfigured: true,
      connected: true,
      baseUrl,
      model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model status error.";

    return NextResponse.json({
      llmConfigured: true,
      connected: false,
      baseUrl,
      model,
      error: message,
    });
  }
}
