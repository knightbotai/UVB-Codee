import { NextRequest, NextResponse } from "next/server";

const DEFAULT_STT_URL =
  process.env.UVB_STT_URL ?? "http://127.0.0.1:8001/v1/audio/transcriptions";
const DEFAULT_STT_MODEL =
  process.env.UVB_STT_MODEL ?? "Systran/faster-whisper-large-v3";

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
  const payload = new FormData();
  payload.append("file", file, file.name || "recording.webm");
  payload.append("model", model);

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

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown STT bridge error.";
    return NextResponse.json({ error: `Could not reach STT endpoint: ${message}` }, { status: 502 });
  }
}
