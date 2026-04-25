# Ultimate Voice Bridge — Backend Integration Plan
## Complete Production Architecture for RTX 5090 (32GB VRAM, Win11)

Last updated: March 28, 2026

---

## TABLE OF CONTENTS

1. IDE & Development Environment
2. Hardware Assumptions
3. LLM Selection (Abliterated/Heretic/MoE/Vision)
4. Full Stack Architecture Diagram
5. Phase-by-Phase Integration
   - Phase 1: LLM Backend (LM Studio or vLLM)
   - Phase 2: STT (faster-whisper / whisper.cpp)
   - Phase 3: TTS (Qwen3-TTS primary, Fish Audio S2 Pro alt)
   - Phase 4: Turn Detection (Pipecat Smart Turn v3.2)
   - Phase 5: Orchestration (Pipecat)
   - Phase 6: Vision Models
   - Phase 7: RAG Memory Pipeline
   - Phase 8: Podcast Engine
6. CUDA/TensorRT/NVFP4 Optimization Guide
7. Complete Command Reference
8. Troubleshooting & Gotchas

---

## 1. IDE & DEVELOPMENT ENVIRONMENT

### Recommendation: VS Code + Cline (BYOK)

**Why Cline over Cursor/Windsurf/Trae:**

- Open source, completely free, no subscription
- Model-agnostic: connects to your LOCAL LLM via LM Studio's OpenAI-compatible API
- Full agentic behavior: reads codebase, writes files, runs terminal, self-corrects
- Works with your existing VS Code setup and extensions
- You keep full control over costs and model choice
- Active community, rapid feature development

**Alternative if you want a polished dedicated IDE:**
- **Cursor** ($20/mo) — best multi-repo reasoning, VS Code compatible
- **Trae** (free, by ByteDance) — fully free Cursor alternative with auto-env setup

### Setup Steps

1. Install VS Code: https://code.visualstudio.com
2. Install Cline extension from VS Code marketplace
3. In Cline settings, set API provider to "OpenAI Compatible"
4. Set base URL to `http://localhost:1234/v1` (LM Studio)
5. Set API key to `lm-studio` (any non-empty string works)
6. Select your local model from the dropdown

**Key Extensions to Install:**
- Cline (agentic coding)
- Python (Microsoft)
- Pylance
- GitLens
- Thunder Client (API testing)
- Docker (for containerized services)

---

## 2. HARDWARE ASSUMPTIONS

| Component | Spec |
|-----------|------|
| CPU | Intel i9-14900KF (24C/32T) |
| RAM | 64GB DDR5 |
| GPU | NVIDIA RTX 5090 32GB GDDR7 |
| VRAM Bandwidth | 1.79 TB/s |
| Compute Capability | SM120 (Blackwell) |
| OS | Windows 11 Home 64-bit |
| CUDA | 12.8+ (required for Blackwell) |
| Driver | 570.xx+ (Blackwell support) |

**VRAM Budget (32GB total):**
- LLM: 18-24GB (depending on model size & quantization)
- STT: 1-2GB (Whisper large-v3)
- TTS: 2-4GB (Qwen3-TTS or Fish S2)
- Vision: 2-4GB (when loaded)
- System overhead: 2-3GB
- Reserve: ~2GB

---

## 3. LLM SELECTION

### Primary Recommendation: Qwen3.5 72B Abliterated (NVFP4)

- **Why:** Best intelligence-to-VRAM ratio on 5090. NVFP4 quantization fits 72B in ~18GB, leaving room for STT+TTS
- **Format:** NVFP4 via vLLM (Blackwell-native 4-bit quantization)
- **Fallback GGUF:** Q4_K_M via LM Studio if NVFP4 gives trouble
- **Repo:** `Li-Lee/vllm-qwen3.5-nvfp4-5090` (5090-specific optimization)

### Alternative Models (ranked by fit for UVB):

| Model | Size | VRAM (Q4) | Strength | Notes |
|-------|------|-----------|----------|-------|
| Qwen3.5 72B Abliterated | 72B | ~18GB NVFP4 | General, coding, reasoning | Best overall |
| Dolphin 3.0 (Llama 4) | 70B | ~20GB Q4 | Instruction following, coding | Top uncensored |
| DeepSeek R1 Abliterated | 70B | ~20GB Q4 | Math, logic, reasoning | Chain-of-thought native |
| Nous Hermes 3 | 70B | ~20GB Q4 | Creative writing, roleplay | Best "personality" |
| Llama 4 Scout (MoE) | 109B/17B active | ~16GB Q3 | Massive context, multi-task | MoE = efficient |

