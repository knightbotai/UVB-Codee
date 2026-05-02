# UVB Voice Agent Sidecar

This service is the first realtime voice bridge behind the UVB cockpit.

It exposes a local WebSocket endpoint at `ws://127.0.0.1:8765/live` and keeps the
frontend decoupled from the voice pipeline internals. The current implementation
uses the existing local providers as the stable baseline:

- STT: Faster Whisper OpenAI-compatible endpoint
- LLM: local OpenAI-compatible chat endpoint, usually vLLM on `8003`
- TTS: Kokoro OpenAI-compatible speech endpoint

The sidecar is intentionally provider-shaped so Parakeet Realtime EOU,
MOSS-TTS-Nano, MOSS-TTSD, Chatterbox Turbo, VibeVoice-Realtime, Pipecat
transports, and LiveKit can be added without changing the UVB cockpit surface.

## Current Realtime Direction

The working baseline remains WebSocket because it is already useful locally.
The next transport target is Pipecat v1 with SmallWebRTC for browser voice.
LiveKit remains the later remote/mobile/multi-device transport once the local
loop feels right.

MOSS-TTS is now represented as two provider slots:

- `moss-tts-nano`: realtime/local candidate.
- `moss-ttsd`: expressive/dialogue and cloning candidate.

Both are treated as OpenAI-compatible `/v1/audio/speech` style providers until
we install a concrete local runtime.

## Run

```powershell
cd D:\UVB-KnightBot-Export
python .\services\voice-agent\voice_agent.py
```

If dependencies are missing:

```powershell
.\services\voice-agent\install.ps1
```

Pipecat is tracked separately because it is a heavier runtime dependency:

```powershell
.\services\voice-agent\install.ps1 -WithPipecat
```

Current mode is `baseline-websocket`: a working local bridge that keeps the UVB
frontend stable while Pipecat, Parakeet, Chatterbox, VibeVoice, and LiveKit are
introduced behind the same sidecar contract.
