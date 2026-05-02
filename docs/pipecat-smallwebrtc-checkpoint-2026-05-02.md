# Pipecat SmallWebRTC Checkpoint - 2026-05-02

## Summary

UVB now has a real Pipecat SmallWebRTC sidecar staged as the preferred live voice path. The previous browser-VAD/WebSocket sidecar remains available as a fallback, but the default live transport has been moved to `small-webrtc`.

## What Changed

- Added `services/voice-agent/pipecat_agent.py`, a FastAPI sidecar on `http://127.0.0.1:8766` with:
  - `GET /health`
  - `POST /api/offer`
  - `PATCH /api/offer`
  - Pipecat `SmallWebRTCTransport`
  - Silero VAD turn detection
  - Faster Whisper via OpenAI-compatible STT
  - local OpenAI-compatible LLM on `8003`
  - Kokoro via OpenAI-compatible TTS
- Added browser Pipecat client wiring with lazy imports for:
  - `@pipecat-ai/client-js`
  - `@pipecat-ai/small-webrtc-transport`
- Added `liveWebRtcUrl` to voice settings and surfaced it in Settings.
- Changed default live transport to `small-webrtc`.
- Kept `ws://127.0.0.1:8765/live` as the legacy fallback path.
- Added Pipecat dependencies to `package.json`, `bun.lock`, and `services/voice-agent/requirements-pipecat.txt`.
- Updated launch scripts so UVB starts hidden background processes instead of leaving visible PowerShell windows on the taskbar.
- Updated the desktop shortcut to call `scripts/start-uvb-background.ps1`.
- Ignored local Python virtualenv folders with `.venv*/`.

## Local Runtime

- Next.js UI: `http://localhost:3010`
- Legacy voice sidecar: `ws://127.0.0.1:8765/live`
- Pipecat SmallWebRTC sidecar: `http://127.0.0.1:8766/api/offer`
- Pipecat health: `http://127.0.0.1:8766/health`

## Validation

- `services/voice-agent/pipecat_agent.py` compiles with Python 3.11.
- Pipecat `/health` returned `200 OK`.
- UVB `http://127.0.0.1:3010` returned `200 OK`.
- `bun run typecheck` passed.
- `bun run lint` passed.
- `bun run build` passed.

## Notes

- The sidecar logs a FastAPI `on_event` deprecation warning. It is non-blocking.
- The sidecar logs a PyTorch warning from optional transformer integrations. Silero VAD still loaded successfully.
- First full browser mic/WebRTC conversation test is the next practical validation step.
