"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAppStore, type ChatAttachment, type ChatMessage } from "@/stores/appStore";
import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  StopIcon,
  PlusIcon,
  ArrowPathIcon,
  PhotoIcon,
  FilmIcon,
  PlayIcon,
  PauseIcon,
  SpeakerXMarkIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ClipboardDocumentIcon,
  BookmarkIcon,
  ArrowUturnRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from "@heroicons/react/24/outline";
import { Bot, Sparkles } from "lucide-react";
import VoiceVisualizer from "@/components/animated/VoiceVisualizer";
import {
  loadModelSettings,
  MODEL_SETTINGS_UPDATED_EVENT,
  type ModelSettings,
} from "@/lib/modelSettings";
import {
  loadVoiceSettings,
  VOICE_SETTINGS_UPDATED_EVENT,
  type VoiceSettings,
} from "@/lib/voiceSettings";

function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

const LIVE_VOICE_MIN_RMS_THRESHOLD = 0.022;
const LIVE_VOICE_MIN_RMS_DELTA = 0.014;
const LIVE_VOICE_NOISE_MULTIPLIER = 2.1;
const LIVE_VOICE_SILENCE_MS = 950;
const LIVE_VOICE_MIN_TURN_MS = 500;
const LIVE_VOICE_STOP_FLUSH_MS = 2400;
const LIVE_VOICE_FINAL_FLUSH_MS = 1500;
const LIVE_VOICE_BUSY_RETRY_MS = 900;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_MODEL_IMAGE_PIXELS = 1_200_000;
const MAX_MODEL_IMAGE_SIDE = 1600;
const MODEL_IMAGE_JPEG_QUALITY = 0.86;
const DEFAULT_IMAGE_PROMPT = "Describe this image in great detail.";

type ChatModelContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "auto" } };

type ChatModelMessage = {
  role: "user" | "assistant";
  content: string | ChatModelContentPart[];
};

type PipecatClientLike = {
  connect: (params?: unknown) => Promise<unknown>;
  disconnect: () => Promise<void>;
  enableMic: (enable: boolean) => void;
  tracks: () => { local?: { audio?: MediaStreamTrack } };
};

type PipecatTranscriptData = {
  text?: string;
  final?: boolean;
  finalized?: boolean;
  is_final?: boolean;
};

type PipecatParticipant = {
  local?: boolean;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio chunk."));
    reader.readAsDataURL(blob);
  });
}

async function imageBitmapFromFile(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to an HTMLImageElement for formats the browser cannot bitmap directly.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image."));
    };
    image.src = url;
  });
}

async function fileToModelImageDataUrl(file: File): Promise<{ dataUrl: string; mediaType: string; size: number }> {
  const image = await imageBitmapFromFile(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const pixelScale = Math.sqrt(MAX_MODEL_IMAGE_PIXELS / Math.max(1, sourceWidth * sourceHeight));
  const sideScale = MAX_MODEL_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight, 1);
  const scale = Math.min(1, pixelScale, sideScale);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare image canvas.");

  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") {
    image.close();
  }

  const dataUrl = canvas.toDataURL("image/jpeg", MODEL_IMAGE_JPEG_QUALITY);
  const base64Length = dataUrl.split(",")[1]?.length ?? 0;
  const size = Math.floor((base64Length * 3) / 4);

  return { dataUrl, mediaType: "image/jpeg", size };
}

function buildModelContent(text: string, attachments: ChatAttachment[] = []): ChatModelMessage["content"] {
  const imageAttachments = attachments.filter(
    (attachment) => attachment.kind === "image" && attachment.dataUrl
  );
  if (!imageAttachments.length) return text;

  return [
    { type: "text", text },
    ...imageAttachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: { url: attachment.dataUrl ?? "", detail: "auto" as const },
    })),
  ];
}

function isPipecatFinalTranscript(data: PipecatTranscriptData): boolean {
  const finalValue = data.final ?? data.finalized ?? data.is_final;
  return finalValue !== false;
}

function appendPipecatTranscript(current: string, next: string): string {
  const cleanNext = next.trim();
  if (!cleanNext) return current.trim();

  const cleanCurrent = current.trim();
  if (!cleanCurrent) return cleanNext;
  if (cleanCurrent.endsWith(cleanNext)) return cleanCurrent;

  return `${cleanCurrent} ${cleanNext}`.trim();
}

function timestampToDate(value: unknown): Date {
  if (typeof value === "number" || typeof value === "string" || value instanceof Date) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  if (value && typeof value === "object") {
    const record = value as { timestamp?: unknown; time?: unknown; value?: unknown };
    return timestampToDate(record.timestamp ?? record.time ?? record.value ?? Date.now());
  }

  return new Date();
}

function safeDisplayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? `${value}` : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value == null) return "";

  try {
    const serialized = JSON.stringify(value);
    return serialized ?? "";
  } catch {
    return "[unreadable message]";
  }
}

function safeMessageRole(value: unknown): "user" | "assistant" | "system" {
  return value === "user" || value === "assistant" || value === "system" ? value : "assistant";
}

function formatMicrophoneError(error: unknown) {
  const message = error instanceof Error ? error.message : "Microphone access failed.";
  const name = error instanceof DOMException ? error.name : "";
  const denied =
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    message.toLowerCase().includes("permission denied");

  if (!denied) return `Mic error: ${message}`;

  return [
    "Mic permission is blocked for this browser tab.",
    "Allow microphone access for localhost:3010 in the browser/site permissions, then refresh UVB and press the mic again.",
    "If no prompt appears, use the browser address-bar permissions icon or app settings to reset microphone access.",
  ].join(" ");
}

function sanitizeTextForSpeech(text: string) {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/#{2,}/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getResponseForInput(input: string): string {
  const lower = input.toLowerCase();
  let bestMatch: { response: string; score: number } | null = null;

  for (const topic of TOPIC_RESPONSES) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { response: topic.response, score };
    }
  }

  if (bestMatch) return bestMatch.response;
  return FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
}

const TOPIC_RESPONSES: Array<{ keywords: string[]; response: string }> = [
  {
    keywords: ["voice", "audio", "sound", "speak", "microphone", "stt", "tts", "whisper", "vocal"],
    response: "Voice analysis in the UVB system works across several layers. The STT pipeline uses Whisper (or faster-whisper) for real-time speech-to-text with barge-in support, so you can interrupt KnightBot mid-response. On the analysis side, we extract fundamental frequency (typically 85-255 Hz for speech), spectral centroid, RMS energy, zero-crossing rate, spectral rolloff, and 13-band MFCC coefficients. The voice quality module measures jitter, shimmer, and harmonic-to-noise ratio. For audio restoration, we apply noise reduction and remastering similar to Adobe Podcast's enhance feature. All of this runs locally on your machine — no cloud processing required.",
  },
  {
    keywords: ["image", "photo", "picture", "vision", "see", "look", "caption", "visual", "ocr"],
    response: "The vision analytics module supports detailed image captioning, object detection, scene classification, OCR text extraction, and dominant color analysis. You can upload images through the Media Studio section or attach them directly in chat. The system uses a local vision model to generate rich descriptions — for example, it can identify UI elements in a screenshot and describe layout, color scheme, and text content. OCR extracts all visible text with bounding box coordinates. Scene classification provides confidence scores for categories like 'technology workspace', 'outdoor landscape', etc.",
  },
  {
    keywords: ["video", "movie", "clip", "scene", "frame", "film"],
    response: "Video understanding breaks content into scenes with timestamp ranges, identifies key frames, tracks motion and camera movement, analyzes the audio track separately, and provides transcription of any speech or on-screen text. The Media Studio page handles both image and video analysis. For longer videos, the system performs temporal segmentation to identify scene changes, then generates per-scene descriptions. It can also detect actions, track objects across frames, and summarize the overall narrative arc of the video.",
  },
  {
    keywords: ["podcast", "episode", "host", "guest", "record", "clone", "voice clone", "seat"],
    response: "The Podcast Studio supports up to 6 individually configurable seats. Each seat can use a pre-existing voice profile or a custom zero-shot voice clone — you only need 3-5 seconds of audio sample, and the clone maintains all the finer tonal elements to sound indistinguishable from the original. The mix controls include master volume, output format (WAV 48kHz/24-bit, FLAC, MP3 320kbps, OGG), and noise gate threshold. This is the VibeVoice Large-style creation suite — designed for multi-speaker podcast production entirely on your local machine.",
  },
  {
    keywords: ["memory", "remember", "recall", "rag", "retrieval", "context", "knowledge", "store"],
    response: "KnightBot's memory bank uses Retrieval-Augmented Generation (RAG) for intelligent context retrieval. All entries are automatically indexed and vectorized into 1536-dimensional embeddings for semantic search. When you ask a question, the system retrieves the most relevant memories using cosine similarity matching against the current conversation embedding — typically in under 5ms with 98.2% recall. Memory entries are categorized as conversations, knowledge, context, or preferences. Everything stays local on your machine with optional AES-256 encryption for stored threads.",
  },
  {
    keywords: ["code", "program", "develop", "bug", "fix", "debug", "typescript", "javascript", "python"],
    response: "As a coding assistant, I can help with code review, debugging, refactoring, and architecture decisions. I support TypeScript, Python, JavaScript, and most major languages. I can analyze codebases for optimization opportunities, identify bugs, suggest fixes, and explain complex patterns. The UVB system itself is built with Next.js 16, React 19, TypeScript, Zustand for state management, Framer Motion for animations, and Tailwind CSS v4. I can walk through any part of the codebase or help you build new features.",
  },
  {
    keywords: ["reason", "think", "chain", "cot", "analysis", "analyze", "problem", "solve"],
    response: "Long-form reasoning and Chain-of-Thought (CoT) are core capabilities. When enabled in Settings > AI, I'll show my step-by-step thinking process — breaking complex problems into intermediate reasoning steps before arriving at a conclusion. This is especially useful for multi-step analysis, debugging workflows, architectural decisions, and research tasks. CoT makes my reasoning transparent so you can follow my logic and correct course if needed. Combined with RAG retrieval, I can pull in relevant context from previous conversations to inform each reasoning step.",
  },
  {
    keywords: ["browser", "web", "search", "navigate", "url", "website", "internet"],
    response: "The collaborative browser use feature allows KnightBot to assist with web tasks — searching, summarizing pages, filling forms, and navigating interfaces. I can analyze web content, extract structured data, compare information across sources, and help automate repetitive browsing tasks. This runs as a controlled browser session that you can observe and override at any point. The system respects your browsing context and can work alongside you rather than replacing your interaction.",
  },
  {
    keywords: ["setting", "config", "preference", "option", "customize", "theme", "dark", "appearance"],
    response: "Settings are organized into 6 tabs: Profile (name, email, password), Voice & Audio (TTS engine, voice profile, speech rate, STT engine, barge-in toggle), Appearance (theme selection, accent color, particle effects), AI Settings (model backend, context window, temperature, CoT, RAG), Security (local-only data, encryption, auto-save, telemetry), and Notifications (task complete, voice ready, system alerts, sound effects). The LLM backend supports LM Studio (local GGUF), Ollama, or OpenAI API. Context windows range from 8K to 65K tokens. Temperature controls creativity vs focus.",
  },
  {
    keywords: ["llm", "model", "ai", "knightbot", "gpt", "llama", "gguf", "lm studio", "ollama"],
    response: "KnightBot is designed to run with local LLMs through LM Studio (GGUF format), Ollama, or connect to cloud APIs. The recommended setup is an uncensored, distilled community model running on a high-end consumer PC (i9 14900KF, 64GB RAM, RTX 5090 32GB VRAM). The AI settings let you configure context window size (8K-65K tokens), temperature (0-2), and enable features like Chain-of-Thought reasoning and RAG memory retrieval. The system is modular — you can swap models, adjust parameters, and expand capabilities without changing the UVB interface.",
  },
];

