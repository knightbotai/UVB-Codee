from __future__ import annotations

import asyncio
import os
from typing import Any
import traceback

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.openai.stt import OpenAISTTService
from pipecat.services.openai.tts import OpenAITTSService
from pipecat.transcriptions.language import Language
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.request_handler import (
    IceCandidate,
    SmallWebRTCPatchRequest,
    SmallWebRTCRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport


load_dotenv()

HOST = os.getenv("UVB_PIPECAT_HOST", "127.0.0.1")
PORT = int(os.getenv("UVB_PIPECAT_PORT", "8766"))

DEFAULT_SYSTEM_PROMPT = (
    "You are KnightBot inside UVB, a local multimodal AI cockpit. Be direct, useful, "
    "warm, concise, and conversational. This is realtime voice, so keep replies "
    "interruptible and avoid reading Markdown syntax aloud."
)

DEFAULT_STT_PROMPT = (
    "Transcribe spoken English with natural punctuation, capitalization, sentence "
    "boundaries, commas, periods, and question marks. Preserve the speaker's words exactly."
)


def env(name: str, default: str) -> str:
    return os.getenv(name, default).strip()


def normalize_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    return value.removesuffix("/audio/transcriptions").removesuffix("/audio/speech")


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def stt_language(value: Any) -> Language:
    try:
        return Language(str(value or env("UVB_STT_LANGUAGE", "en")).strip())
    except ValueError:
        return Language.EN


def merge_request_settings(payload: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = payload or {}
    request_data = payload.get("requestData") if isinstance(payload.get("requestData"), dict) else {}
    model_settings = (
        request_data.get("modelSettings")
        if isinstance(request_data.get("modelSettings"), dict)
        else {}
    )
    voice_settings = (
        request_data.get("voiceSettings")
        if isinstance(request_data.get("voiceSettings"), dict)
        else {}
    )
    return model_settings, voice_settings


def normalize_ice_candidates(candidates: list[Any] | None) -> list[IceCandidate]:
    normalized: list[IceCandidate] = []
    for candidate in candidates or []:
        if isinstance(candidate, IceCandidate):
            normalized.append(candidate)
            continue

        if not isinstance(candidate, dict):
            continue

        candidate_sdp = candidate.get("candidate")
        sdp_mid = candidate.get("sdpMid") or candidate.get("sdp_mid")
        sdp_mline_index = candidate.get("sdpMLineIndex")
        if sdp_mline_index is None:
            sdp_mline_index = candidate.get("sdp_mline_index")

        if candidate_sdp is None or sdp_mid is None or sdp_mline_index is None:
            continue

        normalized.append(
            IceCandidate(
                candidate=str(candidate_sdp),
                sdp_mid=str(sdp_mid),
                sdp_mline_index=int(sdp_mline_index),
            )
        )

    return normalized


def create_app() -> FastAPI:
    app = FastAPI(title="UVB Pipecat SmallWebRTC Agent")
    request_handler = SmallWebRTCRequestHandler()
    active_tasks: set[asyncio.Task[Any]] = set()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3010",
            "http://127.0.0.1:3010",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def run_pipeline(
        connection: SmallWebRTCConnection,
        model_settings: dict[str, Any] | None = None,
        voice_settings: dict[str, Any] | None = None,
    ) -> None:
        model_settings = model_settings or {}
        voice_settings = voice_settings or {}
        full_pipeline = truthy(
            voice_settings.get("liveFullPipeline")
            or os.getenv("UVB_PIPECAT_FULL_PIPELINE", "false")
        )
        transport = SmallWebRTCTransport(
            webrtc_connection=connection,
            params=TransportParams(
                audio_in_enabled=True,
                audio_out_enabled=full_pipeline,
                audio_in_sample_rate=16000,
                audio_out_sample_rate=24000,
            ),
        )

        stt = OpenAISTTService(
            api_key=str(model_settings.get("apiKey") or env("UVB_LLM_API_KEY", "uvb-local")),
            base_url=normalize_base_url(
                str(voice_settings.get("sttUrl") or env("UVB_STT_URL", "http://127.0.0.1:8001/v1"))
            ),
            model=str(voice_settings.get("sttModel") or env("UVB_STT_MODEL", "Systran/faster-distil-whisper-large-v3")),
            language=stt_language(voice_settings.get("sttLanguage")),
            prompt=str(
                voice_settings.get("sttPrompt")
                or os.getenv("UVB_STT_PROMPT")
                or DEFAULT_STT_PROMPT
            ),
            temperature=float(voice_settings.get("sttTemperature") or env("UVB_STT_TEMPERATURE", "0")),
        )
        vad = VADProcessor(vad_analyzer=SileroVADAnalyzer(), audio_idle_timeout=1.0)
        pipeline_steps = [transport.input(), vad, stt]

        if full_pipeline:
            llm = OpenAILLMService(
                api_key=str(model_settings.get("apiKey") or env("UVB_LLM_API_KEY", "uvb-local")),
                base_url=normalize_base_url(
                    str(model_settings.get("baseUrl") or env("UVB_LLM_BASE_URL", "http://127.0.0.1:8003/v1"))
                ),
                model=str(model_settings.get("model") or env("UVB_LLM_MODEL", "qwen36-35b-a3b-heretic-nvfp4")),
            )
            tts = OpenAITTSService(
                api_key=str(model_settings.get("apiKey") or env("UVB_LLM_API_KEY", "uvb-local")),
                base_url=normalize_base_url(
                    str(voice_settings.get("ttsUrl") or env("UVB_TTS_URL", "http://127.0.0.1:8880/v1"))
                ),
                model=env("UVB_TTS_MODEL", "tts-1"),
                voice=str(voice_settings.get("ttsVoice") or env("UVB_TTS_VOICE", "af_nova")),
            )
            context = LLMContext(
                messages=[
                    {
                        "role": "system",
                        "content": str(
                            voice_settings.get("systemPrompt")
                            or env("UVB_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT)
                        ),
                    }
                ]
            )
            context_aggregator = LLMContextAggregatorPair(context)
            pipeline_steps.extend(
                [
                    context_aggregator.user(),
                    llm,
                    tts,
                    transport.output(),
                    context_aggregator.assistant(),
                ]
            )
        else:
            pipeline_steps.append(transport.output())

        pipeline = Pipeline(pipeline_steps)
        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                audio_in_sample_rate=16000,
                audio_out_sample_rate=24000,
                enable_metrics=True,
                enable_usage_metrics=True,
            ),
            idle_timeout_secs=600,
        )

        @transport.event_handler("on_client_disconnected")
        async def on_client_disconnected(_transport, _connection):
            await task.cancel()

        runner = PipelineRunner(handle_sigint=False, handle_sigterm=False)
        await runner.run(task)

    async def schedule_pipeline(
        connection: SmallWebRTCConnection,
        model_settings: dict[str, Any] | None = None,
        voice_settings: dict[str, Any] | None = None,
    ) -> None:
        task = asyncio.create_task(run_pipeline(connection, model_settings, voice_settings))
        active_tasks.add(task)
        task.add_done_callback(active_tasks.discard)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "ok": True,
            "service": "uvb-pipecat-smallwebrtc",
            "activeSessions": len(active_tasks),
            "llm": env("UVB_LLM_BASE_URL", "http://127.0.0.1:8003/v1"),
            "stt": env("UVB_STT_URL", "http://127.0.0.1:8001/v1/audio/transcriptions"),
            "tts": env("UVB_TTS_URL", "http://127.0.0.1:8880/v1/audio/speech"),
        }

    @app.post("/api/offer")
    async def offer(request: Request) -> dict[str, Any]:
        try:
            payload = await request.json()
            model_settings, voice_settings = merge_request_settings(payload)
            webrtc_request = SmallWebRTCRequest(
                sdp=payload["sdp"],
                type=payload["type"],
                pc_id=payload.get("pc_id"),
                restart_pc=payload.get("restart_pc"),
                request_data=payload.get("request_data") or payload.get("requestData"),
            )
            return await request_handler.handle_web_request(
                webrtc_request,
                lambda connection: schedule_pipeline(connection, model_settings, voice_settings),
            )
        except Exception as error:
            print("SmallWebRTC offer failed:", repr(error), flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.patch("/api/offer")
    async def patch_offer(request: Request) -> dict[str, Any] | None:
        try:
            payload = await request.json()
            patch_request = SmallWebRTCPatchRequest(
                pc_id=payload["pc_id"],
                candidates=normalize_ice_candidates(payload.get("candidates")),
            )
            return await request_handler.handle_patch_request(patch_request)
        except HTTPException:
            raise
        except Exception as error:
            print("SmallWebRTC ICE patch failed:", repr(error), flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.on_event("shutdown")
    async def shutdown() -> None:
        for task in list(active_tasks):
            task.cancel()
        await request_handler.close()

    return app


app = create_app()


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
