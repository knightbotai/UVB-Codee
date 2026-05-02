# UVB Checkpoint - 2026-05-02

## Summary

This checkpoint captures the UVB work completed before moving from the temporary
WebSocket live voice bridge to a real Pipecat/SmallWebRTC pipeline.

## Implemented

- Added Pipecat v1 / SmallWebRTC provider staging in settings and docs.
- Added MOSS-TTS-Nano and MOSS-TTSD provider slots with configurable endpoint
  and voice/profile fields.
- Preserved the working Kokoro/Faster Whisper/vLLM baseline voice loop.
- Added TTS text cleanup so Markdown headings like `###` are not spoken as
  repeated "number" tokens.
- Added per-response replay controls in assistant message bubbles.
- Moved speech playback controls near the composer so pause/replay/stop/seek
  stay reachable during long conversations.
- Added first-pass browser VAD and barge-in experimentation for the WebSocket
  sidecar.
- Added quiet UVB launcher and stop scripts to avoid multiple visible PowerShell
  windows:
  - `scripts/start-uvb-background.ps1`
  - `scripts/stop-uvb.ps1`

## Known Direction

The WebSocket live voice bridge is now considered a transitional fallback. The
next architecture target is a real Pipecat sidecar using SmallWebRTC for browser
audio transport, Pipecat turn detection/interruption, local Faster Whisper STT,
local OpenAI-compatible LLM on port `8003`, and Kokoro/MOSS-compatible TTS.

## Verification

Run before committing this checkpoint:

```powershell
bun run typecheck
bun run lint
bun run build
python -m py_compile services\voice-agent\voice_agent.py
```