### Vision Model (separate or multimodal):

| Model | VRAM | Capabilities |
|-------|------|-------------|
| Qwen2.5-VL 72B | ~20GB Q4 | Full vision+language |
| InternVL3 78B | ~22GB Q4 | State-of-art vision |
| MiniCPM-V 2.6 | ~6GB | Lightweight vision |

**Strategy:** Use a multimodal model like Qwen3.5-VL 72B to handle both text and vision in a single model, saving VRAM by not running two separate models.

### Heretic/Abliterated Sources:

- **DavidAU's Heretic Collection:** huggingface.co/collections/DavidAU/heretic-abliterated-uncensored-unrestricted-power
- **Dolphin series:** cognitivecomputations/Dolphin (HuggingFace)
- **gpt-oss-120b-heretic-v2:** llmfan46/gpt-oss-120b-heretic-v2-GGUF

---

## 4. FULL STACK ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    UVB KNIGHTBOT BACKEND                        │
│                     (RTX 5090 32GB VRAM)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Pipecat     │    │  FastAPI      │    │  WebSocket   │      │
│  │  Orchestrator │◄──►│  Backend      │◄──►│  Gateway     │      │
│  │  (Python)     │    │  (Python)     │    │  (Realtime)  │      │
│  └──────┬───────┘    └──────────────┘    └──────┬───────┘      │
│         │                                        │              │
│  ┌──────┴────────────────────────────────────────┴───────┐     │
│  │                  PIPELINE LAYER                        │     │
│  ├──────────┬──────────┬──────────┬──────────┬───────────┤     │
│  │          │          │          │          │           │     │
│  │  ┌───────┴──┐ ┌─────┴────┐ ┌──┴───────┐ ┌┴─────────┐│     │
│  │  │  STT     │ │  LLM     │ │  TTS     │ │ Vision   ││     │
│  │  │ faster-  │ │ LM Studio│ │ Qwen3-   │ │ Qwen-VL  ││     │
│  │  │ whisper  │ │ or vLLM  │ │ TTS      │ │ 72B      ││     │
│  │  │          │ │          │ │          │ │          ││     │
│  │  │  1-2GB   │ │ 18-24GB  │ │  2-4GB   │ │ (shared) ││     │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘│     │
│  │                                                       │     │
│  │  ┌─────────────────────────────────────────────────┐  │     │
│  │  │         Pipecat Smart Turn v3.2                  │  │     │
│  │  │         (Turn Detection / Barge-in)              │  │     │
│  │  │         ~200MB                                   │  │     │
│  │  └─────────────────────────────────────────────────┘  │     │
│  └───────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              PERSISTENCE LAYER                         │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐ │     │
│  │  │ SQLite   │  │ ChromaDB │  │ Drizzle ORM          │ │     │
│  │  │ (threads │  │ (RAG     │  │ (schema/migrations)  │ │     │
│  │  │  users)  │  │ vectors) │  │                      │ │     │
│  │  └──────────┘  └──────────┘  └──────────────────────┘ │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│  UVB Frontend    │  │  LM Studio GUI   │
│  (Next.js 16)    │  │  (Model Mgmt)    │
│  localhost:3000   │  │  localhost:1234   │
└──────────────────┘  └──────────────────┘
```

---

## 5. PHASE-BY-PHASE INTEGRATION

### PHASE 1: LLM Backend (Days 1-2)

#### Option A: LM Studio (Easiest)

LM Studio provides an OpenAI-compatible API server out of the box.

```
1. Download LM Studio: https://lmstudio.ai
2. Download model: search "Qwen3.5 72B" or your chosen model
3. Click "Local Server" tab
4. Click "Start Server"
5. Server runs at http://localhost:1234/v1
```

**Test it:**
```powershell
curl http://localhost:1234/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"qwen3.5-72b","messages":[{"role":"user","content":"Hello KnightBot"}]}'
```

#### Option B: vLLM (Maximum Performance + NVFP4)

vLLM gives you PagedAttention, continuous batching, and native NVFP4 on Blackwell.

```powershell
# Install CUDA 12.8+ toolkit first
# Then install vLLM with Blackwell support
pip install vllm --extra-index-url https://download.pytorch.org/whl/cu128

# Start server with your model
vllm serve Qwen/Qwen3.5-72B-Instruct-AWQ `
  --quantization awq `
  --max-model-len 8192 `
  --gpu-memory-utilization 0.75 `
  --port 8000
