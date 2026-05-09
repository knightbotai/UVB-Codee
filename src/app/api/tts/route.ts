import { NextRequest, NextResponse } from "next/server";

const DEFAULT_TTS_URL = process.env.UVB_TTS_URL ?? "http://127.0.0.1:8880/v1/audio/speech";
const DEFAULT_TTS_VOICE = process.env.UVB_TTS_VOICE ?? "af_nova";

interface TtsRequestBody {
  text?: string;
  input?: string;
  endpoint?: string;
  voice?: string;
}

function sanitizeTextForSpeech(text: string) {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/#{2,}/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: NextRequest) {
  let body: TtsRequestBody;

  try {
    body = (await request.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = sanitizeTextForSpeech(body.text ?? body.input ?? "");
  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim() || DEFAULT_TTS_URL;
  const voice = body.voice?.trim() || DEFAULT_TTS_VOICE;

  const synthesize = (selectedVoice: string) =>
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: text,
        voice: selectedVoice,
      }),
    });

  try {
    let response = await synthesize(voice);

    if (!response.ok) {
      const rawText = await response.text();
      const looksLikeInvalidVoice =
        response.status === 400 &&
        /voice .*not found|invalid_request_error|validation_error/i.test(rawText);

      if (looksLikeInvalidVoice && voice !== DEFAULT_TTS_VOICE) {
        response = await synthesize(DEFAULT_TTS_VOICE);
        if (response.ok) {
          const contentType = response.headers.get("content-type") ?? "audio/wav";
          const audio = await response.arrayBuffer();

          return new NextResponse(audio, {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-store",
              "X-UVB-TTS-Voice-Fallback": DEFAULT_TTS_VOICE,
            },
          });
        }
      }

      return NextResponse.json(
        { error: `TTS returned ${response.status}: ${rawText || response.statusText}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "audio/wav";
    const audio = await response.arrayBuffer();

    return new NextResponse(audio, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TTS bridge error.";
    return NextResponse.json({ error: `Could not reach TTS endpoint: ${message}` }, { status: 502 });
  }
}
