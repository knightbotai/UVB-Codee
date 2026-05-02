# Live Voice Latency Tuning - 2026-05-02

## Finding

The reported ~35 second live voice delay was real. Pipecat logs showed Faster Whisper STT usually returning in ~1-4 seconds, while the Pipecat-side LLM pass often took ~21-28 seconds for short prompts. Pipecat-side OpenAI TTS also failed against the Kokoro voice value `af_nova`, so that path spent extra time without producing usable audio.

## Change

- Kept Pipecat SmallWebRTC as the live mic/VAD/STT front-end.
- Disabled Pipecat-side LLM/TTS by default, with `UVB_PIPECAT_FULL_PIPELINE=true` available as an opt-in diagnostic path.
- Routed completed live voice turns through UVB's existing `/api/chat` and `/api/tts` stack with a short live-response prompt and a 160-token cap.
- Buffered final transcript chunks briefly before sending so small pauses are less likely to split one thought into multiple prompts.
- Added a live mic mute/unmute button to prevent room noise, throat clearing, or side conversations from triggering VAD/barge-in.

## Next Watchpoints

- If latency remains high after this change, inspect `/api/chat` timing and local model throughput on port `8003`.
- If STT remains above ~4 seconds for short turns, evaluate Parakeet/streaming STT options.
- If Kokoro TTS becomes the bottleneck, evaluate MOSS-TTS-Realtime or another streaming TTS sidecar after measuring `/api/tts` timing directly.

