import { NextRequest, NextResponse } from "next/server";
import { applyNameAliases, buildAliasSystemNote, normalizeAliasRules, type AliasRule } from "@/lib/nameAliases";

const DEFAULT_STT_URL =
  process.env.UVB_STT_URL ?? "http://127.0.0.1:8001/v1/audio/transcriptions";
const DEFAULT_STT_MODEL =
  process.env.UVB_STT_MODEL ?? "Systran/faster-distil-whisper-large-v3";
const DEFAULT_STT_LANGUAGE = process.env.UVB_STT_LANGUAGE ?? "en";
const DEFAULT_STT_RESPONSE_FORMAT = process.env.UVB_STT_RESPONSE_FORMAT ?? "json";
const DEFAULT_STT_TEMPERATURE = process.env.UVB_STT_TEMPERATURE ?? "0";
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
  const payload = new FormData();
  payload.append("file", file, file.name || "recording.webm");
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
  appendOptional(
    payload,
    "hotwords",
    [incoming.get("hotwords") || process.env.UVB_STT_HOTWORDS || "", aliasHotwords(aliasRules)]
      .filter(Boolean)
      .join(", ")
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: payload,
    });
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

    return NextResponse.json({ text: applyNameAliases(text.trim(), aliasRules) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown STT bridge error.";
    return NextResponse.json({ error: `Could not reach STT endpoint: ${message}` }, { status: 502 });
  }
}