const FALLBACK_RESPONSES = [
  "I've analyzed the question and here's what I found. KnightBot processes inputs through the UVB pipeline — first determining the modality (text, voice, image, video), then routing to the appropriate handler. The response is generated by the local LLM and delivered through the chat interface. Is there a specific aspect you'd like me to dive deeper into?",
  "That's a great question. The UVB system is designed as a modular, extensible platform. Each capability — chat, voice analysis, media understanding, podcast creation, memory management — is a self-contained module that can be expanded independently. What would you like to explore further?",
  "I'm here to help with that. KnightBot can assist with a wide range of tasks including code analysis, voice processing, image understanding, knowledge management, and more. Could you provide more details about what you're looking for so I can give you a more targeted response?",
];

interface ChatConfig {
  llmConfigured: boolean;
  connected: boolean;
  baseUrl: string;
  model: string;
  error?: string;
}

async function fetchChatConfig(settings: ModelSettings): Promise<ChatConfig | null> {
  try {
    const params = new URLSearchParams({
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.apiKey,
    });
    const response = await fetch(`/api/chat/config?${params.toString()}`);
    if (!response.ok) return null;
    return (await response.json()) as ChatConfig;
  } catch {
    return null;
  }
}

async function sendChatToModel(
  messages: ChatModelMessage[],
  settings: ModelSettings,
  systemPrompt: string,
  signal?: AbortSignal
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, settings, systemPrompt }),
    signal,
  });
  const data = (await response.json()) as { content?: string; error?: string };

  if (!response.ok || !data.content) {
    throw new Error(data.error ?? "The local model did not return a response.");
  }

  return data.content;
}

