import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

interface ComfyQueuePayload {
  endpoint?: unknown;
  workflowJson?: unknown;
  prompt?: unknown;
  negativePrompt?: unknown;
  promptNodeId?: unknown;
  promptInputName?: unknown;
  negativePromptNodeId?: unknown;
  negativePromptInputName?: unknown;
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeEndpoint(value: unknown) {
  return safeText(value, process.env.UVB_COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
}

function setWorkflowText(workflow: Record<string, any>, nodeId: string, inputName: string, value: string) {
  if (!nodeId || !inputName || !value) return;
  const node = workflow[nodeId];
  if (!node || typeof node !== "object") {
    throw new Error(`Workflow node ${nodeId} was not found.`);
  }
  node.inputs = node.inputs && typeof node.inputs === "object" ? node.inputs : {};
  node.inputs[inputName] = value;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const endpoint = normalizeEndpoint(request.nextUrl.searchParams.get("endpoint"));
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(`${endpoint}/system_stats`);
    const data = await response.json().catch(() => ({}));
    return NextResponse.json({
      endpoint,
      online: response.ok,
      latencyMs: Date.now() - startedAt,
      stats: data,
      error: response.ok ? "" : `HTTP ${response.status}`,
    });
  } catch (error) {
    return NextResponse.json({
      endpoint,
      online: false,
      latencyMs: Date.now() - startedAt,
      stats: null,
      error: error instanceof Error ? error.message : "Could not reach ComfyUI.",
    });
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as ComfyQueuePayload;
  const endpoint = normalizeEndpoint(payload.endpoint);
  const workflowJson = safeText(payload.workflowJson);
  const prompt = safeText(payload.prompt);
  if (!workflowJson || !prompt) {
    return NextResponse.json({ error: "workflowJson and prompt are required." }, { status: 400 });
  }

  let workflow: Record<string, any>;
  try {
    workflow = JSON.parse(workflowJson) as Record<string, any>;
  } catch {
    return NextResponse.json({ error: "workflowJson must be valid ComfyUI API workflow JSON." }, { status: 400 });
  }

  try {
    setWorkflowText(
      workflow,
      safeText(payload.promptNodeId),
      safeText(payload.promptInputName, "text"),
      prompt
    );
    setWorkflowText(
      workflow,
      safeText(payload.negativePromptNodeId),
      safeText(payload.negativePromptInputName, "text"),
      safeText(payload.negativePrompt)
    );

    const response = await fetchWithTimeout(
      `${endpoint}/prompt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: "uvb-media-studio" }),
      },
      15000
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.error || `ComfyUI returned ${response.status}.`, details: data },
        { status: response.status }
      );
    }

    return NextResponse.json({
      ok: true,
      endpoint,
      promptId: data.prompt_id ?? data.promptId ?? "",
      number: data.number,
      nodeErrors: data.node_errors ?? {},
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not queue ComfyUI workflow." },
      { status: 500 }
    );
  }
}
