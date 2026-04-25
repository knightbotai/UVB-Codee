"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type ChatMessage } from "@/stores/appStore";
import {
  PaperAirplaneIcon,
  MicrophoneIcon,
  StopIcon,
  PlusIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  BookmarkIcon,
  PhotoIcon,
  FilmIcon,
  PlayIcon,
  PauseIcon,
  SpeakerXMarkIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { Bot, User, Sparkles } from "lucide-react";
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
  messages: Array<{ role: "user" | "assistant"; content: string }>,
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
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveMetrics, setLiveMetrics] = useState<{
    sttMs?: number;
    llmMs?: number;
    ttsMs?: number;
    totalMs?: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const liveRecorderRef = useRef<MediaRecorder | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceFrameRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const recordingActionRef = useRef<"edit" | "send">("edit");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId);

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
      liveSocketRef.current?.close();
      liveRecorderRef.current?.stop();
      liveStreamRef.current?.getTracks().forEach((track) => track.stop());
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

    await sendMessageWithText(previousUserMessage.content, previousUserMessage.type);
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
    audioPlayerRef.current.pause();
    audioPlayerRef.current.currentTime = 0;
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    setSpeechProgress(0);
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

  const speakText = async (text: string) => {
    if (!voiceSettings.autoSpeak || !text.trim()) return;

    setActivityStatus("Speaking with Kokoro...");
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
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
      URL.revokeObjectURL(audioUrl);
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setSpeechProgress(0);
      setActivityStatus("Ready.");
    };
    await audioPlayerRef.current.play();
  };

  const sendMessageWithText = async (userInput: string, messageType: ChatMessage["type"] = "text") => {
    if (!userInput.trim()) return;

    let threadId = activeThreadId;
    if (!threadId) {
      const thread = {
        id: generateId(),
        title: userInput.slice(0, 40) + (userInput.length > 40 ? "..." : ""),
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
      content: userInput,
      timestamp: Date.now(),
      type: messageType,
    };
    addMessage(threadId!, userMsg);
    setInput("");
    setIsTyping(true);
    setLastFailedInput(null);
    setActivityStatus("Thinking through the local model...");
    chatAbortRef.current?.abort();
    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    const currentThread = useAppStore.getState().threads.find((thread) => thread.id === threadId);
    const priorMessages: Array<{ role: "user" | "assistant"; content: string }> =
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
        { role: "user", content: userInput },
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
      addMessage(threadId!, {
        id: generateId(),
        role: "assistant",
        content: `The local model bridge failed cleanly instead of pretending with demo text.\n\n${message}\n\nCheck Settings > AI Settings or the health badge in the top-right.`,
        timestamp: Date.now(),
        type: "text",
      });
      setLastFailedInput(userInput);
      setActivityStatus("Model failed. Settings or service health need attention.");
    } finally {
      if (chatAbortRef.current === abortController) {
        chatAbortRef.current = null;
      }
      setIsTyping(false);
    }
  };

  const sendMessage = async () => {
    await sendMessageWithText(input, "text");
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("file", audioBlob, "uvb-recording.webm");
    formData.append("endpoint", voiceSettings.sttUrl);
    formData.append("model", voiceSettings.sttModel);

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
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      const bucketSize = Math.max(1, Math.floor(buffer.length / 32));
      const nextLevels = Array.from({ length: 32 }, (_, index) => {
        const start = index * bucketSize;
        const slice = buffer.slice(start, start + bucketSize);
        const average = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
        return Math.max(0.04, Math.min(1, average / 180));
      });
      setVoiceLevels(nextLevels);
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
      URL.revokeObjectURL(audioUrl);
      setIsSpeaking(false);
      setIsSpeechPaused(false);
      setSpeechProgress(0);
      setActivityStatus("Live voice ready.");
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
    };

    if (data.type === "ready") {
      setLiveVoiceConnected(true);
      setActivityStatus(data.message ?? "Live voice connected.");
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
      });
      setActivityStatus(
        `Live turn complete: STT ${data.sttMs ?? "-"}ms | LLM ${
          data.llmMs ?? "-"
        }ms | TTS ${data.ttsMs ?? "-"}ms`
      );
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
      setActivityStatus("Live voice connected. Listening...");
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
      if (!event.data.size || socket.readyState !== WebSocket.OPEN) return;
      void blobToBase64(event.data).then((data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "audio", data }));
        }
      });
    };
    recorder.start(500);
  };

  const startLiveVoice = async () => {
    stopSpeech();
    setLiveVoiceEnabled(true);
    setLiveTranscript("");
    setLiveMetrics(null);
    setInputMode("voice");
    setActivityStatus("Starting live voice sidecar session...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStreamRef.current = stream;
      startVoiceLevelMonitor(stream);
      await connectLiveVoice(stream);
      setLiveVoiceRecording(true);
    } catch (error) {
      setLiveVoiceEnabled(false);
      setLiveVoiceConnected(false);
      setLiveVoiceRecording(false);
      await stopVoiceLevelMonitor();
      setActivityStatus(formatMicrophoneError(error));
    }
  };

  const stopLiveVoiceTurn = async () => {
    liveRecorderRef.current?.stop();
    liveRecorderRef.current = null;
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
    setLiveVoiceRecording(false);
    await stopVoiceLevelMonitor();

    if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
      liveSocketRef.current.send(JSON.stringify({ type: "stop" }));
      setActivityStatus("Processing live voice turn...");
    }
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
    setLiveVoiceEnabled(false);
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

  const attachFiles = (files: FileList | null) => {
    if (!files?.length) return;

    const summaries = Array.from(files).map((file) => {
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

  return (
    <div className="flex flex-col h-full">
      {/* Thread sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Thread list */}
        <div className="w-64 border-r border-uvb-border/40 flex flex-col flex-shrink-0">
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
              <motion.button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors truncate ${
                  activeThreadId === thread.id
                    ? "bg-uvb-deep-teal/30 text-uvb-text-primary border border-uvb-neon-green/10"
                    : "text-uvb-text-secondary hover:bg-uvb-light-gray/30 hover:text-uvb-text-primary"
                }`}
                whileHover={{ x: 2 }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 flex-shrink-0 text-uvb-text-muted" />
                  <span className="truncate">{thread.title}</span>
                </div>
                <span className="text-[10px] text-uvb-text-muted block mt-0.5">
                  {new Date(thread.updatedAt).toLocaleDateString()}
                </span>
              </motion.button>
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
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-b border-uvb-border/30 bg-uvb-dark-gray/40 text-[11px] text-uvb-text-muted">
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
          <div className="flex items-center justify-between gap-3 border-b border-uvb-border/20 bg-uvb-matte-black/30 px-4 py-2 text-[11px]">
            <span className="text-uvb-text-secondary">{activityStatus}</span>
            <div className="flex items-center gap-2">
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
                  ? liveVoiceConnected
                    ? "Live voice on"
                    : "Live connecting"
                  : "Live voice"}
              </button>
              {liveMetrics && (
                <span className="rounded-full border border-uvb-steel-blue/30 px-2 py-0.5 text-uvb-text-muted">
                  {liveMetrics.totalMs ?? "-"}ms turn
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
              {hasSpeechReady && (
                <div className="flex items-center gap-1 rounded-full border border-uvb-steel-blue/40 px-1.5 py-0.5">
                  {isSpeechPaused ? (
                    <button
                      onClick={resumeSpeech}
                      title="Resume spoken reply"
                      aria-label="Resume spoken reply"
                      className="rounded-full p-0.5 text-uvb-neon-green hover:bg-uvb-light-gray/40"
                    >
                      <PlayIcon className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={pauseSpeech}
                      title="Pause spoken reply"
                      aria-label="Pause spoken reply"
                      className="rounded-full p-0.5 text-uvb-text-secondary hover:bg-uvb-light-gray/40"
                    >
                      <PauseIcon className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={replaySpeech}
                    title="Replay spoken reply from the beginning"
                    aria-label="Replay spoken reply"
                    className="rounded-full p-0.5 text-uvb-accent-yellow hover:bg-uvb-light-gray/40"
                  >
                    <ArrowPathIcon className="h-3 w-3" />
                  </button>
                  <input
                    type="range"
                    min="0"
                    max={speechDuration || 1}
                    step="0.1"
                    value={Math.min(speechProgress, speechDuration || 1)}
                    onChange={(event) => seekSpeech(Number(event.target.value))}
                    title="Seek spoken reply"
                    aria-label="Seek spoken reply"
                    className="w-24 accent-uvb-neon-green"
                  />
                  <button
                    onClick={stopSpeech}
                    title="Stop spoken reply"
                    aria-label="Stop spoken reply"
                    className="rounded-full p-0.5 text-red-300 hover:bg-red-500/10"
                  >
                    <SpeakerXMarkIcon className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
              <AnimatePresence mode="popLayout">
                {activeThread.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`flex gap-4 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-uvb-deep-teal to-uvb-steel-blue flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-uvb-neon-green" />
                      </div>
                    )}
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-uvb-deep-teal/40 border border-uvb-deep-teal/40 text-uvb-text-primary"
                          : "bg-uvb-dark-gray/60 border border-uvb-border/30 text-uvb-text-primary"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-uvb-text-muted">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                        {msg.role === "assistant" && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => copyText(msg.content)}
                              title="Copy response"
                              aria-label="Copy response"
                              className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
                            >
                              <DocumentDuplicateIcon className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => regenerateFromMessage(msg.id)}
                              title="Regenerate from the previous prompt"
                              aria-label="Regenerate from the previous prompt"
                              className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
                            >
                              <ArrowPathIcon className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => branchFromMessage(msg.id)}
                              title="Branch conversation from here"
                              aria-label="Branch conversation from here"
                              className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
                            >
                              <ArrowUturnLeftIcon className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => toggleBookmark(msg)}
                              title={msg.bookmarked ? "Remove bookmark" : "Bookmark response"}
                              aria-label={msg.bookmarked ? "Remove bookmark" : "Bookmark response"}
                              className={`p-0.5 rounded hover:bg-uvb-light-gray/40 transition-colors ${
                                msg.bookmarked
                                  ? "text-uvb-accent-yellow"
                                  : "text-uvb-text-muted hover:text-uvb-text-secondary"
                              }`}
                            >
                              <BookmarkIcon className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {msg.role === "user" && (
                      <div className="w-9 h-9 rounded-lg bg-uvb-royal-purple/40 border border-uvb-royal-purple/30 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-uvb-brushed-silver" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {/* Typing indicator */}
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-4"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-uvb-deep-teal to-uvb-steel-blue flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5 text-uvb-neon-green" />
                </div>
                <div className="bg-uvb-dark-gray/60 border border-uvb-border/30 rounded-2xl px-4 py-3">
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
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-uvb-border/40">
            {(isRecording || isTranscribing || liveVoiceEnabled) && (
              <div className="mb-3 flex items-center gap-3 p-3 rounded-lg bg-uvb-deep-teal/20 border border-uvb-neon-green/20">
                <div
                  className={`w-3 h-3 rounded-full ${
                    liveVoiceConnected || isRecording ? "bg-red-500 status-pulse" : "bg-uvb-accent-yellow"
                  }`}
                />
                <span className="text-sm text-uvb-text-secondary">
                  {liveVoiceEnabled
                    ? liveVoiceRecording
                      ? "Live voice listening..."
                      : "Live voice processing..."
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
                      {liveVoiceRecording && (
                        <button
                          onClick={stopLiveVoiceTurn}
                          title="Stop listening and send this live voice turn to the sidecar"
                          aria-label="Stop live voice and answer"
                          className="rounded-lg border border-uvb-neon-green/30 bg-uvb-neon-green/10 px-3 py-1.5 text-xs text-uvb-neon-green hover:bg-uvb-neon-green/20"
                        >
                          Stop & answer
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
                      attachFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
              </div>
              <button
                onClick={sendMessage}
                disabled={!input.trim() && !isRecording}
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
    </div>
  );
}