export default function ChatInterface() {
  const {
    threads,
    activeThreadId,
    addThread,
    addMessage,
    updateMessage,
    updateThread,
    deleteThread,
    setActiveThread,
    isRecording,
    setIsRecording,
  } =
    useAppStore();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadModelSettings());
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);
  const [activityStatus, setActivityStatus] = useState("Ready for text, voice, and media.");
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [hasSpeechReady, setHasSpeechReady] = useState(false);
  const [speechProgress, setSpeechProgress] = useState(0);
  const [speechDuration, setSpeechDuration] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceLevels, setVoiceLevels] = useState<number[]>(Array(32).fill(0.05));
  const [liveVoiceEnabled, setLiveVoiceEnabled] = useState(false);
  const [liveVoiceConnected, setLiveVoiceConnected] = useState(false);
  const [liveVoiceRecording, setLiveVoiceRecording] = useState(false);
  const [liveMicMuted, setLiveMicMuted] = useState(false);
  const [liveVoicePhase, setLiveVoicePhase] = useState<
    "idle" | "listening" | "processing" | "speaking"
  >("idle");
  const [liveVadDebug, setLiveVadDebug] = useState({ level: 0, threshold: 0, floor: 0 });
  const [liveTranscript, setLiveTranscript] = useState("");
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingThreadTitle, setEditingThreadTitle] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [expandedImage, setExpandedImage] = useState<ChatAttachment | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<{
    sttMs?: number;
    llmMs?: number;
    ttsMs?: number;
    totalMs?: number;
    sttProvider?: string;
    ttsProvider?: string;
    vadProvider?: string;
    transport?: string;
  } | null>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const pipecatClientRef = useRef<PipecatClientLike | null>(null);
  const pipecatAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveRecorderRef = useRef<MediaRecorder | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveVoiceEnabledRef = useRef(false);
  const liveTurnStateRef = useRef<"idle" | "listening" | "processing" | "speaking">("idle");
  const liveCaptureArmedRef = useRef(false);
  const liveSpeechStartedRef = useRef(false);
  const liveSpeechStartedAtRef = useRef(0);
  const liveLastVoiceAtRef = useRef(0);
  const liveAutoStopInFlightRef = useRef(false);
  const liveNoiseFloorRef = useRef(0.01);
  const liveLastVadUiAtRef = useRef(0);
  const pipecatFallbackTimerRef = useRef<number | null>(null);
  const pipecatFallbackInFlightRef = useRef(false);
  const pipecatPendingTranscriptRef = useRef("");
  const liveUserSpeakingRef = useRef(false);
  const liveMicMutedRef = useRef(false);
  const liveLastLevelUiAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceFrameRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const recordingActionRef = useRef<"edit" | "send">("edit");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const speechAudioUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  const scrollMessagesToTop = () => {
    const scroller = messagesScrollerRef.current;
    if (!scroller) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    messagesTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    scroller.scrollTo({ top: 0, behavior: "smooth" });
    window.requestAnimationFrame(() => {
      scroller.scrollTop = 0;
      messagesTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  const scrollMessagesToBottom = () => {
    const scroller = messagesScrollerRef.current;
    if (!scroller) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }

    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const revokeSpeechAudioUrl = useCallback((url = speechAudioUrlRef.current) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    if (speechAudioUrlRef.current === url) {
      speechAudioUrlRef.current = null;
    }
  }, []);

  const clearSpeechAudioSource = useCallback(() => {
    const audio = audioPlayerRef.current;
    if (!audio) {
      revokeSpeechAudioUrl();
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    revokeSpeechAudioUrl();
  }, [revokeSpeechAudioUrl]);

  useEffect(() => {
    liveVoiceEnabledRef.current = liveVoiceEnabled;
    document.body.classList.toggle("uvb-live-voice-active", liveVoiceEnabled);

    return () => {
      document.body.classList.remove("uvb-live-voice-active");
    };
  }, [liveVoiceEnabled]);

  useEffect(() => {
    return () => {
      clearSpeechAudioSource();
      if (pipecatAudioRef.current) {
        pipecatAudioRef.current.pause();
        pipecatAudioRef.current.srcObject = null;
      }
    };
  }, [clearSpeechAudioSource]);

  useEffect(() => {
    const refreshConfig = () => {
      const settings = loadModelSettings();
      setModelSettings(settings);
      fetchChatConfig(settings).then(setChatConfig);
    };

    refreshConfig();
    window.addEventListener(MODEL_SETTINGS_UPDATED_EVENT, refreshConfig);
    window.addEventListener("storage", refreshConfig);

    return () => {
      window.removeEventListener(MODEL_SETTINGS_UPDATED_EVENT, refreshConfig);
      window.removeEventListener("storage", refreshConfig);
    };
  }, []);

  useEffect(() => {
    const refreshVoiceSettings = () => {
      setVoiceSettings(loadVoiceSettings());
    };

    window.addEventListener(VOICE_SETTINGS_UPDATED_EVENT, refreshVoiceSettings);
    window.addEventListener("storage", refreshVoiceSettings);

    return () => {
      window.removeEventListener(VOICE_SETTINGS_UPDATED_EVENT, refreshVoiceSettings);
      window.removeEventListener("storage", refreshVoiceSettings);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages]);

  useEffect(() => {
    return () => {
      if (pipecatFallbackTimerRef.current) {
        window.clearTimeout(pipecatFallbackTimerRef.current);
        pipecatFallbackTimerRef.current = null;
      }
      liveSocketRef.current?.close();
      liveRecorderRef.current?.stop();
      liveStreamRef.current?.getTracks().forEach((track) => track.stop());
      void pipecatClientRef.current?.disconnect().catch(() => undefined);
    };
  }, []);

  const createNewThread = () => {
    const thread = {
      id: generateId(),
      title: "New Conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: "",
    };
    addThread(thread);
    setActiveThread(thread.id);
  };

  const beginRenameThread = (thread: { id: string; title: string }) => {
    setEditingThreadId(thread.id);
    setEditingThreadTitle(thread.title);
  };

  const cancelRenameThread = () => {
    setEditingThreadId(null);
    setEditingThreadTitle("");
  };

  const saveRenameThread = (threadId: string) => {
    const title = editingThreadTitle.trim() || "New Conversation";
    updateThread(threadId, { title });
    setEditingThreadId(null);
    setEditingThreadTitle("");
    setActivityStatus("Chat renamed.");
  };

  const removeThread = (threadId: string, title: string) => {
    const confirmed = window.confirm(
      `Delete "${title || "New Conversation"}"? This removes it from UVB on this browser.`
    );
    if (!confirmed) return;

    deleteThread(threadId);
    if (editingThreadId === threadId) cancelRenameThread();
    setActivityStatus("Chat deleted.");
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setActivityStatus("Copied to clipboard.");
    } catch {
      setActivityStatus("Copy failed. Browser clipboard permission may be blocked.");
    }
  };

  const branchFromMessage = (messageId: string) => {
    if (!activeThread) return;

    const messageIndex = activeThread.messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;

    const branchedMessages = activeThread.messages.slice(0, messageIndex + 1).map((message) => ({
      ...message,
      id: generateId(),
    }));
    const thread = {
      id: generateId(),
      title: `${activeThread.title || "Conversation"} branch`,
      messages: branchedMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: `Branched from ${activeThread.id}`,
    };

    addThread(thread);
    setActiveThread(thread.id);
    setActivityStatus("Created a new branch from that message.");
  };

  const regenerateFromMessage = async (messageId: string) => {
    if (!activeThread || isTyping) return;

    const messageIndex = activeThread.messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;

    const previousUserMessage = [...activeThread.messages.slice(0, messageIndex)]
      .reverse()
      .find((message) => message.role === "user");

    if (!previousUserMessage) {
      setActivityStatus("No user prompt found to regenerate from.");
      return;
    }

    await sendMessageWithText(
      previousUserMessage.content,
      previousUserMessage.type,
      previousUserMessage.attachments ?? []
    );
  };

  const toggleBookmark = (message: ChatMessage) => {
    if (!activeThreadId) return;
    updateMessage(activeThreadId, message.id, { bookmarked: !message.bookmarked });
    setActivityStatus(message.bookmarked ? "Removed bookmark." : "Bookmarked message.");
  };

  const stopChatGeneration = () => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    setIsTyping(false);
    setActivityStatus("Stopped model response.");
  };

  const pauseSpeech = () => {
    audioPlayerRef.current?.pause();
    setIsSpeechPaused(true);
    setActivityStatus("Speech paused.");
  };

  const resumeSpeech = async () => {
    if (!audioPlayerRef.current) return;
    await audioPlayerRef.current.play();
    setIsSpeaking(true);
    setIsSpeechPaused(false);
    setActivityStatus("Speech resumed.");
  };

  const stopSpeech = () => {
    if (!audioPlayerRef.current) return;
    clearSpeechAudioSource();
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    setSpeechProgress(0);
    setSpeechDuration(0);
    setHasSpeechReady(false);
    if (liveVoiceEnabledRef.current && liveTurnStateRef.current === "speaking") {
      liveTurnStateRef.current = "idle";
      setLiveVoicePhase("idle");
    }
    setActivityStatus("Speech stopped.");
  };

  const replaySpeech = async () => {
    if (!audioPlayerRef.current?.src) return;
    audioPlayerRef.current.currentTime = 0;
    await audioPlayerRef.current.play();
    setActivityStatus("Replaying spoken reply.");
  };

  const seekSpeech = (value: number) => {
    if (!audioPlayerRef.current) return;
    audioPlayerRef.current.currentTime = value;
    setSpeechProgress(value);
  };

  const finishLiveVoiceTurn = async (reason: "manual" | "silence" = "manual") => {
    if (
      liveAutoStopInFlightRef.current ||
      liveMicMutedRef.current ||
      !liveSpeechStartedRef.current ||
      liveSocketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    liveAutoStopInFlightRef.current = true;
    liveSpeechStartedRef.current = false;
    liveTurnStateRef.current = "processing";
    setLiveVoicePhase("processing");
    setLiveVoiceRecording(false);
    setActivityStatus(
      reason === "silence"
        ? "Detected a lull. Sending that turn to Sophia..."
        : "Processing live voice turn..."
    );

    liveRecorderRef.current?.requestData();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    liveCaptureArmedRef.current = false;

    if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
      liveSocketRef.current.send(JSON.stringify({ type: "stop", reason }));
    }

    liveAutoStopInFlightRef.current = false;
  };

  const handleLiveVoiceEnergy = (energy: number, threshold: number) => {
    if (
      !liveVoiceEnabledRef.current ||
      liveMicMutedRef.current ||
      liveSocketRef.current?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    const now = performance.now();
    const userIsSpeaking = energy >= threshold;

    if (userIsSpeaking && liveTurnStateRef.current === "speaking") {
      audioPlayerRef.current?.pause();
      if (audioPlayerRef.current) audioPlayerRef.current.currentTime = 0;
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setSpeechProgress(0);
      liveTurnStateRef.current = "listening";
      setLiveVoicePhase("listening");
      setActivityStatus("Barge-in detected. Listening to you...");
    }

    if (userIsSpeaking) {
      if (!liveSpeechStartedRef.current) {
        liveCaptureArmedRef.current = true;
        liveSpeechStartedRef.current = true;
        liveSpeechStartedAtRef.current = now;
        liveTurnStateRef.current = "listening";
        setLiveVoicePhase("listening");
        setLiveVoiceRecording(true);
        setActivityStatus("Voice detected. Pause briefly and I’ll send the turn.");
      }
      liveLastVoiceAtRef.current = now;
      return;
    }

    if (!liveSpeechStartedRef.current) return;

    const quietFor = now - liveLastVoiceAtRef.current;
    const turnLength = now - liveSpeechStartedAtRef.current;
    if (quietFor >= LIVE_VOICE_SILENCE_MS && turnLength >= LIVE_VOICE_MIN_TURN_MS) {
      void finishLiveVoiceTurn("silence");
    }
  };

  const speakText = async (text: string, options: { force?: boolean } = {}) => {
    const speechText = sanitizeTextForSpeech(text);
    if ((!options.force && !voiceSettings.autoSpeak) || !speechText) return;

    setActivityStatus("Speaking with Kokoro...");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: speechText,
        endpoint: voiceSettings.ttsUrl,
        voice: voiceSettings.ttsVoice,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "TTS playback failed.");
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }

    audioPlayerRef.current.pause();
    revokeSpeechAudioUrl();
    speechAudioUrlRef.current = audioUrl;
    audioPlayerRef.current.src = audioUrl;
    audioPlayerRef.current.volume = voiceSettings.volume;
    audioPlayerRef.current.onplay = () => {
      liveTurnStateRef.current = liveVoiceEnabledRef.current ? "speaking" : liveTurnStateRef.current;
      if (liveVoiceEnabledRef.current) setLiveVoicePhase("speaking");
      setIsSpeaking(true);
      setIsSpeechPaused(false);
      setHasSpeechReady(true);
    };
    audioPlayerRef.current.onpause = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(audioPlayerRef.current?.currentTime ? true : false);
    };
    audioPlayerRef.current.ontimeupdate = () => {
      setSpeechProgress(audioPlayerRef.current?.currentTime ?? 0);
    };
    audioPlayerRef.current.onloadedmetadata = () => {
      setSpeechDuration(audioPlayerRef.current?.duration || 0);
    };
    audioPlayerRef.current.onended = () => {
      revokeSpeechAudioUrl(audioUrl);
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setSpeechProgress(0);
      setActivityStatus("Ready.");
    };
    await audioPlayerRef.current.play();
  };

  const replayMessageSpeech = async (text: string) => {
    await speakText(text, { force: true }).catch((error) => {
      const message = error instanceof Error ? error.message : "TTS failed.";
      setActivityStatus(message);
    });
  };

  const sendMessageWithText = async (
    userInput: string,
    messageType: ChatMessage["type"] = "text",
    attachments = pendingAttachments
  ) => {
    const attachedImages = attachments.filter((attachment) => attachment.kind === "image");
    const promptText = userInput.trim() || (attachedImages.length ? DEFAULT_IMAGE_PROMPT : "");
    if (!promptText && !attachments.length) return;

    let threadId = activeThreadId;
    if (!threadId) {
      const thread = {
        id: generateId(),
        title:
          promptText.slice(0, 40) ||
          attachedImages[0]?.name.slice(0, 40) ||
          "Image conversation",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        context: "",
      };
      addThread(thread);
      setActiveThread(thread.id);
      threadId = thread.id;
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: "user",
      content: promptText,
      timestamp: Date.now(),
      type: attachedImages.length ? "image" : messageType,
      attachments: attachments.length ? attachments : undefined,
    };
    addMessage(threadId!, userMsg);
    setInput("");
    setPendingAttachments([]);
    setIsTyping(true);
    setLastFailedInput(null);
    setActivityStatus("Thinking through the local model...");
    chatAbortRef.current?.abort();
    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    const currentThread = useAppStore.getState().threads.find((thread) => thread.id === threadId);
    const priorMessages: ChatModelMessage[] =
      currentThread?.messages
        .filter((message) => message.id !== userMsg.id)
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })) ?? [];

    try {
      const response = await sendChatToModel([
        ...priorMessages,
        { role: "user", content: buildModelContent(promptText, attachments) },
      ], modelSettings, voiceSettings.systemPrompt, abortController.signal);
      const aiMsg: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
        type: "text",
      };
      addMessage(threadId!, aiMsg);
      await speakText(response).catch((error) => {
        const message = error instanceof Error ? error.message : "TTS failed.";
        setActivityStatus(message);
      });
      setActivityStatus("Ready.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setActivityStatus("Stopped model response.");
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown local model error.";
      if (attachedImages.length && message.toLowerCase().includes("at most zero images")) {
        addMessage(threadId!, {
          id: generateId(),
          role: "assistant",
          content:
            "The image uploaded and is saved in the chat, but the active local model is text-only right now. It rejected the request because this model is configured to allow zero images per prompt. Switch UVB to a vision-capable local model or vision endpoint, then send the image again and I can describe it.",
          timestamp: Date.now(),
          type: "text",
        });
        setActivityStatus("Image attached, but the active model does not support vision.");
        return;
      }
      addMessage(threadId!, {
        id: generateId(),
        role: "assistant",
        content: `The local model bridge failed cleanly instead of pretending with demo text.\n\n${message}\n\nCheck Settings > AI Settings or the health badge in the top-right.`,
        timestamp: Date.now(),
        type: "text",
      });
      setLastFailedInput(promptText);
      setActivityStatus("Model failed. Settings or service health need attention.");
    } finally {
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null;
      }
      setIsTyping(false);
    }
  };

  const clearPipecatFallbackTimer = () => {
    if (!pipecatFallbackTimerRef.current) return;
    window.clearTimeout(pipecatFallbackTimerRef.current);
    pipecatFallbackTimerRef.current = null;
  };

  const generateLiveVoiceResponse = async (threadId: string, transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript || pipecatFallbackInFlightRef.current) return;

    pipecatFallbackInFlightRef.current = true;
    setIsTyping(true);
    liveTurnStateRef.current = "processing";
    setLiveVoicePhase("processing");
    setActivityStatus("Heard you. Asking the fast UVB chat bridge...");

    try {
      const currentThread = useAppStore.getState().threads.find((thread) => thread.id === threadId);
      const priorMessages: Array<{ role: "user" | "assistant"; content: string }> =
        currentThread?.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .slice(-16)
          .map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })) ?? [];

      if (
        !priorMessages.some(
          (message) => message.role === "user" && message.content.trim() === cleanTranscript
        )
      ) {
        priorMessages.push({ role: "user", content: cleanTranscript });
      }

      const currentModelSettings = loadModelSettings();
      const currentVoiceSettings = loadVoiceSettings();
      const liveModelSettings = {
        ...currentModelSettings,
        maxTokens: Math.min(currentModelSettings.maxTokens, 160),
        temperature: Math.min(currentModelSettings.temperature, 0.45),
      };
      const liveSystemPrompt = [
        currentVoiceSettings.systemPrompt,
        "Live voice response mode: answer in one or two short spoken sentences. No markdown, no lists, no headings unless the user explicitly asks.",
      ]
        .filter(Boolean)
        .join("\n\n");
      const response = await sendChatToModel(
        priorMessages,
        liveModelSettings,
        liveSystemPrompt
      );

      addMessage(threadId, {
        id: generateId(),
        role: "assistant",
        content: response,
        timestamp: Date.now(),
        type: "voice",
      });

      if (!pipecatPendingTranscriptRef.current.trim()) {
        setLiveTranscript("");
      }

      await speakText(response).catch((error) => {
        const message = error instanceof Error ? error.message : "TTS failed.";
        setActivityStatus(message);
      });

      if (!voiceSettings.autoSpeak) {
        liveTurnStateRef.current = "idle";
        setLiveVoicePhase("idle");
        setActivityStatus("Live voice response complete.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live voice fallback failed.";
      addMessage(threadId, {
        id: generateId(),
        role: "assistant",
        content: `I heard you, but the local model bridge failed while answering.\n\n${message}`,
        timestamp: Date.now(),
        type: "text",
      });
      liveTurnStateRef.current = "idle";
      setLiveVoicePhase("idle");
      setActivityStatus(`Live voice response failed: ${message}`);
    } finally {
      pipecatFallbackInFlightRef.current = false;
      setIsTyping(false);
      if (
        pipecatPendingTranscriptRef.current.trim() &&
        liveVoiceEnabledRef.current &&
        !liveUserSpeakingRef.current &&
        !liveMicMutedRef.current
      ) {
        scheduleLiveVoiceTurnFlush(LIVE_VOICE_BUSY_RETRY_MS);
      }
    }
  };

  const flushLiveVoiceTurn = () => {
    const transcript = pipecatPendingTranscriptRef.current.trim();
    if (!transcript) return;

    const threadId = ensureThreadForLiveVoice(transcript);
    addMessage(threadId, {
      id: generateId(),
      role: "user",
      content: transcript,
      timestamp: Date.now(),
      type: "voice",
    });
    pipecatPendingTranscriptRef.current = "";
    setLiveTranscript(transcript);
    void generateLiveVoiceResponse(threadId, transcript);
  };

  const scheduleLiveVoiceTurnFlush = (delayMs = 1200) => {
    clearPipecatFallbackTimer();
    pipecatFallbackTimerRef.current = window.setTimeout(() => {
      pipecatFallbackTimerRef.current = null;
      if (
        !liveVoiceEnabledRef.current ||
        liveUserSpeakingRef.current ||
        liveMicMutedRef.current
      ) {
        return;
      }

      if (pipecatFallbackInFlightRef.current) {
        scheduleLiveVoiceTurnFlush(LIVE_VOICE_BUSY_RETRY_MS);
        return;
      }

      flushLiveVoiceTurn();
    }, delayMs);
  };

  const sendMessage = async () => {
    await sendMessageWithText(input, "text");
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "uvb-recording.webm");
    formData.append("endpoint", voiceSettings.sttUrl);
    formData.append("model", voiceSettings.sttModel);
    formData.append("language", voiceSettings.sttLanguage);
    formData.append("prompt", voiceSettings.sttPrompt);

    const response = await fetch("/api/stt", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { text?: string; error?: string };

    if (!response.ok || !data.text) {
      throw new Error(data.error ?? "STT returned no transcript.");
    }

    return data.text;
  };

  const stopVoiceLevelMonitor = async () => {
    if (voiceFrameRef.current) {
      cancelAnimationFrame(voiceFrameRef.current);
      voiceFrameRef.current = null;
    }
    analyserRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }

    setVoiceLevels(Array(32).fill(0.05));
  };

  const startVoiceLevelMonitor = (stream: MediaStream) => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const frequencyBuffer = new Uint8Array(analyser.frequencyBinCount);
    const timeBuffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteFrequencyData(frequencyBuffer);
      analyser.getByteTimeDomainData(timeBuffer);

      let sumSquares = 0;
      for (const value of timeBuffer) {
        const normalized = (value - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / Math.max(1, timeBuffer.length));
      const currentFloor = liveNoiseFloorRef.current;
      const threshold = Math.max(
        LIVE_VOICE_MIN_RMS_THRESHOLD,
        currentFloor + LIVE_VOICE_MIN_RMS_DELTA,
        currentFloor * LIVE_VOICE_NOISE_MULTIPLIER
      );
      const looksLikeSpeech = rms >= threshold;

      if (!looksLikeSpeech && !liveSpeechStartedRef.current && liveTurnStateRef.current === "idle") {
        liveNoiseFloorRef.current = currentFloor * 0.96 + rms * 0.04;
      }

      const now = performance.now();
      if (liveVoiceEnabledRef.current && now - liveLastVadUiAtRef.current > 250) {
        liveLastVadUiAtRef.current = now;
        setLiveVadDebug({
          level: rms,
          threshold,
          floor: liveNoiseFloorRef.current,
        });
      }

      const bucketSize = Math.max(1, Math.floor(frequencyBuffer.length / 32));
      const nextLevels = Array.from({ length: 32 }, (_, index) => {
        const start = index * bucketSize;
        const slice = frequencyBuffer.slice(start, start + bucketSize);
        const average = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
        return Math.max(0.04, Math.min(1, average / 180));
      });
      setVoiceLevels(nextLevels);
      handleLiveVoiceEnergy(rms, threshold);
      voiceFrameRef.current = requestAnimationFrame(tick);
    };

    tick();
  };

  const stopRecording = (action: "edit" | "send" = "edit") => {
    recordingActionRef.current = action;
    mediaRecorderRef.current?.stop();
  };

  const cancelRecording = async () => {
    discardRecordingRef.current = true;
    audioChunksRef.current = [];
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
    setIsTranscribing(false);
    await stopVoiceLevelMonitor();
    setActivityStatus("Recording cancelled.");
  };

  const startRecording = async () => {
    setInputMode("voice");
    setActivityStatus("Requesting microphone...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      startVoiceLevelMonitor(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        await stopVoiceLevelMonitor();

        if (discardRecordingRef.current || !audioChunksRef.current.length) {
          discardRecordingRef.current = false;
          audioChunksRef.current = [];
          setActivityStatus("Recording cancelled.");
          return;
        }

        setIsTranscribing(true);
        setActivityStatus("Transcribing with local Whisper...");

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const transcript = await transcribeAudio(audioBlob);
          if (recordingActionRef.current === "send") {
            setInput("");
            setInputMode("text");
            setActivityStatus("Transcript ready. Sending to KnightBot...");
            await sendMessageWithText(transcript, "voice");
          } else {
            setInput(transcript);
            setInputMode("text");
            setActivityStatus("Transcript ready. Review or edit it, then press send.");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Voice transcription failed.";
          setActivityStatus(`STT error: ${message}`);
        } finally {
          audioChunksRef.current = [];
          setIsTranscribing(false);
        }
      };

      discardRecordingRef.current = false;
      recordingActionRef.current = "edit";
      recorder.start();
      setIsRecording(true);
      setActivityStatus("Recording voice...");
    } catch (error) {
      setIsRecording(false);
      setActivityStatus(formatMicrophoneError(error));
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    await startRecording();
  };

  const ensureThreadForLiveVoice = (titleSeed = "Live Voice") => {
    const current = useAppStore.getState();
    if (current.activeThreadId) return current.activeThreadId;

    const thread = {
      id: generateId(),
      title: titleSeed.slice(0, 40) + (titleSeed.length > 40 ? "..." : ""),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      context: "Live voice session",
    };
    addThread(thread);
    setActiveThread(thread.id);
    return thread.id;
  };

  const playLiveAudio = async (audioBase64: string, contentType = "audio/wav") => {
    const binary = window.atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    const audioUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }

    audioPlayerRef.current.pause();
    revokeSpeechAudioUrl();
    speechAudioUrlRef.current = audioUrl;
    audioPlayerRef.current.src = audioUrl;
    audioPlayerRef.current.volume = voiceSettings.volume;
    audioPlayerRef.current.onplay = () => {
      setIsSpeaking(true);
      setIsSpeechPaused(false);
      setHasSpeechReady(true);
    };
    audioPlayerRef.current.onpause = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(audioPlayerRef.current?.currentTime ? true : false);
    };
    audioPlayerRef.current.ontimeupdate = () => {
      setSpeechProgress(audioPlayerRef.current?.currentTime ?? 0);
    };
    audioPlayerRef.current.onloadedmetadata = () => {
      setSpeechDuration(audioPlayerRef.current?.duration || 0);
    };
    audioPlayerRef.current.onended = () => {
      revokeSpeechAudioUrl(audioUrl);
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setSpeechProgress(0);
      if (liveTurnStateRef.current === "speaking") {
        liveTurnStateRef.current = "idle";
      }
      if (liveVoiceEnabledRef.current) setLiveVoicePhase("idle");
      setActivityStatus(
        liveVoiceEnabledRef.current
          ? "Live voice ready. Start talking when you want the next turn."
          : "Live voice ready."
      );
    };
    await audioPlayerRef.current.play();
  };

  const handleLiveVoiceEvent = async (event: MessageEvent<string>) => {
    const data = JSON.parse(event.data) as {
      type?: string;
      message?: string;
      text?: string;
      audioBase64?: string;
      contentType?: string;
      sttMs?: number;
      llmMs?: number;
      ttsMs?: number;
      totalMs?: number;
      sttProvider?: string;
      ttsProvider?: string;
      vadProvider?: string;
      transport?: string;
      pipelineMode?: string;
      pipecatInstalled?: boolean;
    };

    if (data.type === "ready") {
      setLiveVoiceConnected(true);
      setActivityStatus(
        data.pipelineMode
          ? `${data.message ?? "Live voice connected."} ${data.pipelineMode}${
              data.pipecatInstalled ? " with Pipecat installed." : " with baseline providers."
            }`
          : data.message ?? "Live voice connected."
      );
      return;
    }

    if (data.type === "status") {
      setActivityStatus(data.message ?? "Live voice working...");
      return;
    }

    if (data.type === "transcript" && data.text) {
      const threadId = ensureThreadForLiveVoice(data.text);
      setLiveTranscript(data.text);
      addMessage(threadId, {
        id: generateId(),
        role: "user",
        content: data.text,
        timestamp: Date.now(),
        type: "voice",
      });
      return;
    }

    if (data.type === "assistant" && data.text) {
      const threadId = ensureThreadForLiveVoice();
      addMessage(threadId, {
        id: generateId(),
        role: "assistant",
        content: data.text,
        timestamp: Date.now(),
        type: "text",
      });
      return;
    }

    if (data.type === "audio" && data.audioBase64) {
      await playLiveAudio(data.audioBase64, data.contentType);
      return;
    }

    if (data.type === "metrics") {
      setLiveMetrics({
        sttMs: data.sttMs,
        llmMs: data.llmMs,
        ttsMs: data.ttsMs,
        totalMs: data.totalMs,
        sttProvider: data.sttProvider,
        ttsProvider: data.ttsProvider,
        vadProvider: data.vadProvider,
        transport: data.transport,
      });
      setActivityStatus(
        `Live turn complete: STT ${data.sttMs ?? "-"}ms | LLM ${
          data.llmMs ?? "-"
        }ms | TTS ${data.ttsMs ?? "-"}ms via ${
          data.ttsProvider ?? voiceSettings.liveTtsProvider
        }`
      );
      if (liveTurnStateRef.current !== "speaking") {
        liveTurnStateRef.current = "idle";
        setLiveVoicePhase("idle");
      }
      return;
    }

    if (data.type === "error") {
      setActivityStatus(`Live voice error: ${data.message ?? "Unknown sidecar error."}`);
    }
  };

  const connectLiveVoice = async (stream: MediaStream) => {
    const socket = new WebSocket(voiceSettings.liveVoiceUrl);
    liveSocketRef.current = socket;

    socket.onopen = () => {
      const history =
        useAppStore
          .getState()
          .threads.find((thread) => thread.id === activeThreadId)
          ?.messages.filter((message) => message.role === "user" || message.role === "assistant")
          .slice(-16)
          .map((message) => ({
            role: message.role,
            content: message.content,
          })) ?? [];

      socket.send(
        JSON.stringify({
          type: "start",
          modelSettings,
          voiceSettings,
          history,
        })
      );
      setLiveVoiceConnected(true);
      liveTurnStateRef.current = "idle";
      setLiveVoicePhase("idle");
      liveCaptureArmedRef.current = false;
      liveSpeechStartedRef.current = false;
      setActivityStatus("Live voice connected. Start talking and I’ll auto-send after a lull.");
    };

    socket.onmessage = (event) => {
      void handleLiveVoiceEvent(event);
    };
    socket.onerror = () => {
      setActivityStatus("Live voice sidecar connection failed. Check the voice-agent window.");
    };
    socket.onclose = () => {
      setLiveVoiceConnected(false);
      setLiveVoiceRecording(false);
      if (liveVoiceEnabled) {
        setActivityStatus("Live voice disconnected.");
      }
    };

    const recorder = new MediaRecorder(stream);
    liveRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (
        !event.data.size ||
        socket.readyState !== WebSocket.OPEN ||
        !liveCaptureArmedRef.current
      ) {
        return;
      }
      void blobToBase64(event.data).then((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "audio", data }));
        }
      });
    };
    recorder.start(200);
  };

  const connectPipecatLiveVoice = async () => {
    const [{ PipecatClient }, { SmallWebRTCTransport, WavMediaManager }] = await Promise.all([
      import("@pipecat-ai/client-js"),
      import("@pipecat-ai/small-webrtc-transport"),
    ]);
    const currentModelSettings = loadModelSettings();
    const currentVoiceSettings = loadVoiceSettings();

    let activeThreadForSession = activeThreadId;
    let assistantMessageId: string | null = null;
    let assistantText = "";

    const ensureThread = (seed = "Live Voice") => {
      if (activeThreadForSession) return activeThreadForSession;
      activeThreadForSession = ensureThreadForLiveVoice(seed);
      return activeThreadForSession;
    };

    const upsertAssistantText = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      clearPipecatFallbackTimer();
      pipecatPendingTranscriptRef.current = "";
      const threadId = ensureThread();
      if (!assistantMessageId) {
        assistantMessageId = generateId();
        addMessage(threadId, {
          id: assistantMessageId,
          role: "assistant",
          content: trimmed,
          timestamp: Date.now(),
          type: "voice",
        });
        return;
      }
      updateMessage(threadId, assistantMessageId, {
        content: trimmed,
        timestamp: Date.now(),
      });
    };

    const transport = new SmallWebRTCTransport({
      mediaManager: new WavMediaManager(200, 16000),
    });
    (
      transport as typeof transport & {
        pc?: RTCPeerConnection | null;
        addInitialTransceivers: () => void;
      }
    ).addInitialTransceivers = function addInitialTransceivers() {
      this.pc?.addTransceiver("audio", { direction: "sendrecv" });
      this.pc?.addTransceiver("video", { direction: "inactive" });
    };

    const client = new PipecatClient({
      transport,
      enableMic: true,
      enableCam: false,
      callbacks: {
        onConnected: () => {
          setLiveVoiceConnected(true);
          setActivityStatus("Pipecat WebRTC connected. Waiting for bot ready...");
        },
        onDisconnected: () => {
          setLiveVoiceConnected(false);
          setLiveVoiceRecording(false);
          setLiveVoicePhase("idle");
          if (liveVoiceEnabledRef.current) {
            setActivityStatus("Pipecat WebRTC disconnected.");
          }
        },
        onBotReady: () => {
          liveTurnStateRef.current = "idle";
          setLiveVoicePhase("idle");
          setActivityStatus("Pipecat live voice is ready. Start talking; turns auto-send after a lull.");
        },
        onTransportStateChanged: (state) => {
          setActivityStatus(`Pipecat transport: ${state}`);
        },
        onDeviceError: (error) => {
          setActivityStatus(formatMicrophoneError(error));
        },
        onUserStartedSpeaking: () => {
          if (liveMicMutedRef.current) return;
          liveUserSpeakingRef.current = true;
          clearPipecatFallbackTimer();
          stopSpeech();
          liveTurnStateRef.current = "listening";
          setLiveVoicePhase("listening");
          setLiveVoiceRecording(true);
          setActivityStatus("Listening...");
        },
        onUserStoppedSpeaking: () => {
          liveUserSpeakingRef.current = false;
          liveTurnStateRef.current = "processing";
          setLiveVoicePhase("processing");
          setLiveVoiceRecording(false);
          setActivityStatus(
            pipecatPendingTranscriptRef.current
              ? "Heard you. Holding for a brief pause before answering..."
              : "Heard you. Waiting for transcript..."
          );
          scheduleLiveVoiceTurnFlush(LIVE_VOICE_STOP_FLUSH_MS);
        },
        onUserTranscript: (data: PipecatTranscriptData) => {
          const transcript = data.text?.trim();
          if (!transcript) return;

          setLiveTranscript(transcript);
          if (!isPipecatFinalTranscript(data)) return;

          pipecatPendingTranscriptRef.current = appendPipecatTranscript(
            pipecatPendingTranscriptRef.current,
            transcript
          );
          setActivityStatus("Transcript captured. Pause briefly and UVB will answer.");
          if (!liveUserSpeakingRef.current) {
            scheduleLiveVoiceTurnFlush(LIVE_VOICE_FINAL_FLUSH_MS);
          }
        },
        onBotStartedSpeaking: () => {
          clearPipecatFallbackTimer();
          liveTurnStateRef.current = "speaking";
          setLiveVoicePhase("speaking");
          setActivityStatus("Sophia is speaking. Start talking to barge in.");
        },
        onBotStoppedSpeaking: () => {
          assistantMessageId = null;
          assistantText = "";
          liveTurnStateRef.current = "idle";
          setLiveVoicePhase("idle");
          setActivityStatus("Pipecat live voice ready for the next turn.");
          if (!pipecatPendingTranscriptRef.current.trim()) {
            setLiveTranscript("");
          }
        },
        onBotLlmText: (data) => {
          if (!data.text) return;
          assistantText += data.text;
          upsertAssistantText(assistantText);
        },
        onBotOutput: (data) => {
          if (!data.text) return;
          upsertAssistantText(data.text);
        },
        onTrackStarted: (track: MediaStreamTrack, participant?: PipecatParticipant) => {
          if (track.kind !== "audio") return;
          if (participant?.local) {
            void stopVoiceLevelMonitor().then(() => {
              const monitorStream = new MediaStream([track]);
              liveStreamRef.current = monitorStream;
              startVoiceLevelMonitor(monitorStream);
            });
            return;
          }
          const audio = pipecatAudioRef.current ?? new Audio();
          audio.autoplay = true;
          audio.srcObject = new MediaStream([track]);
          pipecatAudioRef.current = audio;
          void audio.play().catch(() => {
            setActivityStatus("Pipecat audio is ready, but the browser blocked autoplay. Click the page once and try again.");
          });
        },
        onLocalAudioLevel: (level) => {
          const now = performance.now();
          if (now - liveLastLevelUiAtRef.current < 80) return;
          liveLastLevelUiAtRef.current = now;

          const normalized = Math.min(1, Math.max(0.03, level > 1 ? level / 100 : level * 8));
          setVoiceLevels((levels) =>
            levels.map((_, index) => {
              const position = levels.length <= 1 ? 0.5 : index / (levels.length - 1);
              const centerLift = 0.35 + Math.sin(position * Math.PI) * 0.65;
              const ripple = 0.78 + Math.sin(now / 95 + index * 0.72) * 0.22;
              return Math.min(1, Math.max(0.03, normalized * centerLift * ripple));
            })
          );
        },
        onError: (message) => {
          setActivityStatus(`Pipecat error: ${JSON.stringify(message)}`);
        },
      },
    });

    pipecatClientRef.current = client;
    await client.connect({
      webrtcRequestParams: {
        endpoint: currentVoiceSettings.liveWebRtcUrl,
        requestData: {
          modelSettings: currentModelSettings,
          voiceSettings: currentVoiceSettings,
        },
      },
    });
  };

  const startLiveVoice = async () => {
    stopSpeech();
    setLiveVoiceEnabled(true);
    liveVoiceEnabledRef.current = true;
    liveTurnStateRef.current = "idle";
    setLiveVoicePhase("idle");
    liveNoiseFloorRef.current = 0.01;
    setLiveVadDebug({ level: 0, threshold: 0, floor: 0 });
    liveCaptureArmedRef.current = false;
    liveSpeechStartedRef.current = false;
    liveAutoStopInFlightRef.current = false;
    clearPipecatFallbackTimer();
    pipecatPendingTranscriptRef.current = "";
    pipecatFallbackInFlightRef.current = false;
    liveUserSpeakingRef.current = false;
    liveMicMutedRef.current = false;
    setLiveMicMuted(false);
    setLiveTranscript("");
    setLiveMetrics(null);
    setInputMode("voice");
    setActivityStatus("Starting live voice sidecar session...");

    try {
      if (voiceSettings.liveTransport === "small-webrtc" || voiceSettings.liveTransport === "webrtc") {
        await connectPipecatLiveVoice();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStreamRef.current = stream;
      startVoiceLevelMonitor(stream);
      await connectLiveVoice(stream);
      setLiveVoiceRecording(false);
    } catch (error) {
    setLiveVoiceEnabled(false);
    liveVoiceEnabledRef.current = false;
    liveTurnStateRef.current = "idle";
    setLiveVoicePhase("idle");
    setLiveVadDebug({ level: 0, threshold: 0, floor: 0 });
    setLiveVoiceConnected(false);
      setLiveVoiceRecording(false);
      await stopVoiceLevelMonitor();
      setActivityStatus(formatMicrophoneError(error));
    }
  };

  const stopLiveVoiceTurn = async () => {
    if (pipecatClientRef.current) {
      flushLiveVoiceTurn();
      return;
    }
    await finishLiveVoiceTurn("manual");
  };

  const setLiveMicMutedState = (muted: boolean) => {
    liveMicMutedRef.current = muted;
    setLiveMicMuted(muted);

    if (pipecatClientRef.current) {
      pipecatClientRef.current.enableMic(!muted);
      const localTrack = pipecatClientRef.current.tracks().local?.audio;
      if (localTrack) localTrack.enabled = !muted;
    }

    liveStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });

    if (muted) {
      clearPipecatFallbackTimer();
      liveUserSpeakingRef.current = false;
      setLiveVoiceRecording(false);
      setVoiceLevels(Array(32).fill(0.05));
      setActivityStatus("Live mic muted. Sophia will not hear room noise.");
      return;
    }

    setActivityStatus("Live mic unmuted. Start talking when ready.");
  };

  const toggleLiveMicMuted = () => {
    setLiveMicMutedState(!liveMicMutedRef.current);
  };

  const cancelLiveVoice = async () => {
    liveRecorderRef.current?.stop();
    liveRecorderRef.current = null;
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
    if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
      liveSocketRef.current.send(JSON.stringify({ type: "cancel" }));
    }
    liveSocketRef.current?.close();
    liveSocketRef.current = null;
    if (pipecatClientRef.current) {
      await pipecatClientRef.current.disconnect().catch(() => undefined);
      pipecatClientRef.current = null;
    }
    if (pipecatAudioRef.current) {
      pipecatAudioRef.current.pause();
      pipecatAudioRef.current.srcObject = null;
      pipecatAudioRef.current = null;
    }
    clearSpeechAudioSource();
    clearPipecatFallbackTimer();
    pipecatPendingTranscriptRef.current = "";
    pipecatFallbackInFlightRef.current = false;
    liveUserSpeakingRef.current = false;
    setLiveMicMutedState(false);
    setLiveVoiceEnabled(false);
    liveVoiceEnabledRef.current = false;
    liveTurnStateRef.current = "idle";
    setLiveVoicePhase("idle");
    setLiveVadDebug({ level: 0, threshold: 0, floor: 0 });
    liveCaptureArmedRef.current = false;
    liveSpeechStartedRef.current = false;
    liveAutoStopInFlightRef.current = false;
    setLiveVoiceConnected(false);
    setLiveVoiceRecording(false);
    setLiveTranscript("");
    await stopVoiceLevelMonitor();
    setActivityStatus("Live voice cancelled.");
  };

  const toggleLiveVoice = async () => {
    if (liveVoiceEnabled) {
      await cancelLiveVoice();
      return;
    }

    await startLiveVoice();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/"));
    const otherFiles = selectedFiles.filter((file) => !file.type.startsWith("image/"));

    if (imageFiles.length) {
      const currentImageCount = pendingAttachments.filter(
        (attachment) => attachment.kind === "image"
      ).length;
      const remainingSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentImageCount);
      const acceptedImages = imageFiles.slice(0, remainingSlots);
      const oversizedImages = acceptedImages.filter(
        (file) => file.size > MAX_IMAGE_ATTACHMENT_BYTES
      );
      const readableImages = acceptedImages.filter(
        (file) => file.size <= MAX_IMAGE_ATTACHMENT_BYTES
      );

      if (readableImages.length) {
        try {
          setActivityStatus("Loading image preview...");
          const attachments = await Promise.all(
            readableImages.map(async (file) => {
              const normalizedImage = await fileToModelImageDataUrl(file);
              return {
                id: generateId(),
                name: file.name,
                mediaType: normalizedImage.mediaType,
                dataUrl: normalizedImage.dataUrl,
                size: normalizedImage.size,
                kind: "image" as const,
              };
            })
          );
          setPendingAttachments((current) => [...current, ...attachments]);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not read image.";
          setActivityStatus(`Image attach failed: ${message}`);
          return;
        }
      }

      if (imageFiles.length > acceptedImages.length) {
        setActivityStatus(`Attached ${readableImages.length} image(s). UVB keeps up to ${MAX_IMAGE_ATTACHMENTS} at once.`);
      } else if (oversizedImages.length) {
        setActivityStatus("Some images were over 8 MB and were skipped.");
      } else if (readableImages.length) {
        setActivityStatus("Image attached. Send it, or add a note first.");
      }
    }

    if (!otherFiles.length) return;

    const summaries = otherFiles.map((file) => {
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      return `[Attached ${file.type || "file"}: ${file.name}, ${sizeKb} KB]`;
    });

    setInput((current) => [current.trim(), ...summaries].filter(Boolean).join("\n"));
    setActivityStatus("Attachment noted. Vision/file routing is staged in chat context.");
  };

  const openAttachmentPicker = (accept: string) => {
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  const speechControls = hasSpeechReady ? (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-uvb-steel-blue/30 bg-uvb-matte-black/70 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur">
      <span className="text-xs font-medium text-uvb-text-secondary">
        Spoken reply
      </span>
      <div className="flex items-center gap-1">
        {isSpeechPaused || !isSpeaking ? (
          <button
            onClick={resumeSpeech}
            title="Resume spoken reply"
            aria-label="Resume spoken reply"
            className="rounded-lg border border-uvb-neon-green/30 bg-uvb-neon-green/10 p-1.5 text-uvb-neon-green hover:bg-uvb-neon-green/20"
          >
            <PlayIcon className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={pauseSpeech}
            title="Pause spoken reply"
            aria-label="Pause spoken reply"
            className="rounded-lg border border-uvb-border/40 p-1.5 text-uvb-text-secondary hover:bg-uvb-light-gray/30"
          >
            <PauseIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={replaySpeech}
          title="Replay spoken reply from the beginning"
          aria-label="Replay spoken reply"
          className="rounded-lg border border-uvb-accent-yellow/30 p-1.5 text-uvb-accent-yellow hover:bg-uvb-accent-yellow/10"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
        <button
          onClick={stopSpeech}
          title="Stop spoken reply"
          aria-label="Stop spoken reply"
          className="rounded-lg border border-red-400/30 p-1.5 text-red-300 hover:bg-red-500/10"
        >
          <SpeakerXMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <input
        type="range"
        min="0"
        max={speechDuration || 1}
        step="0.1"
        value={Math.min(speechProgress, speechDuration || 1)}
        onChange={(event) => seekSpeech(Number(event.target.value))}
        title="Seek spoken reply"
        aria-label="Seek spoken reply"
        className="min-w-40 flex-1 accent-uvb-neon-green"
      />
      <span className="text-[11px] text-uvb-text-muted">
        {Math.floor(speechProgress)}s / {Math.floor(speechDuration || 0)}s
      </span>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {/* Thread sidebar */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Thread list */}
        <div className="relative w-64 border-r border-uvb-border/40 flex flex-col flex-shrink-0">
          <div className="p-3">
            <button
              onClick={createNewThread}
              title="Start a new conversation"
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg btn-primary text-sm"
            >
              <PlusIcon className="w-4 h-4" />
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-1">
            {threads.map((thread) => (
              <motion.div
                key={thread.id}
                className={`group relative rounded-lg text-sm transition-colors ${
                  activeThreadId === thread.id
                    ? "bg-uvb-deep-teal/30 text-uvb-text-primary border border-uvb-neon-green/10"
                    : "text-uvb-text-secondary hover:bg-uvb-light-gray/30 hover:text-uvb-text-primary"
                }`}
                whileHover={{ x: 2 }}
              >
                {editingThreadId === thread.id ? (
                  <div className="flex items-center gap-1 p-2">
                    <input
                      value={editingThreadTitle}
                      onChange={(event) => setEditingThreadTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveRenameThread(thread.id);
                        if (event.key === "Escape") cancelRenameThread();
                      }}
                      aria-label="Chat name"
                      className="min-w-0 flex-1 rounded-md border border-uvb-border/40 bg-uvb-matte-black/70 px-2 py-1 text-xs text-uvb-text-primary outline-none focus:border-uvb-neon-green/40"
                      autoFocus
                    />
                    <button
                      onClick={() => saveRenameThread(thread.id)}
                      title="Save chat name"
                      aria-label="Save chat name"
                      className="rounded-md p-1 text-uvb-neon-green hover:bg-uvb-neon-green/10"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={cancelRenameThread}
                      title="Cancel rename"
                      aria-label="Cancel rename"
                      className="rounded-md p-1 text-uvb-text-muted hover:bg-uvb-light-gray/30 hover:text-uvb-text-secondary"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveThread(thread.id)}
                      title={`Open ${thread.title || "New Conversation"}`}
                      className="w-full min-w-0 px-3 py-2 pr-16 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 flex-shrink-0 text-uvb-text-muted" />
                        <span className="truncate">{thread.title}</span>
                      </div>
                      <span className="text-[10px] text-uvb-text-muted block mt-0.5">
                        {timestampToDate(thread.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          beginRenameThread(thread);
                        }}
                        title="Rename chat"
                        aria-label="Rename chat"
                        className="rounded-md border border-uvb-border/30 bg-uvb-matte-black/70 p-1 text-uvb-text-muted hover:border-uvb-neon-green/30 hover:text-uvb-neon-green"
                      >
                        <PencilSquareIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          removeThread(thread.id, thread.title);
                        }}
                        title="Delete chat"
                        aria-label="Delete chat"
                        className="rounded-md border border-uvb-border/30 bg-uvb-matte-black/70 p-1 text-uvb-text-muted hover:border-red-400/30 hover:text-red-300"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            ))}
            {threads.length === 0 && (
              <div className="px-3 py-8 text-center">
                <Bot className="w-8 h-8 mx-auto mb-2 text-uvb-text-muted" />
                <p className="text-xs text-uvb-text-muted">
                  Start a conversation with KnightBot
                </p>
              </div>
            )}
          </div>
          {activeThread && activeThread.messages.length > 0 && (
            <div className="pointer-events-none fixed bottom-24 left-[14.25rem] z-30">
              <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-uvb-neon-green/20 bg-uvb-deep-teal/25 p-1 shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  onClick={scrollMessagesToTop}
                  title="Jump to the top of this chat"
                  aria-label="Jump to the top of this chat"
                  className="rounded-md p-1.5 text-uvb-text-secondary transition-colors hover:bg-uvb-neon-green/10 hover:text-uvb-neon-green"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={scrollMessagesToBottom}
                  title="Jump to the latest message"
                  aria-label="Jump to the latest message"
                  className="rounded-md p-1.5 text-uvb-text-secondary transition-colors hover:bg-uvb-neon-green/10 hover:text-uvb-neon-green"
                >
                  <ArrowDownIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden px-4 py-2 border-b border-uvb-border/30 bg-uvb-dark-gray/40 text-[11px] text-uvb-text-muted">
            {chatConfig ? (
              <>
                <span
                  className={
                    chatConfig.connected
                      ? "text-uvb-neon-green/90"
                      : "text-uvb-accent-yellow/90"
                  }
                >
                  {chatConfig.connected ? "Local model connected" : "Local model unavailable"}
                </span>
                <span>{chatConfig.model}</span>
                <span>{chatConfig.baseUrl}</span>
                {chatConfig.error && <span>{chatConfig.error}</span>}
              </>
            ) : (
              <span>Checking local model bridge...</span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden border-b border-uvb-border/20 bg-uvb-matte-black/30 px-4 py-2 text-[11px]">
            <span className="min-w-0 truncate text-uvb-text-secondary">{activityStatus}</span>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={toggleLiveVoice}
                title={
                  liveVoiceEnabled
                    ? "Disconnect the live voice sidecar"
                    : "Start live sidecar voice mode"
                }
                aria-label={liveVoiceEnabled ? "Disconnect live voice" : "Start live voice"}
                className={`rounded-full border px-2 py-0.5 ${
                  liveVoiceEnabled
                    ? "border-uvb-neon-green/40 bg-uvb-neon-green/10 text-uvb-neon-green"
                    : "border-uvb-border/40 text-uvb-text-secondary hover:bg-uvb-light-gray/20"
                }`}
              >
                {liveVoiceEnabled
                  ? liveMicMuted
                    ? "Mic muted"
                    : liveVoiceConnected
                    ? "Live voice on"
                    : "Live connecting"
                  : "Live voice"}
              </button>
              {liveMetrics && (
                <span
                  className="rounded-full border border-uvb-steel-blue/30 px-2 py-0.5 text-uvb-text-muted"
                  title={`Transport: ${liveMetrics.transport ?? voiceSettings.liveTransport} | STT: ${
                    liveMetrics.sttProvider ?? voiceSettings.liveSttProvider
                  } | TTS: ${liveMetrics.ttsProvider ?? voiceSettings.liveTtsProvider} | VAD: ${
                    liveMetrics.vadProvider ?? voiceSettings.liveVadProvider
                  }`}
                >
                  {liveMetrics.totalMs ?? "-"}ms turn ·{" "}
                  {liveMetrics.ttsProvider ?? voiceSettings.liveTtsProvider}
                </span>
              )}
              {voiceSettings.autoSpeak && (
                <span className="rounded-full border border-uvb-neon-green/20 px-2 py-0.5 text-uvb-neon-green/80">
                  Speak replies on
                </span>
              )}
              {lastFailedInput && (
                <button
                  onClick={() => sendMessageWithText(lastFailedInput, "text")}
                  title="Retry the last failed prompt"
                  className="rounded-full border border-uvb-accent-yellow/40 px-2 py-0.5 text-uvb-accent-yellow hover:bg-uvb-accent-yellow/10"
                >
                  Retry last
                </button>
              )}
              {isTyping && (
                <button
                  onClick={stopChatGeneration}
                  title="Stop the current model response"
                  className="rounded-full border border-red-400/40 px-2 py-0.5 text-red-300 hover:bg-red-500/10"
                >
                  Stop response
                </button>
              )}
            </div>
          </div>
          {/* Messages */}
          <div ref={messagesScrollerRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6">
            <div ref={messagesTopRef} aria-hidden="true" />
            <div className="space-y-6">
            {!activeThread || activeThread.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <motion.div
                  className="w-20 h-20 rounded-2xl bg-gradient-to-br from-uvb-deep-teal to-uvb-steel-blue flex items-center justify-center mb-6"
                  animate={{
                    boxShadow: [
                      "0 0 20px rgba(57,255,20,0.1)",
                      "0 0 40px rgba(57,255,20,0.2)",
                      "0 0 20px rgba(57,255,20,0.1)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Bot className="w-10 h-10 text-uvb-neon-green" />
                </motion.div>
                <h3 className="text-xl font-semibold mb-2 font-[family-name:var(--font-display)] text-uvb-text-primary">
                  KnightBot AI Assistant
                </h3>
                <p className="text-sm text-uvb-text-secondary max-w-md mb-8">
                  Your multi-modal AI companion. Ask questions, analyze media,
                  process voice, and more.
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-lg">
                  {[
                    { icon: "🧠", label: "Long-form reasoning", desc: "Deep analysis" },
                    { icon: "🎤", label: "Voice analysis", desc: "Audio processing" },
                    { icon: "👁️", label: "Vision analytics", desc: "Image understanding" },
                    { icon: "🌐", label: "Browser use", desc: "Web interaction" },
                  ].map((feat) => (
                    <button
                      key={feat.label}
                      className="text-left p-3 rounded-lg bg-uvb-dark-gray/50 border border-uvb-border/30 hover:border-uvb-neon-green/20 transition-all"
                      onClick={() => setInput(`Tell me about ${feat.label.toLowerCase()}`)}
                      title={`Ask about ${feat.label.toLowerCase()}`}
                    >
                      <span className="text-lg">{feat.icon}</span>
                      <p className="text-sm font-medium text-uvb-text-primary mt-1">
                        {feat.label}
                      </p>
                      <p className="text-xs text-uvb-text-muted">{feat.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {activeThread.messages.map((msg, index) => {
                  const role = safeMessageRole(msg.role);
                  const content = safeDisplayText(msg.content);
                  const messageId = safeDisplayText(msg.id) || `message-${index}`;
                  const imageAttachments =
                    msg.attachments?.filter((attachment) => attachment.kind === "image") ?? [];
                  const hideDefaultImagePrompt =
                    role === "user" &&
                    imageAttachments.length > 0 &&
                    content === DEFAULT_IMAGE_PROMPT;

                  return (
                  <div
                    key={index}
                    className={`flex w-full min-w-0 gap-4 ${
                      role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`min-w-0 max-w-[min(70%,52rem)] overflow-hidden rounded-2xl px-4 py-3 ${
                        role === "user"
                          ? "bg-uvb-deep-teal/40 border border-uvb-deep-teal/40 text-uvb-text-primary"
                          : "bg-uvb-dark-gray/60 border border-uvb-border/30 text-uvb-text-primary"
                      }`}
                    >
                      {content && !hideDefaultImagePrompt && (
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                          {content}
                        </p>
                      )}
                      {imageAttachments.length > 0 && (
                        <div className={content && !hideDefaultImagePrompt ? "mt-3 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
                          {imageAttachments.map((attachment) => (
                            <button
                              type="button"
                              key={attachment.id}
                              onClick={() => attachment.dataUrl && setExpandedImage(attachment)}
                              disabled={!attachment.dataUrl}
                              title={`Open ${attachment.name}`}
                              className="group block overflow-hidden rounded-lg border border-uvb-border/40 bg-uvb-matte-black/60"
                            >
                              {attachment.dataUrl ? (
                                <Image
                                  src={attachment.dataUrl}
                                  alt={attachment.name}
                                  width={96}
                                  height={96}
                                  unoptimized
                                  className="h-24 w-24 object-cover transition-transform group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-24 w-24 items-center justify-center px-2 text-center text-[10px] text-uvb-text-muted">
                                  Image not stored
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden">
                        <span className="text-[10px] text-uvb-text-muted">
                          {timestampToDate(msg.timestamp).toLocaleTimeString()}
                        </span>
                        {role === "assistant" && (
                          <div className="flex flex-shrink-0 gap-1">
                            <button
                              onClick={() => replayMessageSpeech(content)}
                              title="Play this response"
                              aria-label="Play this response"
                              className="rounded p-1 text-uvb-text-muted transition-colors hover:bg-uvb-light-gray/40 hover:text-uvb-neon-green"
                            >
                              <PlayIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => copyText(content)}
                              title="Copy response"
                              aria-label="Copy response"
                              className="rounded p-1 text-uvb-text-muted transition-colors hover:bg-uvb-light-gray/40 hover:text-uvb-text-secondary"
                            >
                              <ClipboardDocumentIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => regenerateFromMessage(messageId)}
                              title="Regenerate from the previous prompt"
                              aria-label="Regenerate from the previous prompt"
                              className="rounded p-1 text-uvb-text-muted transition-colors hover:bg-uvb-light-gray/40 hover:text-uvb-text-secondary"
                            >
                              <ArrowPathIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => branchFromMessage(messageId)}
                              title="Branch conversation from here"
                              aria-label="Branch conversation from here"
                              className="rounded p-1 text-uvb-text-muted transition-colors hover:bg-uvb-light-gray/40 hover:text-uvb-text-secondary"
                            >
                              <ArrowUturnRightIcon className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => toggleBookmark(msg)}
                              title={msg.bookmarked ? "Remove bookmark" : "Bookmark response"}
                              aria-label={msg.bookmarked ? "Remove bookmark" : "Bookmark response"}
                              className={`rounded p-1 transition-colors hover:bg-uvb-light-gray/40 ${
                                msg.bookmarked
                                  ? "text-uvb-accent-yellow"
                                  : "text-uvb-text-muted hover:text-uvb-text-secondary"
                              }`}
                            >
                              <BookmarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex w-full min-w-0 gap-4">
                <div className="min-w-0 rounded-2xl border border-uvb-border/30 bg-uvb-dark-gray/60 px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-uvb-neon-green/60"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1,
                          delay: i * 0.15,
                          repeat: Infinity,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="min-w-0 overflow-hidden border-t border-uvb-border/40 p-4">
            {speechControls}
            {(isRecording || isTranscribing || liveVoiceEnabled) && (
              <div className="mb-3 flex min-w-0 items-center gap-3 overflow-hidden rounded-lg bg-uvb-deep-teal/20 border border-uvb-neon-green/20 p-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    liveVoiceConnected || isRecording ? "bg-red-500 status-pulse" : "bg-uvb-accent-yellow"
                  }`}
                />
                <span className="text-sm text-uvb-text-secondary">
                  {liveVoiceEnabled
                    ? liveMicMuted
                      ? "Live mic muted."
                      : liveVoicePhase === "listening"
                      ? "Live voice listening..."
                      : liveVoicePhase === "processing"
                      ? "Live voice processing..."
                      : liveVoicePhase === "speaking"
                      ? "Sophia is speaking. Start talking to barge in."
                      : "Live voice armed. Start talking."
                    : isTranscribing
                    ? "Transcribing..."
                    : "Recording..."}
                </span>
                <VoiceVisualizer isActive={isRecording || liveVoiceRecording} levels={voiceLevels} />
                {liveTranscript && (
                  <span className="max-w-sm truncate text-xs text-uvb-text-muted">
                    {liveTranscript}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {liveVoiceEnabled && (
                    <>
                      <button
                        onClick={toggleLiveMicMuted}
                        title={
                          liveMicMuted
                            ? "Unmute the live microphone"
                            : "Mute the live microphone so room noise does not interrupt Sophia"
                        }
                        aria-label={liveMicMuted ? "Unmute live microphone" : "Mute live microphone"}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          liveMicMuted
                            ? "border-uvb-accent-yellow/40 bg-uvb-accent-yellow/10 text-uvb-accent-yellow"
                            : "border-uvb-border/40 text-uvb-text-secondary hover:bg-uvb-light-gray/20"
                        }`}
                      >
                        {liveMicMuted ? "Unmute mic" : "Mute mic"}
                      </button>
                      {liveVoiceRecording && voiceSettings.liveTransport === "websocket" && (
                        <button
                          onClick={stopLiveVoiceTurn}
                          title="Force-send this live voice turn now"
                          aria-label="Stop live voice and answer"
                          className="rounded-lg border border-uvb-neon-green/30 bg-uvb-neon-green/10 px-3 py-1.5 text-xs text-uvb-neon-green hover:bg-uvb-neon-green/20"
                        >
                          Send turn now
                        </button>
                      )}
                      <button
                        onClick={cancelLiveVoice}
                        title="Cancel live voice mode and close the sidecar connection"
                        aria-label="Cancel live voice mode"
                        className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        End live
                      </button>
                    </>
                  )}
                  {isRecording && (
                    <>
                      <button
                        onClick={() => stopRecording("send")}
                        title="Stop recording, transcribe, and send immediately"
                        aria-label="Stop recording, transcribe, and send immediately"
                        className="rounded-lg border border-uvb-neon-green/30 bg-uvb-neon-green/10 px-3 py-1.5 text-xs text-uvb-neon-green hover:bg-uvb-neon-green/20"
                      >
                        Send now
                      </button>
                      <button
                        onClick={() => stopRecording("edit")}
                        title="Stop recording and place transcript in the input for editing"
                        aria-label="Stop recording and place transcript in the input for editing"
                        className="rounded-lg border border-uvb-neon-green/30 px-3 py-1.5 text-xs text-uvb-neon-green hover:bg-uvb-neon-green/10"
                      >
                        Stop & edit
                      </button>
                      <button
                        onClick={cancelRecording}
                        title="Cancel recording without sending"
                        aria-label="Cancel recording without sending"
                        className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex gap-1">
                <button
                  onClick={() => setInputMode("text")}
                  title="Text input mode"
                  aria-label="Text input mode"
                  className={`p-2 rounded-lg transition-colors ${
                    inputMode === "text"
                      ? "bg-uvb-deep-teal/30 text-uvb-neon-green"
                      : "text-uvb-text-muted hover:text-uvb-text-secondary"
                  }`}
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleRecording}
                  className={`p-2 rounded-lg transition-colors ${
                    inputMode === "voice"
                      ? "bg-uvb-deep-teal/30 text-uvb-neon-green"
                      : "text-uvb-text-muted hover:text-uvb-text-secondary"
                  }`}
                  title={isRecording ? "Stop recording and edit transcript" : "Record voice message"}
                  aria-label={isRecording ? "Stop recording" : "Record voice"}
                >
                  {isRecording ? <StopIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleLiveVoice}
                  className={`p-2 rounded-lg transition-colors ${
                    liveVoiceEnabled
                      ? "bg-uvb-neon-green/15 text-uvb-neon-green ring-1 ring-uvb-neon-green/30"
                      : "text-uvb-text-muted hover:text-uvb-text-secondary"
                  }`}
                  title={
                    liveVoiceEnabled
                      ? "End live sidecar voice mode"
                      : "Start live sidecar voice mode"
                  }
                  aria-label={liveVoiceEnabled ? "End live voice" : "Start live voice"}
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 relative">
                {pendingAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pendingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="group relative overflow-hidden rounded-lg border border-uvb-border/40 bg-uvb-matte-black/70"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedImage(attachment)}
                          title={`Open ${attachment.name}`}
                          className="block"
                        >
                          {attachment.dataUrl ? (
                            <Image
                              src={attachment.dataUrl}
                              alt={attachment.name}
                              width={64}
                              height={64}
                              unoptimized
                              className="h-16 w-16 object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center px-1 text-center text-[9px] text-uvb-text-muted">
                              Image not stored
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() =>
                            setPendingAttachments((current) =>
                              current.filter((item) => item.id !== attachment.id)
                            )
                          }
                          title={`Remove ${attachment.name}`}
                          aria-label={`Remove ${attachment.name}`}
                          className="absolute right-1 top-1 rounded-full bg-uvb-matte-black/80 p-0.5 text-uvb-text-muted opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                        >
                          <XMarkIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message KnightBot..."
                  className="input-field resize-none min-h-[44px] max-h-32 pr-12"
                  rows={1}
                />
                <div className="absolute right-2 bottom-2 flex gap-1">
                  <button
                    onClick={() => openAttachmentPicker("image/*")}
                    className="p-1 rounded text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
                    title="Attach an image"
                    aria-label="Attach image"
                  >
                    <PhotoIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openAttachmentPicker("video/*,audio/*,.pdf,.txt,.md,.json,.csv")}
                    className="p-1 rounded text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
                    title="Attach media or file"
                    aria-label="Attach media or file"
                  >
                    <FilmIcon className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void attachFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
              <button
                onClick={sendMessage}
                disabled={!input.trim() && !pendingAttachments.length && !isRecording}
                title={isTyping ? "KnightBot is responding" : "Send message"}
                aria-label="Send message"
                className="p-3 rounded-lg btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      {expandedImage?.dataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-uvb-matte-black/90 p-6 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-label={expandedImage.name}
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpandedImage(null)}
              title="Close image preview"
              aria-label="Close image preview"
              className="absolute -right-3 -top-3 z-10 rounded-full border border-uvb-border/50 bg-uvb-dark-gray p-1.5 text-uvb-text-secondary shadow-lg hover:text-red-300"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
            <Image
              src={expandedImage.dataUrl}
              alt={expandedImage.name}
              width={1200}
              height={900}
              unoptimized
              className="max-h-[85vh] w-auto max-w-[85vw] rounded-lg border border-uvb-border/40 object-contain shadow-2xl"
            />
            <div className="mt-2 truncate text-center text-xs text-uvb-text-muted">
              {expandedImage.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
