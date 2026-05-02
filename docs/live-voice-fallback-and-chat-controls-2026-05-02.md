# Live Voice Fallback and Chat Controls - 2026-05-02

## What Changed

- Added inline chat rename and delete controls to the KnightBot chat thread list.
- Fixed SmallWebRTC ICE patch handling by converting browser ICE candidate dictionaries into Pipecat `IceCandidate` objects.
- Added a Pipecat live voice response fallback: if Pipecat receives a final transcript but does not surface assistant text/audio in the UI after a short grace period, UVB routes the heard transcript through the existing `/api/chat` bridge and speaks the reply through `/api/tts`.
- Improved live waveform behavior by attempting to monitor the local Pipecat audio track directly and scaling Pipecat audio-level events more aggressively.

## Why

The live voice test proved the microphone, WebRTC connection, VAD, STT, and LLM request were active. The remaining failure was downstream: final transcripts appeared in chat, but assistant output did not reliably surface back to the UI. The fallback keeps the user experience from stalling while Pipecat output events are still being hardened.

## Verification

- `bun run typecheck`
- `bun run lint`
- `bun run build`
- `python -m py_compile services/voice-agent/pipecat_agent.py`
- Restarted the hidden Pipecat sidecar and confirmed `http://127.0.0.1:8766/health`

