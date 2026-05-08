import io
import json
import re
import urllib.request
from typing import Dict, Optional, cast

import librosa
import numpy as np
from loguru import logger
from pydantic import BaseModel, Field

from chat_engine.common.handler_base import HandlerBase, HandlerBaseInfo, HandlerDataInfo, HandlerDetail
from chat_engine.contexts.handler_context import HandlerContext
from chat_engine.data_models.chat_data.chat_data_model import ChatData
from chat_engine.data_models.chat_data_type import ChatDataType
from chat_engine.data_models.chat_engine_config_data import ChatEngineConfigModel, HandlerBaseConfigModel
from chat_engine.data_models.runtime_data.data_bundle import DataBundle, DataBundleDefinition, DataBundleEntry
from chat_engine.contexts.session_context import SessionContext


class TTSConfig(HandlerBaseConfigModel, BaseModel):
    endpoint: str = Field(default="http://127.0.0.1:8880/v1/audio/speech")
    voice: str = Field(default="af_nova")
    sample_rate: int = Field(default=24000)
    timeout: float = Field(default=120.0)


class TTSContext(HandlerContext):
    def __init__(self, session_id: str):
        super().__init__(session_id)
        self.input_text = ""


class HandlerTTS(HandlerBase):
    def __init__(self):
        super().__init__()
        self.endpoint = "http://127.0.0.1:8880/v1/audio/speech"
        self.voice = "af_nova"
        self.sample_rate = 24000
        self.timeout = 120.0

    def get_handler_info(self) -> HandlerBaseInfo:
        return HandlerBaseInfo(config_model=TTSConfig)

    def get_handler_detail(self, session_context: SessionContext, context: HandlerContext) -> HandlerDetail:
        definition = DataBundleDefinition()
        definition.add_entry(DataBundleEntry.create_audio_entry("avatar_audio", 1, self.sample_rate))
        return HandlerDetail(
            inputs={ChatDataType.AVATAR_TEXT: HandlerDataInfo(type=ChatDataType.AVATAR_TEXT)},
            outputs={ChatDataType.AVATAR_AUDIO: HandlerDataInfo(type=ChatDataType.AVATAR_AUDIO, definition=definition)},
        )

    def load(self, engine_config: ChatEngineConfigModel, handler_config: Optional[BaseModel] = None):
        config = cast(TTSConfig, handler_config)
        self.endpoint = config.endpoint
        self.voice = config.voice
        self.sample_rate = config.sample_rate
        self.timeout = config.timeout

    def create_context(self, session_context, handler_config=None):
        return TTSContext(session_context.session_info.session_id)

    def start_context(self, session_context, context: HandlerContext):
        pass

    def filter_text(self, text: str, *, final: bool = False) -> str:
        text = re.sub(r"<\|.*?\|>", "", text)
        text = re.sub(r"[*_`#>\[\]{}]", "", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip() if final else text

    def synthesize(self, text: str) -> np.ndarray:
        payload = json.dumps({"input": text, "voice": self.voice}).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            audio_bytes = response.read()
        audio, _ = librosa.load(io.BytesIO(audio_bytes), sr=self.sample_rate, mono=True)
        return audio[np.newaxis, ...]

    def submit_sentence(self, context: TTSContext, sentence: str, output_definition):
        sentence = self.filter_text(sentence, final=True)
        if not sentence:
            return
        logger.info(f"uvb kokoro sentence: {sentence}")
        output = DataBundle(output_definition)
        output.set_main_data(self.synthesize(sentence))
        context.submit_data(output)

    def handle(self, context: HandlerContext, inputs: ChatData, output_definitions: Dict[ChatDataType, HandlerDataInfo]):
        output_definition = output_definitions.get(ChatDataType.AVATAR_AUDIO).definition
        context = cast(TTSContext, context)
        if inputs.type != ChatDataType.AVATAR_TEXT:
            return

        text = inputs.data.get_main_data()
        if text:
            context.input_text += self.filter_text(text)

        text_end = inputs.data.get_meta("avatar_text_end", False)
        if not text_end:
            parts = re.split(r"(?<=[,.!?])", context.input_text)
            if len(parts) <= 1:
                return
            complete, context.input_text = parts[:-1], parts[-1]
            for sentence in complete:
                self.submit_sentence(context, sentence, output_definition)
            return

        self.submit_sentence(context, context.input_text, output_definition)
        context.input_text = ""
        output = DataBundle(output_definition)
        output.set_main_data(np.zeros(shape=(1, 240), dtype=np.float32))
        context.submit_data(output, finish_stream=True)
        logger.info("uvb kokoro speech end")

    def destroy_context(self, context: HandlerContext):
        logger.info("destroy uvb kokoro context")