```

**For NVFP4 specifically (fastest on 5090):**
```powershell
# Use the 5090-optimized repo
git clone https://github.com/Li-Lee/vllm-qwen3.5-nvfp4-5090.git
cd vllm-qwen3.5-nvfp4-5090
# Follow repo instructions for quantized model download + serve
```

#### UVB Backend Integration:

Create `uvb-backend/src/llm_client.py`:
```python
from openai import AsyncOpenAI

class LLMClient:
    def __init__(self, base_url: str = "http://localhost:1234/v1"):
        self.client = AsyncOpenAI(
            base_url=base_url,
            api_key="lm-studio"
        )
    
    async def chat(self, messages: list, model: str = "qwen3.5-72b") -> str:
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
            stream=False
        )
        return response.choices[0].message.content
    
    async def chat_stream(self, messages: list, model: str = "qwen3.5-72b"):
        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=2048,
            stream=True
        )
        async for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

---

### PHASE 2: STT — Speech-to-Text (Days 2-3)

#### Primary: faster-whisper (GPU-accelerated)

faster-whisper uses CTranslate2 for 4x faster inference than original Whisper.

```powershell
pip install faster-whisper
```

Create `uvb-backend/src/stt/engine.py`:
```python
from faster_whisper import WhisperModel
import numpy as np

class STTEngine:
    def __init__(self, model_size: str = "large-v3", device: str = "cuda"):
        self.model = WhisperModel(
            model_size,
            device=device,
            compute_type="float16",  # Use "int8_float16" for less VRAM
            cpu_threads=4
        )
    
    def transcribe(self, audio_path: str) -> dict:
        segments, info = self.model.transcribe(
            audio_path,
            beam_size=5,
            language=None,  # auto-detect
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200
            )
        )
        return {
            "text": " ".join(seg.text for seg in segments),
            "language": info.language,
            "duration": info.duration,
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text}
                for s in segments
            ]
        }
    
    def transcribe_streaming(self, audio_chunks):
        """For real-time streaming STT"""
        # Use whisper-streaming or WhisperLive for real-time
        # See Phase 5 for Pipecat integration
        pass
```

#### Alternative: whisper.cpp (CPU+GPU hybrid)

whisper.cpp is C++ based, runs everywhere, excellent for real-time.

```powershell
# Clone and build with CUDA
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DWHISPER_CUDA=ON
cmake --build build --config Release -j 16

# Download model
.\models\download-ggml-model.cmd large-v3

# Run
.\build\bin\Release\whisper-cli.exe -m models\ggml-large-v3.bin -f input.wav
```

#### Real-time Streaming STT Options:

For barge-in support, you need streaming STT, not batch:

1. **WhisperLive** — WebSocket-based real-time transcription
2. **whisper-streaming** — Local buffering + incremental decoding
3. **Pipecat's built-in STT service** — handles it in the pipeline (recommended)

---

### PHASE 3: TTS — Text-to-Speech (Days 3-5)

#### Primary: Qwen3-TTS

Qwen3-TTS: 3-second rapid voice cloning, streaming, 97ms latency.

```powershell
# Clone the repo
git clone https://github.com/QwenLM/Qwen3-TTS.git
cd Qwen3-TTS

# Install dependencies
pip install -e .

# Download model
huggingface-cli download Qwen/Qwen3-TTS-0.6B
huggingface-cli download Qwen/Qwen3-TTS-3B  # Larger = better quality

# Run server
python server.py --model Qwen/Qwen3-TTS-3B --port 8888
```

**Voice Cloning (3-second sample):**
```python
import requests

response = requests.post(
    "http://localhost:8888/tts",
    json={
        "text": "Welcome to KnightBot, your AI assistant.",
        "reference_audio": "path/to/3-sec-voice-sample.wav",
        "reference_text": "Transcript of the reference audio.",
        "streaming": True
    }
)
```

#### Alternative: Fish Audio S2 Pro

Fish S2 Pro: ~100ms TTFT, 80+ languages, 15,000 emotion tags, instruction-following.

```powershell
# Install via Docker (recommended)
docker pull frankleeeee/sglang-omni:dev
docker run -it --shm-size 32g --gpus all frankleeeee/sglang-omni:dev /bin/zsh

# Inside Docker:
git clone https://github.com/sgl-project/sglang-omni.git
cd sglang-omni
uv venv .venv -p 3.12 && source .venv/bin/activate
uv pip install -v ".[s2pro]"
huggingface-cli download fishaudio/s2-pro

# Start server
python -m sglang_omni.cli.cli serve \
    --model-path fishaudio/s2-pro \
    --config examples/configs/s2pro_tts.yaml \
    --port 8000
```

