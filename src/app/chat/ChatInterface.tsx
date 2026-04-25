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
  ChevronDownIcon,
  PhotoIcon,
  FilmIcon,
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
  settings: ModelSettings
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, settings }),
  });
  const data = (await response.json()) as { content?: string; error?: string };

  if (!response.ok || !data.content) {
    throw new Error(data.error ?? "The local model did not return a response.");
  }

  return data.content;
}

export default function ChatInterface() {
  const { threads, activeThreadId, addThread, addMessage, setActiveThread, isRecording, setIsRecording } =
    useAppStore();
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "voice">("text");
  const [modelSettings, setModelSettings] = useState<ModelSettings>(() => loadModelSettings());
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => loadVoiceSettings());
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);
  const [activityStatus, setActivityStatus] = useState("Ready for text, voice, and media.");
  const [lastFailedInput, setLastFailedInput] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    audioPlayerRef.current.onended = () => URL.revokeObjectURL(audioUrl);
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
      ], modelSettings);
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

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
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

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setActivityStatus("Transcribing with local Whisper...");

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const transcript = await transcribeAudio(audioBlob);
          setInput(transcript);
          setActivityStatus("Transcript ready. Sending to KnightBot...");
          await sendMessageWithText(transcript, "voice");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Voice transcription failed.";
          setActivityStatus(`STT error: ${message}`);
        }
      };

      recorder.start();
      setIsRecording(true);
      setActivityStatus("Recording voice...");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone access failed.";
      setIsRecording(false);
      setActivityStatus(`Mic error: ${message}`);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    await startRecording();
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
              {voiceSettings.autoSpeak && (
                <span className="rounded-full border border-uvb-neon-green/20 px-2 py-0.5 text-uvb-neon-green/80">
                  Speak replies on
                </span>
              )}
              {lastFailedInput && (
                <button
                  onClick={() => sendMessageWithText(lastFailedInput, "text")}
                  className="rounded-full border border-uvb-accent-yellow/40 px-2 py-0.5 text-uvb-accent-yellow hover:bg-uvb-accent-yellow/10"
                >
                  Retry last
                </button>
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
                            <button className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors">
                              <DocumentDuplicateIcon className="w-3 h-3" />
                            </button>
                            <button className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors">
                              <ArrowPathIcon className="w-3 h-3" />
                            </button>
                            <button className="p-0.5 rounded hover:bg-uvb-light-gray/40 text-uvb-text-muted hover:text-uvb-text-secondary transition-colors">
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
            {isRecording && (
              <div className="mb-3 flex items-center gap-3 p-3 rounded-lg bg-uvb-deep-teal/20 border border-uvb-neon-green/20">
                <div className="w-3 h-3 rounded-full bg-red-500 status-pulse" />
                <span className="text-sm text-uvb-text-secondary">
                  Recording...
                </span>
                <VoiceVisualizer isActive={true} />
                <button
                  onClick={stopRecording}
                  className="ml-auto p-1.5 rounded-lg hover:bg-uvb-light-gray/40 text-uvb-text-secondary"
                >
                  <StopIcon className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-3">
              <div className="flex gap-1">
                <button
                  onClick={() => setInputMode("text")}
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
                  aria-label={isRecording ? "Stop recording" : "Record voice"}
                >
                  {isRecording ? <StopIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
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
                    aria-label="Attach image"
                  >
                    <PhotoIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openAttachmentPicker("video/*,audio/*,.pdf,.txt,.md,.json,.csv")}
                    className="p-1 rounded text-uvb-text-muted hover:text-uvb-text-secondary transition-colors"
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
