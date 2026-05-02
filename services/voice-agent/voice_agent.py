from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import tempfile
import time
import importlib.util
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import aiohttp
import websockets


HOST = os.getenv("UVB_VOICE_AGENT_HOST", "127.0.0.1")
PORT = int(os.getenv("UVB_VOICE_AGENT_PORT", "8765"))

DEFAULT_MODEL_SETTINGS = {
    "baseUrl": os.getenv("UVB_LLM_BASE_URL", "http://127.0.0.1:8003/v1"),
    "model": os.getenv("UVB_LLM_MODEL", "qwen36-35b-a3b-heretic-nvfp4"),
    "apiKey": os.getenv("UVB_LLM_API_KEY", "uvb-local"),
    "temperature": 0.7,
    "maxTokens": 900,
    "enableThinking": False,
}

DEFAULT_VOICE_SETTINGS = {
    "sttUrl": os.getenv(
        "UVB_STT_URL", "http://127.0.0.1:8001/v1/audio/transcriptions"
    ),
    "sttModel": os.getenv("UVB_STT_MODEL", "Systran/faster-whisper-large-v3"),
    "ttsUrl": os.getenv("UVB_TTS_URL", "http://127.0.0.1:8880/v1/audio/speech"),
    "ttsVoice": os.getenv("UVB_TTS_VOICE", "af_nova"),
    "liveSttProvider": "faster-whisper",
    "liveTtsProvider": "kokoro",
    "liveVadProvider": "browser-manual",
    "liveTransport": "websocket",
    "mossTtsUrl": os.getenv("UVB_MOSS_TTS_URL", "http://127.0.0.1:8890/v1/audio/speech"),
    "mossTtsVoice": os.getenv("UVB_MOSS_TTS_VOICE", "default"),
    "systemPrompt": (
        "You are KnightBot inside UVB, a local multimodal AI workspace. Be direct, "
        "useful, warm, and concise. You are speaking through the realtime voice "
        "cockpit, so keep replies conversational and interruptible."
    ),
}


def now_ms() -> int:
    return int(time.perf_counter() * 1000)


def pipecat_available() -> bool:
    return importlib.util.find_spec("pipecat") is not None


def normalize_base_url(value: str) -> str:
    return value.strip().rstrip("/")


def shallow_settings(defaults: dict[str, Any], incoming: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(defaults)
    if incoming:
        merged.update({k: v for k, v in incoming.items() if v is not None})
    return merged


def sanitize_text_for_speech(text: str) -> str:
    cleaned = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    cleaned = re.sub(r"#{2,}", "", cleaned)
    cleaned = re.sub(r"\*\*(.*?)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"__(.*?)__", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"(?m)^\s*[-*+]\s+", "", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


@dataclass
class VoiceSession:
    model_settings: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_MODEL_SETTINGS))
    voice_settings: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_VOICE_SETTINGS))
    history: list[dict[str, str]] = field(default_factory=list)
    chunks: list[bytes] = field(default_factory=list)

    def reset_audio(self) -> None:
        self.chunks.clear()


async def send_event(
    websocket: Any, event_type: str, **payload: Any
) -> None:
    await websocket.send(json.dumps({"type": event_type, **payload}))


async def transcribe_audio(audio_bytes: bytes, voice_settings: dict[str, Any]) -> tuple[str, int]:
    started = now_ms()
    endpoint = str(voice_settings.get("sttUrl") or DEFAULT_VOICE_SETTINGS["sttUrl"])
    model = str(voice_settings.get("sttModel") or DEFAULT_VOICE_SETTINGS["sttModel"])

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = Path(temp_file.name)

    try:
        form = aiohttp.FormData()
        form.add_field(
            "file",
            temp_path.read_bytes(),
            filename="uvb-live-recording.webm",
            content_type="audio/webm",
        )
        form.add_field("model", model)

        async with aiohttp.ClientSession() as session:
            async with session.post(endpoint, data=form, timeout=120) as response:
                raw = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"STT returned {response.status}: {raw}")
                data = json.loads(raw) if raw else {}
                text = str(data.get("text") or "").strip()
                if not text:
                    raise RuntimeError("STT returned an empty transcript.")
                return text, now_ms() - started
    finally:
        temp_path.unlink(missing_ok=True)