**Voice Cloning with S2 Pro:**
```bash
curl -X POST http://localhost:8000/v1/audio/speech \
    -H "Content-Type: application/json" \
    -d '{
        "input": "Hello, how can I help you today?",
        "references": [{"audio_path": "ref.wav", "text": "Transcript here."}]
    }' \
    --output output.wav
```

#### UVB TTS Client:

```python
# uvb-backend/src/tts/client.py
import aiohttp
import asyncio

class TTSClient:
    def __init__(self, engine: str = "qwen3", port: int = 8888):
        self.engine = engine
        self.base_url = f"http://localhost:{port}"
    
    async def synthesize(self, text: str, voice_id: str = "default") -> bytes:
        if self.engine == "qwen3":
            return await self._qwen3_tts(text, voice_id)
        elif self.engine == "fish-s2":
            return await self._fish_s2_tts(text, voice_id)
    
    async def synthesize_stream(self, text: str, voice_id: str = "default"):
        """Stream audio chunks for real-time playback"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/tts",
                json={"text": text, "streaming": True, "voice": voice_id}
            ) as resp:
                async for chunk in resp.content.iter_chunked(4096):
                    yield chunk
    
    async def _qwen3_tts(self, text, voice_id):
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/tts",
                json={"text": text, "voice": voice_id}
            ) as resp:
                return await resp.read()
    
    async def _fish_s2_tts(self, text, voice_id):
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/v1/audio/speech",
                json={"input": text}
            ) as resp:
                return await resp.read()
```

---

### PHASE 4: Turn Detection — Barge-in (Days 5-6)

Pipecat Smart Turn v3.2: semantic VAD that analyzes raw waveforms to detect turn completion.

```powershell
# Install Pipecat
pip install pipecat-ai

# Smart Turn v3 model auto-downloads when used
# Or manually:
pip install smart-turn
```

**Standalone Smart Turn usage:**
```python
from smart_turn import SmartTurnAnalyzer
import numpy as np

analyzer = SmartTurnAnalyzer(model_name="pipecat-ai/smart-turn-v3")

# Analyze audio chunk
audio_chunk = np.random.randn(16000).astype(np.float32)  # 1 second at 16kHz
result = analyzer.predict(audio_chunk)

print(f"Turn complete: {result.is_complete}")
print(f"Confidence: {result.confidence}")
```

**Integration with Pipecat pipeline:**
```python
from pipecat.audio.turn.smart_turn import SmartTurnAnalyzer
from pipecat.audio.vad.silero import SileroVADAnalyzer

pipeline = Pipeline([
    transport.input(),
    SileroVADAnalyzer(),           # Basic VAD
    SmartTurnAnalyzer(),           # Semantic turn detection
    stt_service,
    llm_service,
    tts_service,
    transport.output(),
])
```

---

### PHASE 5: Orchestration — Pipecat (Days 6-8)

Pipecat ties everything together in a real-time pipeline.

```powershell
pip install pipecat-ai[silero,daily,openai]
```

**Complete Pipecat pipeline for KnightBot:**
```python
# uvb-backend/src/pipeline/knightbot_pipeline.py
import asyncio
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.turn.smart_turn import SmartTurnAnalyzer
from pipecat.transports.base_transport import BaseTransport

async def create_knightbot_pipeline(transport: BaseTransport):
    # STT: faster-whisper via Pipecat service
    stt = WhisperSTTService(
        model="large-v3",
        device="cuda",
        language="en"
    )
    
    # LLM: OpenAI-compatible (LM Studio or vLLM)
    llm = OpenAILLMService(
        base_url="http://localhost:1234/v1",
        api_key="lm-studio",
        model="qwen3.5-72b"
    )
    
    # TTS: Custom service wrapping Qwen3-TTS
    # (You'll write a Pipecat TTS service wrapper)
    from uvb_backend.src.tts.pipecat_service import QwenTTSService
    tts = QwenTTSService(base_url="http://localhost:8888")
    
    # Context management
    context = OpenAILLMContext(
        messages=[{
            "role": "system",
            "content": "You are KnightBot, a helpful AI assistant..."
        }]
    )
    context_aggregator = llm.create_context_aggregator(context)
    
    # Pipeline
    pipeline = Pipeline([
        transport.input(),
        SileroVADAnalyzer(),
        SmartTurnAnalyzer(),
        stt,
        context_aggregator.user(),
        llm,
        tts,
        context_aggregator.assistant(),
        transport.output(),
    ])
    
    task = PipelineTask(pipeline)
    runner = PipelineRunner()
    
    return task, runner
```

