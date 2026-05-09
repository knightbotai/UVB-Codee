import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface ServiceCheck {
  id: string;
  name: string;
  url: string;
  online: boolean;
  latencyMs?: number;
  error?: string;
}

const SERVICES = [
  {
    id: "llm",
    name: "Local LLM",
    url: process.env.UVB_LLM_HEALTH_URL ?? "http://127.0.0.1:8003/v1/models",
  },
  {
    id: "stt",
    name: "Faster Whisper",
    url: process.env.UVB_STT_HEALTH_URL ?? "http://127.0.0.1:8001/health",
  },
  {
    id: "tts",
    name: "Kokoro TTS",
    url: process.env.UVB_TTS_HEALTH_URL ?? "http://127.0.0.1:8880/health",
  },
  {
    id: "qdrant",
    name: "Qdrant Memory",
    url: process.env.UVB_QDRANT_HEALTH_URL ?? "http://127.0.0.1:6333/healthz",
  },
  {
    id: "reranker",
    name: "Memory Reranker",
    url: process.env.UVB_RERANKER_HEALTH_URL ?? "http://127.0.0.1:8780/health",
  },
];

async function checkService(service: (typeof SERVICES)[number]): Promise<ServiceCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(service.url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });

    return {
      ...service,
      online: response.ok,
      latencyMs: Date.now() - startedAt,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ...service,
      online: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getGitCommit() {
  try {
    const gitDir = path.join(process.cwd(), ".git");
    const head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
    if (head.startsWith("ref:")) {
      const refPath = head.replace(/^ref:\s*/, "");
      return (await readFile(path.join(gitDir, refPath), "utf8")).trim().slice(0, 7);
    }
    return head.slice(0, 7);
  } catch {
    return "unknown";
  }
}

export async function GET() {
  const services = await Promise.race([
    Promise.all(SERVICES.map(checkService)),
    new Promise<ServiceCheck[]>((resolve) =>
      setTimeout(
        () =>
          resolve(
            SERVICES.map((service) => ({
              ...service,
              online: false,
              latencyMs: 3500,
              error: "Health probe timed out.",
            }))
          ),
        3500
      )
    ),
  ]);
  const onlineCount = services.filter((service) => service.online).length;

  return NextResponse.json({
    status: onlineCount === services.length ? "online" : onlineCount > 0 ? "degraded" : "offline",
    service: "UVB KnightBot",
    version: "0.1.0",
    cwd: process.cwd(),
    commit: await getGitCommit(),
    services,
    timestamp: new Date().toISOString(),
  });
}
