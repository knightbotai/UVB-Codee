# Avatar Runtime Options

UVB now keeps the lightweight built-in Sophia portrait as the safe default and exposes external avatar engines as selectable settings.

## Current Recommendation

Use the built-in portrait overlay as the fallback, then test OpenAvatarChat with LiteAvatar as the first external sidecar. LiteAvatar is the interesting CPU path, but OpenAvatarChat is the project that wraps it into a real-time interactive digital-human stack.

## Options

| Runtime | Fit for UVB | Notes |
| --- | --- | --- |
| Built-in portrait | Active fallback | Browser-only, fast, state-aware, no external runtime. |
| LiteAvatar | Candidate sidecar | MIT-licensed audio-to-face pipeline. CPU-capable 2D avatar generation, but the base repo is more file/video oriented than a React widget. |
| OpenAvatarChat | Best LiteAvatar integration path | Apache-2.0 modular real-time avatar chat stack. Supports LiteAvatar as the digital-human module and can swap ASR, LLM, and TTS pieces. |
| Live2D Web | Best expressive 2D companion path | Browser/WebGL runtime with expressions, motions, and MotionSync. Requires a rigged Live2D model. |
| VRM / three-vrm | Best 3D browser path | UVB already has Three.js and three-vrm dependencies. Requires a VRM asset and expression/animation mapping. |

## UVB Bridge Shape

The local chat and voice pipeline should publish a small avatar state packet whenever Sophia changes phase:

```json
{
  "activity": "speaking",
  "emotion": "amused",
  "intensity": 0.72,
  "text": "short current sentence",
  "audioUrl": "/api/tts/last.wav"
}
```

The built-in overlay consumes `activity` today. External runtimes should receive the same packet over a local WebSocket or HTTP endpoint so the avatar engine remains replaceable.

## Bootstrap

External engine code is intentionally staged under `.uvb/avatar-engines`, which is ignored by git.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-avatar-engines.ps1 -Engine Both
```

Add `-InstallDependencies` after confirming the Python/uv environment you want to use.

## OpenAvatarChat CPU LiteAvatar Template

UVB includes a first-pass local template at:

```text
services/avatar/openavatarchat-uvb-liteavatar-cpu.yaml
```

It points the OpenAI-compatible LLM handler at UVB's local endpoint on `http://127.0.0.1:8003/v1` and sets the LiteAvatar handler to `use_gpu: false`. OpenAvatarChat's own quick-start still needs dependency/model installation before this can run.

Expected run shape from `.uvb/avatar-engines/OpenAvatarChat`:

```powershell
uv run install.py --config D:\UVB-KnightBot-Export\services\avatar\openavatarchat-uvb-liteavatar-cpu.yaml
uv run scripts/download_models.py --handler liteavatar
uv run src/demo.py --config D:\UVB-KnightBot-Export\services\avatar\openavatarchat-uvb-liteavatar-cpu.yaml
```

The practical integration path is to let UVB remain the source of truth for identity, memory, Telegram, STT, LLM, and Kokoro, then use OpenAvatarChat/LiteAvatar as a local visual renderer once we have its WebRTC/video surface stable.