---

### PHASE 6: Vision Models (Days 8-10)

For image captioning and video understanding in the Media Studio.

```powershell
# Option A: Use multimodal LLM (Qwen-VL) through LM Studio
# Just load Qwen2.5-VL-72B in LM Studio — it serves both text and vision

# Option B: Dedicated vision service
pip install transformers accelerate

# Run Qwen2.5-VL as a separate service
python -m vllm serve Qwen/Qwen2.5-VL-72B-Instruct-AWQ \
  --quantization awq \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.5 \
  --port 8001
```

**Vision API client:**
```python
# uvb-backend/src/vision/client.py
from openai import AsyncOpenAI
import base64

class VisionClient:
    def __init__(self, base_url: str = "http://localhost:8001/v1"):
        self.client = AsyncOpenAI(base_url=base_url, api_key="dummy")
    
    async def caption_image(self, image_path: str) -> str:
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()
        
        response = await self.client.chat.completions.create(
            model="qwen2.5-vl-72b",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Describe this image in detail."},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                ]
            }],
            max_tokens=1024
        )
        return response.choices[0].message.content
    
    async def analyze_video(self, video_path: str) -> str:
        # Extract key frames, then analyze each
        # Or use Qwen-VL's native video understanding
        pass
```

---

### PHASE 7: RAG Memory Pipeline (Days 10-12)

```powershell
pip install chromadb sentence-transformers
```

```python
# uvb-backend/src/memory/rag.py
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

class MemoryBank:
    def __init__(self, persist_dir: str = "./data/memory"):
        self.client = chromadb.Client(Settings(
            chroma_db_impl="duckdb+parquet",
            persist_directory=persist_dir
        ))
        self.collection = self.client.get_or_create_collection(
            name="knightbot_memory",
            metadata={"hnsw:space": "cosine"}
        )
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")
    
    def store(self, content: str, metadata: dict) -> str:
        embedding = self.embedder.encode(content).tolist()
        doc_id = f"mem_{hash(content) & 0xFFFFFFFF:08x}"
        self.collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[content],
            metadatas=[metadata]
        )
        return doc_id
    
    def retrieve(self, query: str, n_results: int = 5) -> list:
        embedding = self.embedder.encode(query).tolist()
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=n_results
        )
        return [
            {"content": doc, "score": score, "metadata": meta}
            for doc, score, meta in zip(
                results["documents"][0],
                results["distances"][0],
                results["metadatas"][0]
            )
        ]
```

---

### PHASE 8: Podcast Engine (Days 12-14)

Multi-track recording with per-seat voice profiles.

```python
# uvb-backend/src/podcast/engine.py
import sounddevice as sd
import numpy as np
import wave
from dataclasses import dataclass
from typing import Optional

@dataclass
class PodcastSeat:
    id: str
    name: str
    voice_profile_id: Optional[str] = None
    is_custom_voice: bool = False
    sample_audio_path: Optional[str] = None
    is_active: bool = False

class PodcastEngine:
    def __init__(self, sample_rate: int = 48000, channels: int = 1):
        self.sample_rate = sample_rate
        self.channels = channels
        self.seats: dict[str, PodcastSeat] = {}
        self.tracks: dict[str, list[np.ndarray]] = {}
        self.is_recording = False
    
    def add_seat(self, seat: PodcastSeat):
        self.seats[seat.id] = seat
        self.tracks[seat.id] = []
    
    def start_recording(self):
        self.is_recording = True
        # Start audio capture per seat
        for seat_id, seat in self.seats.items():
            if seat.is_active:
                self._start_track_recording(seat_id)
    
    def stop_recording(self) -> dict[str, bytes]:
        self.is_recording = False
        return {sid: self._mix_track(data) for sid, data in self.tracks.items()}
    
    def export(self, format: str = "wav") -> bytes:
        # Mix all tracks into final output
        pass
```

---

## 6. CUDA/TENSORRT/NVFP4 OPTIMIZATION

### NVFP4 (Blackwell-Native 4-bit)

NVFP4 is exclusive to Blackwell GPUs (RTX 5090, B200). It provides:
- 2x memory efficiency vs FP8
- Near-lossless quality for LLMs
- Native hardware acceleration (no emulation)