async def complete_chat(
    transcript: str,
    session_state: VoiceSession,
) -> tuple[str, int]:
    started = now_ms()
    model_settings = session_state.model_settings
    voice_settings = session_state.voice_settings
    base_url = normalize_base_url(
        str(model_settings.get("baseUrl") or DEFAULT_MODEL_SETTINGS["baseUrl"])
    )
    model = str(model_settings.get("model") or DEFAULT_MODEL_SETTINGS["model"])
    api_key = str(model_settings.get("apiKey") or DEFAULT_MODEL_SETTINGS["apiKey"])
    temperature = float(model_settings.get("temperature") or 0.7)
    max_tokens = int(model_settings.get("maxTokens") or 900)
    enable_thinking = bool(model_settings.get("enableThinking") or False)
    system_prompt = str(voice_settings.get("systemPrompt") or DEFAULT_VOICE_SETTINGS["systemPrompt"])

    history = [
        message
        for message in session_state.history[-16:]
        if message.get("role") in {"user", "assistant"} and message.get("content")
    ]
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": transcript},
    ]

    async with aiohttp.ClientSession() as client:
        async with client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": False,
                "chat_template_kwargs": {"enable_thinking": enable_thinking},
            },
            timeout=180,
        ) as response:
            raw = await response.text()
            data = json.loads(raw) if raw else {}
            if response.status >= 400:
                message = data.get("error", {}).get("message") if isinstance(data, dict) else raw
                raise RuntimeError(f"LLM returned {response.status}: {message or raw}")
            content = (
                data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if isinstance(data, dict)
                else ""
            )
            if not content:
                raise RuntimeError("LLM returned an empty response.")
            return content, now_ms() - started


def resolve_tts_settings(voice_settings: dict[str, Any]) -> tuple[str, str, str]:
    provider = str(voice_settings.get("liveTtsProvider") or "kokoro")
    if provider in {"moss-tts-nano", "moss-ttsd"}:
        endpoint = str(
            voice_settings.get("mossTtsUrl")
            or os.getenv("UVB_MOSS_TTS_URL")
            or DEFAULT_VOICE_SETTINGS["mossTtsUrl"]
        )
        voice = str(
            voice_settings.get("mossTtsVoice")
            or os.getenv("UVB_MOSS_TTS_VOICE")
            or DEFAULT_VOICE_SETTINGS["mossTtsVoice"]
        )
        return endpoint, voice, provider

    endpoint = str(voice_settings.get("ttsUrl") or DEFAULT_VOICE_SETTINGS["ttsUrl"])
    voice = str(voice_settings.get("ttsVoice") or DEFAULT_VOICE_SETTINGS["ttsVoice"])
    return endpoint, voice, provider


async def synthesize_speech(text: str, voice_settings: dict[str, Any]) -> tuple[bytes, int, str]:
    started = now_ms()
    endpoint, voice, provider = resolve_tts_settings(voice_settings)
    payload = {"input": sanitize_text_for_speech(text), "voice": voice}
    if provider.startswith("moss-"):
        payload["response_format"] = "mp3"

    async with aiohttp.ClientSession() as client:
        async with client.post(
            endpoint,
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=180,
        ) as response:
            body = await response.read()
            if response.status >= 400:
                raise RuntimeError(
                    f"TTS returned {response.status}: {body.decode(errors='ignore')}"
                )
            content_type = response.headers.get("content-type") or (
                "audio/mpeg" if provider.startswith("moss-") else "audio/wav"
            )
            return body, now_ms() - started, content_type


