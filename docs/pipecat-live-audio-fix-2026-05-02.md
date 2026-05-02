# Pipecat Live Audio Fix - 2026-05-02

## What Failed

Live Voice showed local waveform activity in UVB, but the Pipecat sidecar did not advance into STT/LLM/TTS. The sidecar logs showed two separate problems:

- `POST /api/offer` returned `500` because the JavaScript client sends `requestData`, while Python Pipecat expects `request_data`.
- After fixing the offer payload, WebRTC connected, but the sidecar logged repeated `No audio frame received` warnings. The UI meter was reading local mic energy, but audio frames were not reliably reaching the Pipecat peer connection.

## Fix Applied

- `services/voice-agent/pipecat_agent.py` now maps the client offer payload explicitly into `SmallWebRTCRequest`, including camelCase `requestData`.
- ICE patch payloads are mapped explicitly into `SmallWebRTCPatchRequest`.
- Offer and ICE failures now print tracebacks to `.uvb/logs/pipecat-agent.*.log` for faster diagnosis.
- `src/app/chat/ChatInterface.tsx` now creates `SmallWebRTCTransport` with `WavMediaManager(200, 16000)` so the browser uses a direct mic-backed media stream for local Pipecat WebRTC audio.

## Validation

- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `python -m py_compile services/voice-agent/pipecat_agent.py`
- `http://127.0.0.1:3010` returned `200`
- `http://127.0.0.1:8766/health` returned healthy

## Next Runtime Check

Refresh UVB, start Live Voice, speak one short sentence, then inspect `.uvb/logs/pipecat-agent.out.log` and `.uvb/logs/pipecat-agent.err.log`.

Success criteria:

- `POST /api/offer` stays `200`.
- No repeated `No audio frame received` warnings while speaking.
- Pipecat emits user speaking/transcript events and reaches the local LLM/TTS response path.