```powershell
# Use vLLM with NVFP4 models
pip install vllm --extra-index-url https://download.pytorch.org/whl/cu128

# Serve with FP4 quantization
vllm serve <model> --quantization fp4 --dtype float16
```

### TensorRT-LLM (Maximum Throughput)

TensorRT-LLM is 20-100% faster than vLLM in raw throughput, but harder to set up.

```powershell
# Install via NGC container (recommended)
docker pull nvcr.io/nvidia/tensorrt-llm/release:latest
docker run --gpus all -it nvcr.io/nvidia/tensorrt-llm/release:latest

# Or pip install
pip install tensorrt-llm --extra-index-url https://pypi.nvidia.com
```

**When to use TensorRT-LLM vs vLLM:**
- vLLM: easier setup, Mamba support, OpenAI API, good enough for most
- TensorRT-LLM: pure Transformer models, maximum tok/s, FP4 native, harder DevOps

### CUDA 12.8+ Required

```powershell
# Verify CUDA version
nvcc --version
nvidia-smi

# Install CUDA Toolkit 12.8+ from:
# https://developer.nvidia.com/cuda-downloads
```

### PyTorch for Blackwell

```powershell
# Nightly build with CUDA 12.8 support
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128
```

---

## 7. COMPLETE COMMAND REFERENCE

### Environment Setup (One-Time)

```powershell
# 1. Install Python 3.12
winget install Python.Python.3.12

# 2. Install CUDA Toolkit 12.8+
# Download from https://developer.nvidia.com/cuda-downloads

# 3. Create project environment
cd D:\UVB-KnightBot
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 4. Install PyTorch (Blackwell)
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu128

# 5. Install all dependencies
pip install vllm faster-whisper pipecat-ai[silero] openai aiohttp chromadb sentence-transformers transformers accelerate sounddevice numpy scipy fastapi uvicorn websockets python-multipart

# 6. Install LM Studio
winget install LMStudio.LMStudio
```

### Daily Startup Sequence

```powershell
# Terminal 1: LLM Server (LM Studio GUI or vLLM)
vllm serve Qwen/Qwen3.5-72B-Instruct-AWQ --quantization awq --port 8000

# Terminal 2: TTS Server
cd Qwen3-TTS
python server.py --model Qwen/Qwen3-TTS-3B --port 8888

# Terminal 3: UVB Backend
cd D:\UVB-KnightBot\uvb-backend
python -m uvicorn src.main:app --reload --port 5000

# Terminal 4: UVB Frontend
cd D:\UVB-KnightBot
bun dev
# Open http://localhost:3000
```

---

## 8. TROUBLESHOOTING

### "CUDA out of memory"
- Reduce LLM context length (--max-model-len 4096)
- Use smaller quantization (Q3_K_M instead of Q4_K_M)
- Don't run LLM + Vision simultaneously
- Monitor: `nvidia-smi -l 1`

### "SM120 not supported"
- Update PyTorch to nightly with CUDA 12.8
- Update NVIDIA driver to 570+
- Use vLLM 0.17+ (first version with stable Blackwell support)

### "Hydration mismatch" (Frontend)
- Already fixed with `suppressHydrationWarning`
- Disable Dark Reader browser extension if issues persist

### TTS latency too high
- Enable streaming mode in Qwen3-TTS
- Use torch.compile for Fish S2 Pro (5x speedup)
- Pre-warm models on startup

### Pipecat Smart Turn not detecting
- Ensure audio is 16kHz mono
- Check VAD sensitivity settings
- v3.2 handles noisy environments better than v3.0

---

## TIMELINE SUMMARY

| Phase | Component | Days | Key Deliverable |
|-------|-----------|------|-----------------|
| 1 | LLM Backend | 1-2 | LM Studio/vLLM serving Qwen3.5 72B |
| 2 | STT | 2-3 | faster-whisper transcribing audio |
| 3 | TTS | 3-5 | Qwen3-TTS synthesizing speech |
| 4 | Turn Detection | 5-6 | Smart Turn v3.2 barge-in working |
| 5 | Orchestration | 6-8 | Pipecat pipeline: mic in → speaker out |
| 6 | Vision | 8-10 | Image/video captioning via API |
| 7 | RAG Memory | 10-12 | ChromaDB storing/retrieving context |
| 8 | Podcast | 12-14 | Multi-track recording with voice clone |

**Total estimated time: 2-3 weeks for a fully functional KnightBot backend.**

---

This plan is based on research conducted March 28, 2026. The AI landscape moves fast — verify model availability and API compatibility before starting each phase.