async def process_turn(websocket: Any, session_state: VoiceSession) -> None:
    if not session_state.chunks:
        await send_event(websocket, "error", message="No live voice audio was captured.")
        return

    started = now_ms()
    audio_bytes = b"".join(session_state.chunks)
    session_state.reset_audio()

    await send_event(websocket, "status", message="Transcribing live voice audio...")
    transcript, stt_ms = await transcribe_audio(audio_bytes, session_state.voice_settings)
    await send_event(websocket, "transcript", text=transcript, latencyMs=stt_ms)

    await send_event(websocket, "status", message="Thinking through the local model...")
    reply, llm_ms = await complete_chat(transcript, session_state)
    await send_event(websocket, "assistant", text=reply, latencyMs=llm_ms)

    session_state.history.extend(
        [
            {"role": "user", "content": transcript},
            {"role": "assistant", "content": reply},
        ]
    )

    await send_event(websocket, "status", message="Speaking with the configured voice...")
    audio, tts_ms, content_type = await synthesize_speech(reply, session_state.voice_settings)
    await send_event(
        websocket,
        "audio",
        contentType=content_type,
        audioBase64=base64.b64encode(audio).decode("ascii"),
        latencyMs=tts_ms,
    )
    await send_event(
        websocket,
        "metrics",
        sttMs=stt_ms,
        llmMs=llm_ms,
        ttsMs=tts_ms,
        totalMs=now_ms() - started,
        sttProvider=session_state.voice_settings.get("liveSttProvider", "faster-whisper"),
        ttsProvider=session_state.voice_settings.get("liveTtsProvider", "kokoro"),
        vadProvider=session_state.voice_settings.get("liveVadProvider", "browser-manual"),
        transport=session_state.voice_settings.get("liveTransport", "websocket"),
    )
    await send_event(websocket, "status", message="Live voice turn complete.")


async def handle_live(websocket: Any) -> None:
    state = VoiceSession()
    await send_event(
        websocket,
        "ready",
        message="UVB voice agent connected.",
        transport="websocket",
        pipelineMode="baseline-websocket-pipecat-v1-ready",
        pipecatInstalled=pipecat_available(),
        upgradePath=[
            "pipecat-ai v1 pipeline runtime",
            "SmallWebRTC transport for local browser voice",
            "Parakeet Realtime EOU STT",
            "MOSS-TTS-Nano / MOSS-TTSD TTS",
            "Chatterbox Turbo TTS",
            "LiveKit transport",
        ],
    )

    async for raw_message in websocket:
        try:
            message = json.loads(raw_message)
            message_type = message.get("type")

            if message_type == "start":
                state.model_settings = shallow_settings(
                    DEFAULT_MODEL_SETTINGS, message.get("modelSettings")
                )
                state.voice_settings = shallow_settings(
                    DEFAULT_VOICE_SETTINGS, message.get("voiceSettings")
                )
                state.history = [
                    {
                        "role": item.get("role", ""),
                        "content": item.get("content", ""),
                    }
                    for item in message.get("history", [])
                    if isinstance(item, dict)
                ]
                state.reset_audio()
                await send_event(
                    websocket,
                    "status",
                    message=(
                        "Live voice session armed. Browser VAD will send turns "
                        "automatically after a lull."
                    ),
                )
            elif message_type == "audio":
                audio_base64 = str(message.get("data") or "")
                if audio_base64:
                    state.chunks.append(base64.b64decode(audio_base64))
                    await send_event(
                        websocket,
                        "audio_received",
                        bytes=sum(len(chunk) for chunk in state.chunks),
                    )
            elif message_type == "stop":
                await process_turn(websocket, state)
            elif message_type == "cancel":
                state.reset_audio()
                await send_event(websocket, "status", message="Live voice turn cancelled.")
            elif message_type == "ping":
                await send_event(websocket, "pong", at=time.time())
            else:
                await send_event(websocket, "error", message=f"Unknown event: {message_type}")
        except Exception as exc:  # noqa: BLE001 - surface cleanly to UVB instead of crashing.
            await send_event(websocket, "error", message=str(exc))


async def route(websocket: Any, path: str | None = None) -> None:
    if path is None:
        request = getattr(websocket, "request", None)
        path = getattr(request, "path", None) or getattr(websocket, "path", "/live")

    if path != "/live":
        await send_event(websocket, "error", message="Use /live for UVB live voice.")
        await websocket.close(code=1008, reason="Unsupported path")
        return

    await handle_live(websocket)


async def main() -> None:
    print(f"[uvb-voice-agent] listening on ws://{HOST}:{PORT}/live", flush=True)
    async with websockets.serve(route, HOST, PORT, max_size=32 * 1024 * 1024):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
