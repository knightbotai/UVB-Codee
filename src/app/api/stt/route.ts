import { NextRequest, NextResponse } from "next/server";
import { applyNameAliases, buildAliasSystemNote, normalizeAliasRules, type AliasRule } from "@/lib/nameAliases";
import { cleanSttTranscript } from "@/lib/sttCleanup";

const DEFAULT_STT_URL =
  process.env.UVB_STT_URL ?? "http://127.0.0.1:8001/v1/audio/transcriptions";
const DEFAULT_STT_MODEL =
  process.env.UVB_STT_MODEL ?? "Systran/faster-distil-whisper-large-v3";
const DEFAULT_STT_LANGUAGE = process.env.UVB_STT_LANGUAGE ?? "en";
const DEFAULT_STT_RESPONSE_FORMAT = process.env.UVB_STT_RESPONSE_FORMAT ?? "json";
const DEFAULT_STT_TEMPERATURE = process.env.UVB_STT_TEMPERATURE ?? "0";
const DEFAULT_STT_TIMEOUT_MS = Number.parseInt(process.env.UVB_STT_TIMEOUT_MS ?? "120000", 10);
const DEFAULT_STT_VAD_FILTER = process.env.UVB_STT_VAD_FILTER ?? "true";
const DEFAULT_STT_CONDITION_ON_PREVIOUS_TEXT =
  process.env.UVB_STT_CONDITION_ON_PREVIOUS_TEXT ?? "false";
const DEFAULT_STT_NO_SPEECH_THRESHOLD = process.env.UVB_STT_NO_SPEECH_THRESHOLD ?? "0.6";
const DEFAULT_STT_COMPRESSION_RATIO_THRESHOLD =
  process.env.UVB_STT_COMPRESSION_RATIO_THRESHOLD ?? "2.4";
const DEFAULT_STT_LOG_PROB_THRESHOLD = process.env.UVB_STT_LOG_PROB_THRESHOLD ?? "-1.0";
const DEFAULT_STT_PROMPT =
  process.env.UVB_STT_PROMPT ??
  "Transcribe spoken English with natural punctuation, capitalization, sentence boundaries, commas, periods, and question marks. Preserve the speaker's words exactly.";

function appendOptional(payload: FormData, key: string, value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (text) {
    payload.append(key, text);
  }
}

function aliasPrompt(prompt: string, rules: AliasRule[]) {
  return [prompt.trim(), buildAliasSystemNote(rules)].filter(Boolean).join("\n\n");
}

function aliasHotwords(rules: AliasRule[]) {
  return normalizeAliasRules(rules)
    .filter((rule) => rule.enabled)
    .map((rule) => rule.replacement)
    .join(", ");
}

function parseAliasRules(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value || "null")) as Partial<AliasRule>[] | null;
    return normalizeAliasRules(parsed || undefined);
  } catch {
    return normalizeAliasRules();
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`STT endpoint timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  let incoming: FormData;

  try {
    incoming = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form upload." }, { status: 400 });
  }

  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  const endpoint = String(incoming.get("endpoint") || DEFAULT_STT_URL).trim();
  const model = String(incoming.get("model") || DEFAULT_STT_MODEL).trim();
  const aliasRules = parseAliasRules(incoming.get("aliasRules"));
  const timeoutMs = Number.isFinite(DEFAULT_STT_TIMEOUT_MS) && DEFAULT_STT_TIMEOUT_MS >= 5000
    ? DEFAULT_STT_TIMEOUT_MS
    : 120000;
  const audioBytes = await file.arrayBuffer();
  const forwardedFile = new Blob([audioBytes], { type: file.type || "application/octet-stream" });
  const payload = new FormData();
  payload.append("file", forwardedFile, file.name || "recording.webm");
  payload.append("model", model);
  appendOptional(payload, "language", incoming.get("language") || DEFAULT_STT_LANGUAGE);
  appendOptional(
    payload,
    "prompt",
    aliasPrompt(String(incoming.get("prompt") || DEFAULT_STT_PROMPT), aliasRules)
  );
  appendOptional(
    payload,
    "response_format",
    incoming.get("response_format") || DEFAULT_STT_RESPONSE_FORMAT
  );
  appendOptional(payload, "temperature", incoming.get("temperature") || DEFAULT_STT_TEMPERATURE);
  appendOptional(payload, "vad_filter", incoming.get("vad_filter") || DEFAULT_STT_VAD_FILTER);
  appendOptional(
    payload,
    "condition_on_previous_text",
    incoming.get("condition_on_previous_text") || DEFAULT_STT_CONDITION_ON_PREVIOUS_TEXT
  );
  appendOptional(
    payload,
    "no_speech_threshold",
    incoming.get("no_speech_threshold") || DEFAULT_STT_NO_SPEECH_THRESHOLD
  );
  appendOptional(
    payload,
    "compression_ratio_threshold",
    incoming.get("compression_ratio_threshold") || DEFAULT_STT_COMPRESSION_RATIO_THRESHOLD
  );
  appendOptional(
    payload,
    "log_prob_threshold",
    incoming.get("log_prob_threshold") || DEFAULT_STT_LOG_PROB_THRESHOLD
  );
  appendOptional(
    payload,
    "hotwords",
    [incoming.get("hotwords") || process.env.UVB_STT_HOTWORDS || "", aliasHotwords(aliasRules)]
      .filter(Boolean)
      .join(", ")
  );

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      body: payload,
    }, timeoutMs);
    const rawText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { error: `STT returned ${response.status}: ${rawText || response.statusText}` },
        { status: 502 }
      );
    }

    let text = rawText;
    try {
      const data = JSON.parse(rawText) as { text?: string };
      text = data.text ?? rawText;
    } catch {
      text = rawText;
    }

    return NextResponse.json({ text: applyNameAliases(cleanSttTranscript(text), aliasRules) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown STT bridge error.";
    return NextResponse.json({ error: `Could not reach STT endpoint: ${message}` }, { status: 502 });
  }
}
